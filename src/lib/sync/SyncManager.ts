// lib/sync/SyncManager.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { dbManager } from '@/utils/db';

interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  errors: string[];
}

export class SyncManager {
  private supabase: SupabaseClient;
  private userId: string;

  constructor(supabase: SupabaseClient, userId: string) {
    this.supabase = supabase;
    this.userId = userId;
  }

  // 全データを同期
  async syncAll(): Promise<SyncResult> {
    const results: SyncResult = {
      success: true,
      uploaded: 0,
      downloaded: 0,
      errors: [],
    };

    try {
      // 各テーブルを同期
      const addressGroupsResult = await this.syncAddressGroups();
      const addressesResult = await this.syncAddresses();
      const projectsResult = await this.syncProjects();
      const ownerValuesResult = await this.syncProjectOwnerValues();

      results.uploaded = 
        addressGroupsResult.uploaded + 
        addressesResult.uploaded + 
        projectsResult.uploaded + 
        ownerValuesResult.uploaded;
      
      results.downloaded = 
        addressGroupsResult.downloaded + 
        addressesResult.downloaded + 
        projectsResult.downloaded + 
        ownerValuesResult.downloaded;

      results.errors = [
        ...addressGroupsResult.errors,
        ...addressesResult.errors,
        ...projectsResult.errors,
        ...ownerValuesResult.errors,
      ];

      results.success = results.errors.length === 0;
    } catch (error) {
      results.success = false;
      results.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return results;
  }

  // Address Groups同期
  private async syncAddressGroups(): Promise<SyncResult> {
    const result: SyncResult = { success: true, uploaded: 0, downloaded: 0, errors: [] };

    try {
      // ローカルデータ取得
      const localData = await dbManager.getAllAddressGroupsIncludingDeleted();
      
      // リモートデータ取得
      const { data: remoteData, error } = await this.supabase
        .from('address_groups')
        .select('*');

      if (error) throw error;

      // マージ（updatedAtが新しい方を採用）
      const merged = this.mergeByUpdatedAt(
        localData,
        remoteData?.map(r => ({
          id: r.id,
          name: r.name,
          addresses: r.addresses || [],
          xAccount: r.x_account,
          memo: r.memo,
          isDeleted: r.is_deleted,
          updatedAt: r.updated_at,
        })) || [],
        'id'
      );

      // ローカルに保存
      for (const item of merged.toLocal) {
        await dbManager.updateAddressGroup(item);
        result.downloaded++;
      }

      // リモートに保存
      if (merged.toRemote.length > 0) {
        const { error: upsertError } = await this.supabase
          .from('address_groups')
          .upsert(
            merged.toRemote.map(item => ({
              id: item.id,
              user_id: this.userId,
              name: item.name,
              addresses: item.addresses,
              x_account: item.xAccount,
              memo: item.memo,
              is_deleted: item.isDeleted,
              updated_at: item.updatedAt,
            })),
            { onConflict: 'user_id,id' }
          );

        if (upsertError) throw upsertError;
        result.uploaded = merged.toRemote.length;
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`AddressGroups: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return result;
  }

  // Addresses同期
  private async syncAddresses(): Promise<SyncResult> {
    const result: SyncResult = { success: true, uploaded: 0, downloaded: 0, errors: [] };

    try {
      const localData = await dbManager.getAllAddressInfosIncludingDeleted();
      
      const { data: remoteData, error } = await this.supabase
        .from('addresses')
        .select('*');

      if (error) throw error;

      const merged = this.mergeByUpdatedAt(
        localData,
        remoteData?.map(r => ({
          address: r.address,
          groupId: r.group_id,
          isDeleted: r.is_deleted,
          updatedAt: r.updated_at,
        })) || [],
        'address'
      );

      for (const item of merged.toLocal) {
        await dbManager.upsertAddressInfo(item);
        result.downloaded++;
      }

      if (merged.toRemote.length > 0) {
        const { error: upsertError } = await this.supabase
          .from('addresses')
          .upsert(
            merged.toRemote.map(item => ({
              address: item.address,
              user_id: this.userId,
              group_id: item.groupId,
              is_deleted: item.isDeleted,
              updated_at: item.updatedAt,
            })),
            { onConflict: 'user_id,address' }
          );

        if (upsertError) throw upsertError;
        result.uploaded = merged.toRemote.length;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Addresses: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return result;
  }

  // Projects同期
  private async syncProjects(): Promise<SyncResult> {
    const result: SyncResult = { success: true, uploaded: 0, downloaded: 0, errors: [] };

    try {
      const localData = await dbManager.getAllProjectsIncludingDeleted();
      
      const { data: remoteData, error } = await this.supabase
        .from('projects')
        .select('*');

      if (error) throw error;

      const merged = this.mergeByUpdatedAt(
        localData,
        remoteData?.map(r => ({
          id: r.id,
          projectId: r.project_id,
          name: r.name,
          issuer: r.issuer,
          taxon: r.taxon,
          isDeleted: r.is_deleted,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })) || [],
        'id'
      );

      for (const item of merged.toLocal) {
        await dbManager.upsertProject(item);
        result.downloaded++;
      }

      if (merged.toRemote.length > 0) {
        const { error: upsertError } = await this.supabase
          .from('projects')
          .upsert(
            merged.toRemote.map(item => ({
              id: item.id,
              user_id: this.userId,
              project_id: item.projectId,
              name: item.name,
              issuer: item.issuer,
              taxon: item.taxon,
              is_deleted: item.isDeleted,
              created_at: item.createdAt,
              updated_at: item.updatedAt,
            })),
            { onConflict: 'user_id,id' }
          );

        if (upsertError) throw upsertError;
        result.uploaded = merged.toRemote.length;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Projects: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return result;
  }

  // Project Owner Values同期
  private async syncProjectOwnerValues(): Promise<SyncResult> {
    const result: SyncResult = { success: true, uploaded: 0, downloaded: 0, errors: [] };

    try {
      const localData = await dbManager.getAllProjectOwnerValuesIncludingDeleted();
      
      const { data: remoteData, error } = await this.supabase
        .from('project_owner_values')
        .select('*');

      if (error) throw error;

      const merged = this.mergeByUpdatedAt(
        localData,
        remoteData?.map(r => ({
          id: r.id,
          projectId: r.project_id,
          owner: r.owner,
          isDeleted: r.is_deleted,
          userValue1: r.user_value1,
          userValue2: r.user_value2,
          updatedAt: r.updated_at,
        })) || [],
        'id'
      );

      for (const item of merged.toLocal) {
        await dbManager.upsertProjectOwnerValue(item);
        result.downloaded++;
      }

      if (merged.toRemote.length > 0) {
        const { error: upsertError } = await this.supabase
          .from('project_owner_values')
          .upsert(
            merged.toRemote.map(item => ({
              id: item.id,
              user_id: this.userId,
              project_id: item.projectId,
              owner: item.owner,
              is_deleted: item.isDeleted,
              user_value1: item.userValue1,
              user_value2: item.userValue2,
              updated_at: item.updatedAt,
            })),
            { onConflict: 'user_id,id' }
          );

        if (upsertError) throw upsertError;
        result.uploaded = merged.toRemote.length;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`ProjectOwnerValues: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return result;
  }

  // updatedAtベースのマージ
  private mergeByUpdatedAt<T extends { updatedAt: number }>(
    local: T[],
    remote: T[],
    keyField: keyof T
  ): { toLocal: T[]; toRemote: T[] } {
    const toLocal: T[] = [];
    const toRemote: T[] = [];

    const localMap = new Map(local.map(item => [item[keyField], item]));
    const remoteMap = new Map(remote.map(item => [item[keyField], item]));

    // ローカルにあるデータをチェック
    for (const localItem of local) {
      const key = localItem[keyField];
      const remoteItem = remoteMap.get(key);

      if (!remoteItem) {
        // リモートにない → アップロード
        toRemote.push(localItem);
      } else if (localItem.updatedAt > remoteItem.updatedAt) {
        // ローカルが新しい → アップロード
        toRemote.push(localItem);
      } else if (localItem.updatedAt < remoteItem.updatedAt) {
        // リモートが新しい → ダウンロード
        toLocal.push(remoteItem);
      }
      // 同じ場合は何もしない
    }

    // リモートにあってローカルにないデータ
    for (const remoteItem of remote) {
      const key = remoteItem[keyField];
      if (!localMap.has(key)) {
        toLocal.push(remoteItem);
      }
    }

    return { toLocal, toRemote };
  }
}