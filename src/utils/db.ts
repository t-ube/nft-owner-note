// utils/db.ts

export interface Project {
  id: string;
  projectId: string;
  name: string;
  issuer: string;
  taxon: string;
  isDeleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NFTokenBase {
  id: string;
  projectId: string;
  nft_id: string;
  nft_serial: number;
  owner: string; // Wallet address
  is_burned: boolean;
  uri: string;
  flags: number;
  transfer_fee: number;
  issuer: string;
  nft_taxon: number;
  ledger_index: number;
  updatedAt: number;
}

export interface NFToken extends NFTokenBase {
  name?: string | null;
  lastSaleAmount?: number | null;
  lastSaleAt?: number | null;
  firstSaleAmount?: number | null;
  firstSaleAt?: number | null;
  mintedAt?: number | null;
  isOrderMade?: boolean;
  userValue1?: number | null;
  userValue2?: number | null;
  color?: string | null;
  memo?: string | null;
}

export interface ProjectOwnerValue {
  id: string;           // projectId-owner
  projectId: string;    // プロジェクトID
  owner: string;        // オーナーのアドレス
  userValue1: number | null;  // ユーザー定義数値1
  userValue2: number | null;  // ユーザー定義数値2
  isDeleted: boolean;         // 削除フラグ
  updatedAt: number;          // 更新日時
}

export interface NFTDetail {
  id: string;
  nftId: string;  // NFTokenのid（プロジェクトID-NFT_ID）と紐付け
  projectId: string;
  name: string;
  lastSaleAmount: number | null;
  lastSaleAt: number | null;
  isOrderMade: boolean;
  userValue1: number | null;
  userValue2: number | null;
  color: string | null;
  memo: string | null;
  updatedAt: number;
}

export interface AddressGroup {
  id: string;           // グループID
  name: string;         // グループ名（表示名）
  addresses: string[];  // 所属するアドレスのリスト
  xAccount: string | null;   // Xアカウント名
  memo: string | null;       // メモ
  isDeleted: boolean;    // 削除フラグ
  updatedAt: number;        // 更新日時
}

export interface AddressInfo {
  address: string;
  groupId: string | null;  // 所属するグループのID
  isDeleted: boolean;     // 削除フラグ
  updatedAt: number;
}

export interface AllowlistEntry {
  id: string;           // projectId-address
  address: string;      // オーナーのアドレス
  mints: number;        // ミント可能数
  isManual: boolean;    // 手動設定かどうか
  updatedAt: number;    // 更新日時
}

export interface AllowlistRule {
  id: string;           // ルールID
  minNFTs: number;      // 最小NFT所持数
  mintCount: number;    // 付与するミント数
  updatedAt: number;    // 更新日時
}

interface NFTPaginationOptions {
  projectId: string;
  page: number;
  limit: number;
  sortField: string;
  sortDirection: 'asc' | 'desc' | null;
  includeBurned: boolean;
  filters?: {
    colors?: string[];
    minAmount?: number;
    maxAmount?: number;
    minDate?: number;
    maxDate?: number;
    minLatestSaleDate?: number;
    maxLatestSaleDate?: number;
    nftName?: string;
  };
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export interface SyncMeta {
  // Composite key: `${address}:${table}`
  key: string;
  lastSyncAt: number;
}

export type SyncTable = 'projects' | 'addressGroups' | 'addresses' | 'projectOwnerValues';

function syncMetaKey(address: string, table: SyncTable): string {
  return `${address}:${table}`;
}

const BASE_DB_NAME = 'OwnerNoteDB';
const ACTIVE_ADDRESS_KEY = 'xon.active-db-address';

// Sync-relevant stores copied from the guest DB into a fresh per-address
// DB on the first sign-in, so pre-login data follows the user into the
// wallet-bound backup.
const CLAIMABLE_STORES = [
  'projects',
  'projectOwnerValues',
  'nfts',
  'addressGroups',
  'addresses',
  'allowlist',
  'allowlistRules',
] as const;

class DatabaseManager {
  private dbName: string = BASE_DB_NAME;
  private version = 4;
  private activeAddressLoaded = false;
  private changeListeners: Set<() => void> = new Set();

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * On first use, check localStorage for the previously-active address
   * and point dbName at that per-address DB so subsequent initDB() calls
   * open the right store. Called lazily from initDB so SSR bundles that
   * import this module but never actually call it do not crash on a
   * missing `localStorage`.
   */
  private loadActiveAddressIfNeeded(): void {
    if (this.activeAddressLoaded) return;
    this.activeAddressLoaded = true;
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem(ACTIVE_ADDRESS_KEY);
    if (stored) {
      this.dbName = `${BASE_DB_NAME}:${stored}`;
    }
  }

  /**
   * Switch the active IndexedDB database to the one bound to the given
   * XRPL address (or back to the guest DB when address is null).
   *
   * Rules:
   *  - Called from the sign-in flow. NOT called on logout — a logged
   *    out user keeps writing to their last active DB, so switching
   *    wallets is the only thing that moves data between DBs.
   *  - If this is the first time switching from the guest DB into an
   *    address DB, the guest DB's sync-relevant stores are copied into
   *    the address DB so pre-login work is preserved (the "claim"
   *    behavior).
   *  - Same-address calls are a no-op.
   *  - After a real switch, notifyChange fires so listeners
   *    (sync debounce, UI re-fetch via syncCompleteCount) can react.
   */
  async setActiveAddress(address: string | null): Promise<void> {
    this.loadActiveAddressIfNeeded();
    const newDbName = address ? `${BASE_DB_NAME}:${address}` : BASE_DB_NAME;
    if (newDbName === this.dbName) return;

    const wasGuest = this.dbName === BASE_DB_NAME;

    if (wasGuest && address) {
      try {
        await this.claimGuestDataFor(address);
      } catch (err) {
        console.error('[db] claim from guest failed', err);
      }
    }

    this.dbName = newDbName;
    if (typeof localStorage !== 'undefined') {
      if (address) {
        localStorage.setItem(ACTIVE_ADDRESS_KEY, address);
      } else {
        localStorage.removeItem(ACTIVE_ADDRESS_KEY);
      }
    }
    this.notifyChange();
  }

  getActiveAddress(): string | null {
    this.loadActiveAddressIfNeeded();
    if (this.dbName === BASE_DB_NAME) return null;
    return this.dbName.slice(BASE_DB_NAME.length + 1);
  }

  /**
   * Copy sync-relevant stores from the guest DB into a fresh address
   * DB. No-op if the address DB already has data (so repeat sign-ins
   * with the same address never overwrite). No-op if the guest DB has
   * nothing worth copying.
   */
  private async claimGuestDataFor(address: string): Promise<void> {
    const addressDbName = `${BASE_DB_NAME}:${address}`;
    let guestDb: IDBDatabase | null = null;
    let targetDb: IDBDatabase | null = null;
    try {
      guestDb = await this.openDb(BASE_DB_NAME);
      targetDb = await this.openDb(addressDbName);

      if (await this.anyStoreHasRows(targetDb)) return;
      if (!(await this.anyStoreHasRows(guestDb))) return;

      for (const storeName of CLAIMABLE_STORES) {
        if (!guestDb.objectStoreNames.contains(storeName)) continue;
        if (!targetDb.objectStoreNames.contains(storeName)) continue;
        const items = await this.readAll(guestDb, storeName);
        if (items.length === 0) continue;
        await this.writeAll(targetDb, storeName, items);
      }
    } finally {
      if (guestDb) guestDb.close();
      if (targetDb) targetDb.close();
    }
  }

  private anyStoreHasRows(db: IDBDatabase): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const names = CLAIMABLE_STORES.filter((s) => db.objectStoreNames.contains(s));
      if (names.length === 0) {
        resolve(false);
        return;
      }
      const tx = db.transaction(names, 'readonly');
      let found = false;
      let pending = names.length;
      for (const name of names) {
        const req = tx.objectStore(name).count();
        req.onsuccess = () => {
          if (req.result > 0) found = true;
          if (--pending === 0) resolve(found);
        };
        req.onerror = () => reject(req.error);
      }
    });
  }

  private readAll<T = unknown>(db: IDBDatabase, storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private writeAll(db: IDBDatabase, storeName: string, items: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Wipe every store that participates in cloud sync, plus the local
   * caches that are derived from them (NFTs are cached per project).
   * Called when the signed-in XRPL address changes so the previous
   * user's data does not bleed into the new user's cloud account.
   *
   * Allowlist tables are NOT cleared (they are computed from the
   * project NFT cache and would just be regenerated). syncMeta IS
   * cleared so the next sync sees lastSyncAt=0 and pulls everything
   * for the new address.
   *
   * Notifies listeners so any UI that holds a snapshot can refresh.
   */
  async clearAllUserData(): Promise<void> {
    const db = await this.initDB();
    const stores = [
      'addressGroups',
      'addresses',
      'projects',
      'projectOwnerValues',
      'nfts',
      'syncMeta',
    ];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const name of stores) {
        if (db.objectStoreNames.contains(name)) {
          tx.objectStore(name).clear();
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    this.notifyChange();
  }

  private notifyChange(): void {
    this.changeListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('[db.onChange] listener threw', err);
      }
    });
  }

  // ProjectIDを生成するヘルパーメソッド
  private async generateProjectId(project: { name: string; issuer: string; taxon: string }): Promise<string> {
    // プロジェクトの情報とタイムスタンプを組み合わせてハッシュを生成
    const timestamp = Date.now().toString();
    const data = `${project.name}:${project.issuer}:${project.taxon}:${timestamp}`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    
    // SHA-256ハッシュを生成
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 最初の12文字を使用（十分なユニーク性を確保しつつ、適度な長さに）
    return hashHex.slice(0, 12);
  }

  async initDB(): Promise<IDBDatabase> {
    this.loadActiveAddressIfNeeded();
    return this.openDb(this.dbName);
  }

  private openDb(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        const oldVersion = event.oldVersion;
        console.log(`Upgrading database from version ${oldVersion} to ${this.version}`);

        if (oldVersion < 1) {
          // ProjectOwnerValues store
          if (!db.objectStoreNames.contains('projectOwnerValues')) {
            const store = db.createObjectStore('projectOwnerValues', { keyPath: 'id' });
            store.createIndex('projectId', 'projectId', { unique: false });
            store.createIndex('owner', 'owner', { unique: false });
            store.createIndex('projectId_owner', ['projectId', 'owner'], { unique: true });
          }

          // Projects store
          if (!db.objectStoreNames.contains('projects')) {
            const store = db.createObjectStore('projects', { keyPath: 'id' });
            store.createIndex('projectId', 'projectId', { unique: true });
            store.createIndex('name', 'name', { unique: false });
          }

          // NFTs store
          if (!db.objectStoreNames.contains('nfts')) {
            const store = db.createObjectStore('nfts', { keyPath: 'id' });
            store.createIndex('projectId', 'projectId', { unique: false });
            store.createIndex('owner', 'owner', { unique: false });
            store.createIndex('projectId_nft_id', ['projectId', 'nft_id'], { unique: true });
            store.createIndex('isOrderMade', 'isOrderMade', { unique: false });
            store.createIndex('color', 'color', { unique: false });
            store.createIndex('firstSaleAmount', 'firstSaleAmount', { unique: false });
            store.createIndex('firstSaleAt', 'firstSaleAt', { unique: false });
            store.createIndex('mintedAt', 'mintedAt', { unique: false });
          }

          // Address Groups store
          if (!db.objectStoreNames.contains('addressGroups')) {
            const groupStore = db.createObjectStore('addressGroups', { keyPath: 'id' });
            groupStore.createIndex('name', 'name', { unique: false });
            groupStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          // Addresses store
          if (!db.objectStoreNames.contains('addresses')) {
            const addressStore = db.createObjectStore('addresses', { keyPath: 'address' });
            addressStore.createIndex('groupId', 'groupId', { unique: false });
            addressStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          // Allowlist store
          if (!db.objectStoreNames.contains('allowlist')) {
            const store = db.createObjectStore('allowlist', { keyPath: 'id' });
            store.createIndex('address', 'address', { unique: true });
          }

          // Allowlist Rules store
          if (!db.objectStoreNames.contains('allowlistRules')) {
            const store = db.createObjectStore('allowlistRules', { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }

        if (oldVersion < 2) {
          const transaction = (event.target as IDBOpenDBRequest).transaction!;
          this.migrateStore(transaction, 'projects');
          this.migrateStore(transaction, 'addressGroups');
          this.migrateStore(transaction, 'addresses');
          this.migrateStore(transaction, 'projectOwnerValues');
        }

        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('syncMeta')) {
            db.createObjectStore('syncMeta', { keyPath: 'key' });
          }
        }

        if (oldVersion < 4) {
          // syncMeta keyPath changed from 'table' to 'key' (composite
          // `${address}:${table}`) so last-sync watermarks become per-address.
          // Drop and recreate; there is no data worth migrating.
          if (db.objectStoreNames.contains('syncMeta')) {
            db.deleteObjectStore('syncMeta');
          }
          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }
      };
    });
  }

  private migrateStore(transaction: IDBTransaction, storeName: string): void {
    if (!transaction.objectStoreNames.contains(storeName)) return;
    const store = transaction.objectStore(storeName);
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value;
        // isDeletedが未定義なら追加
        if (record.isDeleted === undefined) {
          record.isDeleted = false;
          cursor.update(record);
        }
        cursor.continue();
      }
    };
  }

  // Project Methods
  async addProject(project: Omit<Project, 'id' | 'projectId' | 'isDeleted' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const db = await this.initDB();
    const projectId = await this.generateProjectId(project);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');

      const now = Date.now();

      const completeProject: Project = {
        id: crypto.randomUUID(),
        projectId,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        ...project
      };

      const request = store.add(completeProject);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.notifyChange();
        resolve(completeProject);
      };
    });
  }

  // ProjectOwnerValue Methods
  async setProjectOwnerValues(
    projectId: string,
    owner: string,
    values: { userValue1?: number | null; userValue2?: number | null }
  ): Promise<ProjectOwnerValue> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projectOwnerValues', 'readwrite');
      const store = transaction.objectStore('projectOwnerValues');
      const id = `${projectId}-${owner}`;
      
      // まず既存のデータを取得
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existingData = getRequest.result as ProjectOwnerValue | undefined;
        const now = Date.now();
        
        const updatedValues: ProjectOwnerValue = {
          id,
          projectId,
          owner,
          userValue1: values.userValue1 ?? existingData?.userValue1 ?? null,
          userValue2: values.userValue2 ?? existingData?.userValue2 ?? null,
          isDeleted: false,
          updatedAt: now,
        };
        
        const putRequest = store.put(updatedValues);
        putRequest.onsuccess = () => {
          this.notifyChange();
          resolve(updatedValues);
        };
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getProjectOwnerValues(projectId: string): Promise<ProjectOwnerValue[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projectOwnerValues', 'readonly');
      const store = transaction.objectStore('projectOwnerValues');
      const index = store.index('projectId');
      const request = index.getAll(projectId);

      request.onsuccess = () => {
        const values = request.result as ProjectOwnerValue[];
        resolve(values.filter(v => !v.isDeleted));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getOwnerValues(projectId: string, owner: string): Promise<ProjectOwnerValue | undefined> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projectOwnerValues', 'readonly');
      const store = transaction.objectStore('projectOwnerValues');
      const id = `${projectId}-${owner}`;
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result as ProjectOwnerValue | undefined;
        resolve(result && !result.isDeleted ? result : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteProjectOwnerValues(projectId: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projectOwnerValues', 'readwrite');
      const store = transaction.objectStore('projectOwnerValues');
      const index = store.index('projectId');
      const request = index.openCursor(projectId);
      const now = Date.now();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const value = cursor.value as ProjectOwnerValue;
          cursor.update({ ...value, isDeleted: true, updatedAt: now });
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        this.notifyChange();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getProjectByProjectId(projectId: string): Promise<Project | undefined> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readonly');
      const store = transaction.objectStore('projects');
      const index = store.index('projectId');
      const request = index.get(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as Project | undefined;
        resolve(result && !result.isDeleted ? result : undefined);
      };
    });
  }

  async getAllProjects(): Promise<Project[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const projects = (request.result as Project[]).filter(p => !p.isDeleted);
        projects.sort((a, b) => a.name.localeCompare(b.name));
        resolve(projects);
      };
    });
  }

  async getAllProjectsIncludingDeleted(): Promise<Project[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as Project[]);
    });
  }

  async upsertProject(project: Project): Promise<Project> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      const request = store.put(project);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(project);
    });
  }

  async upsertProjectOwnerValue(value: ProjectOwnerValue): Promise<ProjectOwnerValue> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projectOwnerValues', 'readwrite');
      const store = transaction.objectStore('projectOwnerValues');
      const request = store.put(value);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(value);
    });
  }

  async getAllProjectOwnerValuesIncludingDeleted(): Promise<ProjectOwnerValue[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projectOwnerValues', 'readonly');
      const store = transaction.objectStore('projectOwnerValues');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as ProjectOwnerValue[]);
    });
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.initDB();
    const project = await this.getProjectByProjectId(id);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['projects', 'nfts', 'projectOwnerValues'], 'readwrite');
      const now = Date.now();

      // Soft delete the project (so sync picks up the deletion)
      const projectStore = transaction.objectStore('projects');
      if (project) {
        projectStore.put({ ...project, isDeleted: true, updatedAt: now });
      }

      // NFTs are local-only cache, hard delete
      const nftStore = transaction.objectStore('nfts');
      const nftIndex = nftStore.index('projectId');
      const nftRequest = nftIndex.openCursor(id);

      nftRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Soft delete all associated owner values
      const ownerValueStore = transaction.objectStore('projectOwnerValues');
      const ownerValueIndex = ownerValueStore.index('projectId');
      const ownerValueRequest = ownerValueIndex.openCursor(id);

      ownerValueRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const value = cursor.value as ProjectOwnerValue;
          cursor.update({ ...value, isDeleted: true, updatedAt: now });
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        this.notifyChange();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // NFT Methods
  async updateNFTs(projectId: string, nfts: Omit<NFTokenBase, 'id' | 'projectId' | 'updatedAt'>[]): Promise<NFToken[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('nfts', 'readwrite');
      const store = transaction.objectStore('nfts');
      const now = Date.now();
  
      // Get existing NFTs first
      const index = store.index('projectId');
      const request = index.getAll(projectId);
  
      request.onsuccess = () => {
        const existingNFTs = request.result as NFToken[];
        const existingNFTsMap = new Map(existingNFTs.map(nft => [nft.nft_id, nft]));
        const updatedNFTs: NFToken[] = [];
  
        // Process each NFT
        const updatePromises = nfts.map(nft => {
          const existing = existingNFTsMap.get(nft.nft_id);
  
          const completeNFT: NFToken = {
            id: `${projectId}-${nft.nft_id}`,
            projectId,
            updatedAt: now,
            name: null,
            lastSaleAmount: null,
            lastSaleAt: null,
            isOrderMade: false,
            userValue1: null,
            userValue2: null,
            color: null,
            memo: null,
            ...existing, // 既存の拡張情報を適用
            ...nft,      // 新しい基本情報を適用
          };
          
          updatedNFTs.push(completeNFT);
  
          return new Promise<void>((resolveUpdate, rejectUpdate) => {
            const putRequest = store.put(completeNFT);
            putRequest.onsuccess = () => resolveUpdate();
            putRequest.onerror = () => rejectUpdate(putRequest.error);
          });
        });
  
        // すべてのアップデートが完了してから更新されたNFTsを返す
        Promise.all(updatePromises)
          .then(() => resolve(updatedNFTs))
          .catch(error => {
            console.error('Error updating NFTs:', error);
            reject(error);
          });
      };
  
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getNFTsByProjectId(projectId: string): Promise<NFToken[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('nfts', 'readonly');
      const store = transaction.objectStore('nfts');
      const index = store.index('projectId');
      const request = index.getAll(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async updateNFTDetails(nft: NFToken): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('nfts', 'readwrite');
      const store = transaction.objectStore('nfts');
      const request = store.put({
        ...nft,
        updatedAt: Date.now()
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearProjectNFTs(projectId: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('nfts', 'readwrite');
      const store = transaction.objectStore('nfts');
      const index = store.index('projectId');
      const request = index.openCursor(projectId);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // アドレスグループの操作メソッド
  async createAddressGroup(group: Omit<AddressGroup, 'id' | 'isDeleted' | 'updatedAt'>): Promise<AddressGroup> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
      const groupStore = transaction.objectStore('addressGroups');
      const addressStore = transaction.objectStore('addresses');

      const now = Date.now();
      const completeGroup: AddressGroup = {
        id: crypto.randomUUID(),
        isDeleted: false,
        updatedAt: now,
        ...group
      };

      // グループの保存
      const groupRequest = groupStore.add(completeGroup);

      groupRequest.onsuccess = () => {
        // 所属アドレスの更新
        const addressUpdates = group.addresses.map(address => {
          return addressStore.put({
            address,
            groupId: completeGroup.id,
            isDeleted: false,
            updatedAt: now
          });
        });

        Promise.all(addressUpdates)
          .then(() => {
            this.notifyChange();
            resolve(completeGroup);
          })
          .catch(reject);
      };

      groupRequest.onerror = () => reject(groupRequest.error);
    });
  }

  async updateAddressGroup(group: AddressGroup): Promise<AddressGroup> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
      const groupStore = transaction.objectStore('addressGroups');
      const addressStore = transaction.objectStore('addresses');
    
      const now = Date.now();
      const updatedGroup = {
        ...group,
        updatedAt: now
      };
    
      // 1. まず既存のグループ情報と全てのグループを取得
      const getGroupRequest = groupStore.get(group.id);
    
      getGroupRequest.onsuccess = () => {
        const oldGroup = getGroupRequest.result as AddressGroup;

        // 他の全グループを取得
        const getAllGroupsRequest = groupStore.getAll();

        getAllGroupsRequest.onsuccess = () => {
          const allGroups = getAllGroupsRequest.result as AddressGroup[];
          const otherGroups = allGroups.filter(g => g.id !== group.id && !g.isDeleted);

          const oldAddresses = new Set(oldGroup.addresses);
          const newAddresses = new Set(group.addresses);

          // 2. 削除されたアドレスを処理
          const removedAddresses = Array.from(oldAddresses)
            .filter(addr => !newAddresses.has(addr));

          // 3. 新しく追加されたアドレスを処理
          const addedAddresses = Array.from(newAddresses)
            .filter(addr => !oldAddresses.has(addr));

          // 4. 削除されたアドレスの処理（同期対象なのでソフト削除）
          const removePromises = removedAddresses.map(address => {
            const otherGroupWithAddress = otherGroups.find(g =>
              g.addresses.includes(address)
            );

            if (otherGroupWithAddress) {
              return addressStore.put({
                address,
                groupId: otherGroupWithAddress.id,
                isDeleted: false,
                updatedAt: now
              });
            } else {
              return addressStore.put({
                address,
                groupId: null,
                isDeleted: true,
                updatedAt: now
              });
            }
          });
    
          // 5. 追加されたアドレスの処理
          const addPromises = addedAddresses.map(address => {
            return addressStore.put({
              address,
              groupId: group.id,
              isDeleted: false,
              updatedAt: now
            });
          });
    
          // 6. グループ情報を更新
          const updateGroupRequest = groupStore.put(updatedGroup);
          
          // 7. 全ての処理の完了を待つ
          Promise.all([...removePromises, ...addPromises])
            .then(() => {
              updateGroupRequest.onsuccess = () => {
                this.notifyChange();
                resolve(updatedGroup);
              };
              updateGroupRequest.onerror = () => reject(updateGroupRequest.error);
            })
            .catch(error => reject(error));
        };
        
        getAllGroupsRequest.onerror = () => reject(getAllGroupsRequest.error);
      };
    
      getGroupRequest.onerror = () => reject(getGroupRequest.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getAddressGroups(address: string): Promise<AddressGroup[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addressGroups', 'readonly');
      const store = transaction.objectStore('addressGroups');
      const request = store.getAll();

      request.onsuccess = () => {
        const groups = request.result as AddressGroup[];
        const belongingGroups = groups.filter(group =>
          !group.isDeleted && group.addresses.includes(address)
        );
        resolve(belongingGroups);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getAddressGroup(id: string): Promise<AddressGroup | undefined> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addressGroups', 'readonly');
      const store = transaction.objectStore('addressGroups');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as AddressGroup | undefined;
        resolve(result && !result.isDeleted ? result : undefined);
      };
    });
  }

  async getAllAddressGroups(): Promise<AddressGroup[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addressGroups', 'readonly');
      const store = transaction.objectStore('addressGroups');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const groups = (request.result as AddressGroup[]).filter(g => !g.isDeleted);
        resolve(groups);
      };
    });
  }

  async getAllAddressGroupsIncludingDeleted(): Promise<AddressGroup[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addressGroups', 'readonly');
      const store = transaction.objectStore('addressGroups');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as AddressGroup[]);
    });
  }

  async upsertAddressGroup(group: AddressGroup): Promise<AddressGroup> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addressGroups', 'readwrite');
      const store = transaction.objectStore('addressGroups');
      const request = store.put(group);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(group);
    });
  }

  async getAddressInfo(address: string): Promise<AddressInfo | undefined> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addresses', 'readonly');
      const store = transaction.objectStore('addresses');
      const request = store.get(address);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as AddressInfo | undefined;
        resolve(result && !result.isDeleted ? result : undefined);
      };
    });
  }

  async getAllAddressInfos(): Promise<AddressInfo[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addresses', 'readonly');
      const store = transaction.objectStore('addresses');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const infos = (request.result as AddressInfo[]).filter(a => !a.isDeleted);
        resolve(infos);
      };
    });
  }

  async getAllAddressInfosIncludingDeleted(): Promise<AddressInfo[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addresses', 'readonly');
      const store = transaction.objectStore('addresses');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as AddressInfo[]);
    });
  }

  async upsertAddressInfo(info: AddressInfo): Promise<AddressInfo> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addresses', 'readwrite');
      const store = transaction.objectStore('addresses');
      const request = store.put(info);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(info);
    });
  }

  async getLastSyncAt(address: string, table: SyncTable): Promise<number> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('syncMeta', 'readonly');
      const store = transaction.objectStore('syncMeta');
      const request = store.get(syncMetaKey(address, table));

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as SyncMeta | undefined;
        resolve(result?.lastSyncAt ?? 0);
      };
    });
  }

  async setLastSyncAt(address: string, table: SyncTable, lastSyncAt: number): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('syncMeta', 'readwrite');
      const store = transaction.objectStore('syncMeta');
      const request = store.put({ key: syncMetaKey(address, table), lastSyncAt });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteAddressGroup(id: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
      const groupStore = transaction.objectStore('addressGroups');
      const addressStore = transaction.objectStore('addresses');
      const now = Date.now();

      // 1. まず削除対象のグループ情報を取得
      const getGroupRequest = groupStore.get(id);

      getGroupRequest.onsuccess = () => {
        const groupToDelete = getGroupRequest.result as AddressGroup | undefined;
        if (!groupToDelete || groupToDelete.isDeleted) {
          resolve();
          return;
        }

        // 2. 他の全てのグループを取得して、アドレスの参照を確認
        const getAllGroupsRequest = groupStore.getAll();

        getAllGroupsRequest.onsuccess = () => {
          const allGroups = getAllGroupsRequest.result as AddressGroup[];
          const otherGroups = allGroups.filter(g => g.id !== id && !g.isDeleted);

          // 3. 各アドレスについて、他のグループでの使用状況を確認
          const addressUpdates = groupToDelete.addresses.map(address => {
            const otherGroupWithAddress = otherGroups.find(g =>
              g.addresses.includes(address)
            );

            if (otherGroupWithAddress) {
              // 他のグループで使用されている場合、そのグループIDに付け替え
              return addressStore.put({
                address,
                groupId: otherGroupWithAddress.id,
                isDeleted: false,
                updatedAt: now
              });
            } else {
              // 他のグループで使用されていない場合はソフト削除
              return addressStore.put({
                address,
                groupId: null,
                isDeleted: true,
                updatedAt: now
              });
            }
          });

          // 4. グループをソフト削除
          const softDeleted: AddressGroup = {
            ...groupToDelete,
            isDeleted: true,
            updatedAt: now,
          };
          const deleteGroupRequest = groupStore.put(softDeleted);
          deleteGroupRequest.onerror = () => reject(deleteGroupRequest.error);

          // 5. すべての更新が完了するのを待つ
          Promise.all(addressUpdates)
            .then(() => {
              this.notifyChange();
              resolve();
            })
            .catch(error => reject(error));
        };

        getAllGroupsRequest.onerror = () => reject(getAllGroupsRequest.error);
      };

      getGroupRequest.onerror = () => reject(getGroupRequest.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async repairAddressReferences(): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
      const groupStore = transaction.objectStore('addressGroups');
      const addressStore = transaction.objectStore('addresses');
  
      // 1. すべてのグループとアドレス情報を取得
      const groupRequest = groupStore.getAll();
      
      groupRequest.onsuccess = () => {
        const groups = (groupRequest.result as AddressGroup[]).filter(g => !g.isDeleted);
        const addressRequest = addressStore.getAll();

        addressRequest.onsuccess = () => {
          const addresses = (addressRequest.result as AddressInfo[]).filter(a => !a.isDeleted);

          // 2. 各アドレスについて、正しいグループ参照を確認・修正
          addresses.forEach(addressInfo => {
            const correctGroup = groups.find(group =>
              group.addresses.includes(addressInfo.address)
            );

            if (correctGroup) {
              if (addressInfo.groupId !== correctGroup.id) {
                addressStore.put({
                  ...addressInfo,
                  groupId: correctGroup.id,
                  isDeleted: false,
                  updatedAt: Date.now()
                });
              }
            } else {
              // どのグループにも属していない場合はソフト削除
              addressStore.put({
                ...addressInfo,
                groupId: null,
                isDeleted: true,
                updatedAt: Date.now()
              });
            }
          });
        };
  
        addressRequest.onerror = () => reject(addressRequest.error);
      };

      groupRequest.onerror = () => reject(groupRequest.error);
      transaction.oncomplete = () => {
        this.notifyChange();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getProjectByIssuerAndTaxon(issuer: string, taxon: string): Promise<Project | undefined> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.getAll();
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const projects = request.result as Project[];
        const matchingProject = projects.find(
          p => p.issuer === issuer && p.taxon === taxon && !p.isDeleted
        );
        resolve(matchingProject);
      };
    });
  }

  async getPaginatedNFTs({
    projectId,
    page,
    limit,
    sortField,
    sortDirection,
    includeBurned,
    filters = {}
  }: NFTPaginationOptions): Promise<PaginatedResult<NFToken>> {
    const db = await this.initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('nfts', 'readonly');
      const store = transaction.objectStore('nfts');
      const index = store.index('projectId');
      const keyRange = IDBKeyRange.only(projectId);
  
      // Get all items for the project first
      const request = index.getAll(keyRange);
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        let items = request.result as NFToken[];
  
        if (includeBurned === false) {
          items = items.filter(nft => !nft.is_burned);
        }

        // Apply filters
        if (filters) {
          if (filters.colors?.length) {
            items = items.filter(nft => 
              filters.colors?.includes(nft.color || 'none')
            );
          }
          
          if (filters.minAmount !== undefined) {
            items = items.filter(nft => 
              typeof nft.lastSaleAmount === 'number' && 
              typeof filters.minAmount === 'number' &&
              nft.lastSaleAmount >= filters.minAmount
            );
          }
          
          if (filters.maxAmount !== undefined) {
            items = items.filter(nft => 
              typeof nft.lastSaleAmount === 'number' && 
              typeof filters.maxAmount === 'number' &&
              nft.lastSaleAmount <= filters.maxAmount
            );
          }
          
          if (filters.minDate !== undefined) {
            items = items.filter(nft => 
              typeof nft.mintedAt === 'number' && 
              typeof filters.minDate === 'number' &&
              nft.mintedAt >= filters.minDate
            );
          }
          
          if (filters.maxDate !== undefined) {
            items = items.filter(nft => 
              typeof nft.mintedAt === 'number' && 
              typeof filters.maxDate === 'number' &&
              nft.mintedAt <= filters.maxDate
            );
          }

          if (filters.minLatestSaleDate !== undefined) {
            items = items.filter(nft => 
              typeof nft.lastSaleAt === 'number' && 
              typeof filters.minLatestSaleDate === 'number' &&
              nft.lastSaleAt >= filters.minLatestSaleDate
            );
          }
          
          if (filters.maxLatestSaleDate !== undefined) {
            items = items.filter(nft => 
              typeof nft.lastSaleAt === 'number' && 
              typeof filters.maxLatestSaleDate === 'number' &&
              nft.lastSaleAt <= filters.maxLatestSaleDate
            );
          }

          if (filters.nftName !== undefined && filters.nftName.trim() !== '') {
            const searchTerm = filters.nftName.toLowerCase().trim();
            items = items.filter(nft => 
              nft.name?.toLowerCase().includes(searchTerm)
            );
          }
        }
  
        // Sort items
        if (sortDirection) {
          items.sort((a, b) => {
            const aValue = a[sortField as keyof NFToken];
            const bValue = b[sortField as keyof NFToken];
  
            // Special handling for null/undefined values - always put them at the end
            if (aValue === null || aValue === undefined) {
              if (bValue === null || bValue === undefined) {
                // If both values are null/undefined, maintain their relative order
                return 0;
              }
              // If only a is null/undefined, it should always go to the end
              return 1;
            }
            if (bValue === null || bValue === undefined) {
              // If only b is null/undefined, it should always go to the end
              return -1;
            }
  
            // Normal comparison for non-null values
            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
          });
        }
  
        // Calculate pagination
        const total = items.length;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
  
        resolve({
          items: paginatedItems,
          total
        });
      };
    });
  }

  // AL Management Methods
  async setAllowlistEntry(
    address: string,
    mints: number,
    isManual: boolean = false
  ): Promise<AllowlistEntry> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('allowlist', 'readwrite');
      const store = transaction.objectStore('allowlist');
      const entry: AllowlistEntry = {
        id: address,
        address,
        mints,
        isManual,
        updatedAt: Date.now()
      };
  
      const request = store.put(entry);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(entry);
    });
  }

  async getAllowlistEntries(): Promise<AllowlistEntry[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('allowlist', 'readonly');
      const store = transaction.objectStore('allowlist');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clearAllowlist(): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('allowlist', 'readwrite');
      const store = transaction.objectStore('allowlist');
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Allowlist Rules Methods
  async getAllowlistRules(): Promise<AllowlistRule[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('allowlistRules', 'readonly');
      const store = transaction.objectStore('allowlistRules');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rules = request.result;
        // minNFTs の降順でソート
        rules.sort((a, b) => b.minNFTs - a.minNFTs);
        resolve(rules);
      };
    });
  }

  async saveAllowlistRules(rules: Omit<AllowlistRule, 'id' | 'updatedAt'>[]): Promise<AllowlistRule[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('allowlistRules', 'readwrite');
      const store = transaction.objectStore('allowlistRules');

      // まず既存のルールを全て削除
      store.clear();

      const now = Date.now();
      const savedRules: AllowlistRule[] = [];

      // 新しいルールを保存
      rules.forEach((rule) => {
        const completeRule: AllowlistRule = {
          id: crypto.randomUUID(),
          updatedAt: now,
          ...rule
        };

        const request = store.add(completeRule);
        request.onsuccess = () => {
          savedRules.push(completeRule);
        };
      });

      transaction.oncomplete = () => {
        // minNFTs の降順でソート
        savedRules.sort((a, b) => b.minNFTs - a.minNFTs);
        resolve(savedRules);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

export const dbManager = new DatabaseManager();