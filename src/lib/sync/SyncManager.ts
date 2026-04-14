// lib/sync/SyncManager.ts
//
// Incremental backup/sync between IndexedDB (local) and Supabase (remote).
// Per-table algorithm:
//   1. pull remote rows where updated_at > lastSyncAt
//   2. compute conflict set against local rows changed since lastSyncAt
//   3. apply remote rows locally when remote wins (or no local change)
//   4. push remaining local changes (those the remote did not supersede)
//   5. advance lastSyncAt to serverTime returned by pull
//
// All access to Supabase goes through /api/sync/pull and /api/sync/push so
// the service_role key never leaves the server. The session cookie enforces
// that the address column matches the signed-in XRPL address.

import {
  dbManager,
  AddressGroup,
  AddressInfo,
  Project,
  ProjectOwnerValue,
  SyncTable,
} from '@/utils/db';
import { getBackupKey } from './backupKey';
import { decryptJson, encryptJson } from './crypto';

export interface SyncTableResult {
  table: SyncTable;
  uploaded: number;
  downloaded: number;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  tables: SyncTableResult[];
}

type RemoteTable = 'address_groups' | 'addresses' | 'projects' | 'project_owner_values';

const REMOTE_TABLE: Record<SyncTable, RemoteTable> = {
  projects: 'projects',
  addressGroups: 'address_groups',
  addresses: 'addresses',
  projectOwnerValues: 'project_owner_values',
};

interface PullResponse {
  rows: Record<string, unknown>[];
  serverTime: number;
}

interface PushResponse {
  upserted: number;
}

export class SyncManager {
  private running: Promise<SyncResult> | null = null;
  private runningAddress: string | null = null;
  private rerunRequested = false;

  /**
   * Run a full sync for the given XRPL address. If a sync for the same
   * address is in-flight, the concurrent caller receives that promise; a
   * call completing with rerunRequested triggers one additional run so
   * changes that landed during a sync are not silently dropped. A call for
   * a different address waits for the current sync to finish, then runs.
   */
  syncAll(address: string): Promise<SyncResult> {
    if (this.running && this.runningAddress === address) {
      this.rerunRequested = true;
      return this.running;
    }
    if (this.running) {
      // Different address: queue behind the current sync.
      const queued = this.running.then(
        () => this.startRun(address),
        () => this.startRun(address)
      );
      return queued;
    }
    return this.startRun(address);
  }

  private startRun(address: string): Promise<SyncResult> {
    this.runningAddress = address;
    this.running = this.runSyncAll(address).finally(() => {
      this.running = null;
      this.runningAddress = null;
    });
    const current = this.running;
    current.then(() => {
      if (this.rerunRequested) {
        this.rerunRequested = false;
        void this.syncAll(address);
      }
    }).catch(() => {
      this.rerunRequested = false;
    });
    return current;
  }

  private async runSyncAll(address: string): Promise<SyncResult> {
    // Resolve the backup key once per syncAll run. If absent (Xaman cold
    // reload before re-signing), encrypted tables are skipped entirely
    // so we never push plaintext or pull undecryptable rows. The
    // `addresses` table has no encrypted fields, so it can sync without
    // a key.
    const key = await getBackupKey(address);
    const tables: SyncTableResult[] = [];
    tables.push(await this.syncTable(address, 'addressGroups', key));
    tables.push(await this.syncTable(address, 'addresses', key));
    tables.push(await this.syncTable(address, 'projects', key));
    tables.push(await this.syncTable(address, 'projectOwnerValues', key));
    return {
      success: tables.every(t => !t.error),
      tables,
    };
  }

  async syncTable(
    address: string,
    table: SyncTable,
    key: CryptoKey | null
  ): Promise<SyncTableResult> {
    try {
      switch (table) {
        case 'addressGroups':
          if (!key) return { table, uploaded: 0, downloaded: 0, error: 'no backup key' };
          return await this.syncAddressGroups(address, key);
        case 'addresses':
          return await this.syncAddresses(address);
        case 'projects':
          if (!key) return { table, uploaded: 0, downloaded: 0, error: 'no backup key' };
          return await this.syncProjects(address, key);
        case 'projectOwnerValues':
          if (!key) return { table, uploaded: 0, downloaded: 0, error: 'no backup key' };
          return await this.syncProjectOwnerValues(address, key);
      }
    } catch (error) {
      return {
        table,
        uploaded: 0,
        downloaded: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ----- per-table -----

  private async syncAddressGroups(address: string, key: CryptoKey): Promise<SyncTableResult> {
    const table: SyncTable = 'addressGroups';
    const lastSyncAt = await dbManager.getLastSyncAt(address, table);

    const localAll = await dbManager.getAllAddressGroupsIncludingDeleted();
    const localChanges = new Map<string, AddressGroup>();
    for (const row of localAll) {
      if (row.updatedAt > lastSyncAt) localChanges.set(row.id, row);
    }

    const pull = await this.pull(REMOTE_TABLE[table], lastSyncAt);
    let downloaded = 0;
    for (const raw of pull.rows) {
      const remote = await this.fromRemoteAddressGroup(raw, key);
      const local = localChanges.get(remote.id);
      if (!local || remote.updatedAt >= local.updatedAt) {
        await dbManager.upsertAddressGroup(remote);
        downloaded++;
        localChanges.delete(remote.id);
      }
    }

    const toPush = await Promise.all(
      Array.from(localChanges.values()).map(r => this.toRemoteAddressGroup(r, key))
    );
    const uploaded = await this.push(REMOTE_TABLE[table], toPush);

    await dbManager.setLastSyncAt(address, table, pull.serverTime);
    return { table, uploaded, downloaded };
  }

  private async syncAddresses(address: string): Promise<SyncTableResult> {
    const table: SyncTable = 'addresses';
    const lastSyncAt = await dbManager.getLastSyncAt(address, table);

    const localAll = await dbManager.getAllAddressInfosIncludingDeleted();
    const localChanges = new Map<string, AddressInfo>();
    for (const row of localAll) {
      if (row.updatedAt > lastSyncAt) localChanges.set(row.address, row);
    }

    const pull = await this.pull(REMOTE_TABLE[table], lastSyncAt);
    let downloaded = 0;
    for (const raw of pull.rows) {
      const remote = this.fromRemoteAddressInfo(raw);
      const local = localChanges.get(remote.address);
      if (!local || remote.updatedAt >= local.updatedAt) {
        await dbManager.upsertAddressInfo(remote);
        downloaded++;
        localChanges.delete(remote.address);
      }
    }

    const toPush = Array.from(localChanges.values()).map(r => this.toRemoteAddressInfo(r));
    const uploaded = await this.push(REMOTE_TABLE[table], toPush);

    await dbManager.setLastSyncAt(address, table, pull.serverTime);
    return { table, uploaded, downloaded };
  }

  private async syncProjects(address: string, key: CryptoKey): Promise<SyncTableResult> {
    const table: SyncTable = 'projects';
    const lastSyncAt = await dbManager.getLastSyncAt(address, table);

    const localAll = await dbManager.getAllProjectsIncludingDeleted();
    const localChanges = new Map<string, Project>();
    for (const row of localAll) {
      if (row.updatedAt > lastSyncAt) localChanges.set(row.id, row);
    }

    const pull = await this.pull(REMOTE_TABLE[table], lastSyncAt);
    let downloaded = 0;
    for (const raw of pull.rows) {
      const remote = await this.fromRemoteProject(raw, key);
      const local = localChanges.get(remote.id);
      if (!local || remote.updatedAt >= local.updatedAt) {
        await dbManager.upsertProject(remote);
        downloaded++;
        localChanges.delete(remote.id);
      }
    }

    const toPush = await Promise.all(
      Array.from(localChanges.values()).map(r => this.toRemoteProject(r, key))
    );
    const uploaded = await this.push(REMOTE_TABLE[table], toPush);

    await dbManager.setLastSyncAt(address, table, pull.serverTime);
    return { table, uploaded, downloaded };
  }

  private async syncProjectOwnerValues(address: string, key: CryptoKey): Promise<SyncTableResult> {
    const table: SyncTable = 'projectOwnerValues';
    const lastSyncAt = await dbManager.getLastSyncAt(address, table);

    const localAll = await dbManager.getAllProjectOwnerValuesIncludingDeleted();
    const localChanges = new Map<string, ProjectOwnerValue>();
    for (const row of localAll) {
      if (row.updatedAt > lastSyncAt) localChanges.set(row.id, row);
    }

    const pull = await this.pull(REMOTE_TABLE[table], lastSyncAt);
    let downloaded = 0;
    for (const raw of pull.rows) {
      const remote = await this.fromRemoteProjectOwnerValue(raw, key);
      const local = localChanges.get(remote.id);
      if (!local || remote.updatedAt >= local.updatedAt) {
        await dbManager.upsertProjectOwnerValue(remote);
        downloaded++;
        localChanges.delete(remote.id);
      }
    }

    const toPush = await Promise.all(
      Array.from(localChanges.values()).map(r => this.toRemoteProjectOwnerValue(r, key))
    );
    const uploaded = await this.push(REMOTE_TABLE[table], toPush);

    await dbManager.setLastSyncAt(address, table, pull.serverTime);
    return { table, uploaded, downloaded };
  }

  // ----- transport -----

  private async pull(table: RemoteTable, since: number): Promise<PullResponse> {
    const res = await fetch('/api/sync/pull', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ table, since }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`pull ${table} failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  private async push(table: RemoteTable, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const res = await fetch('/api/sync/push', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ table, rows }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`push ${table} failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as PushResponse;
    return json.upserted;
  }

  // ----- row mappers -----
  //
  // Encrypted fields per table (collected into the `cipher` column):
  //   address_groups        : name, memo
  //   projects              : name
  //   project_owner_values  : userValue1, userValue2
  //
  // Plaintext fields stay where they are so the app and any future
  // server-side query surface can read them. Soft-deleted rows are also
  // encrypted; decryption uses the same key regardless of is_deleted.

  private async toRemoteAddressGroup(
    r: AddressGroup,
    key: CryptoKey
  ): Promise<Record<string, unknown>> {
    const cipher = await encryptJson(key, { name: r.name, memo: r.memo });
    return {
      id: r.id,
      name: null,
      addresses: r.addresses,
      x_account: r.xAccount,
      memo: null,
      cipher,
      is_deleted: r.isDeleted,
      updated_at: r.updatedAt,
    };
  }

  private async fromRemoteAddressGroup(
    r: Record<string, unknown>,
    key: CryptoKey
  ): Promise<AddressGroup> {
    let name = '';
    let memo: string | null = null;
    const cipher = r.cipher;
    if (typeof cipher === 'string' && cipher.length > 0) {
      try {
        const dec = await decryptJson<{ name?: string; memo?: string | null }>(key, cipher);
        name = dec.name ?? '';
        memo = dec.memo ?? null;
      } catch (err) {
        console.error('[sync] address_groups decrypt failed', err);
      }
    } else {
      // Backwards compatibility: a row written by a plaintext client.
      name = String(r.name ?? '');
      memo = (r.memo as string | null) ?? null;
    }
    return {
      id: String(r.id),
      name,
      addresses: Array.isArray(r.addresses) ? (r.addresses as string[]) : [],
      xAccount: (r.x_account as string | null) ?? null,
      memo,
      isDeleted: Boolean(r.is_deleted),
      updatedAt: Number(r.updated_at),
    };
  }

  private toRemoteAddressInfo(r: AddressInfo): Record<string, unknown> {
    return {
      address: r.address,
      group_id: r.groupId,
      is_deleted: r.isDeleted,
      updated_at: r.updatedAt,
    };
  }

  private fromRemoteAddressInfo(r: Record<string, unknown>): AddressInfo {
    return {
      address: String(r.address),
      groupId: (r.group_id as string | null) ?? null,
      isDeleted: Boolean(r.is_deleted),
      updatedAt: Number(r.updated_at),
    };
  }

  private async toRemoteProject(
    r: Project,
    key: CryptoKey
  ): Promise<Record<string, unknown>> {
    const cipher = await encryptJson(key, { name: r.name });
    return {
      id: r.id,
      project_id: r.projectId,
      name: null,
      issuer: r.issuer,
      taxon: r.taxon,
      cipher,
      is_deleted: r.isDeleted,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    };
  }

  private async fromRemoteProject(
    r: Record<string, unknown>,
    key: CryptoKey
  ): Promise<Project> {
    let name = '';
    const cipher = r.cipher;
    if (typeof cipher === 'string' && cipher.length > 0) {
      try {
        const dec = await decryptJson<{ name?: string }>(key, cipher);
        name = dec.name ?? '';
      } catch (err) {
        console.error('[sync] projects decrypt failed', err);
      }
    } else {
      name = String(r.name ?? '');
    }
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      name,
      issuer: String(r.issuer ?? ''),
      taxon: String(r.taxon ?? ''),
      isDeleted: Boolean(r.is_deleted),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  }

  private async toRemoteProjectOwnerValue(
    r: ProjectOwnerValue,
    key: CryptoKey
  ): Promise<Record<string, unknown>> {
    const cipher = await encryptJson(key, {
      userValue1: r.userValue1,
      userValue2: r.userValue2,
    });
    return {
      id: r.id,
      project_id: r.projectId,
      owner: r.owner,
      user_value1: null,
      user_value2: null,
      cipher,
      is_deleted: r.isDeleted,
      updated_at: r.updatedAt,
    };
  }

  private async fromRemoteProjectOwnerValue(
    r: Record<string, unknown>,
    key: CryptoKey
  ): Promise<ProjectOwnerValue> {
    let userValue1: number | null = null;
    let userValue2: number | null = null;
    const cipher = r.cipher;
    if (typeof cipher === 'string' && cipher.length > 0) {
      try {
        const dec = await decryptJson<{
          userValue1?: number | null;
          userValue2?: number | null;
        }>(key, cipher);
        userValue1 = dec.userValue1 ?? null;
        userValue2 = dec.userValue2 ?? null;
      } catch (err) {
        console.error('[sync] project_owner_values decrypt failed', err);
      }
    } else {
      userValue1 = r.user_value1 == null ? null : Number(r.user_value1);
      userValue2 = r.user_value2 == null ? null : Number(r.user_value2);
    }
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      owner: String(r.owner),
      userValue1,
      userValue2,
      isDeleted: Boolean(r.is_deleted),
      updatedAt: Number(r.updated_at),
    };
  }
}

export const syncManager = new SyncManager();
