// contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useSupabaseAuth } from "@/app/contexts/SupabaseAuthContext";
import { dbManager, AddressGroup, Project, ProjectOwnerValue, AddressInfo } from '@/utils/db';

// APIレスポンスの型定義
interface SyncResponse {
  success: boolean;
  toLocal: {
    addressGroups?: AddressGroup[];
    addresses?: AddressInfo[];
    projects?: Project[];
    ownerValues?: ProjectOwnerValue[];
  };
  error?: string;
}

interface SyncContextType {
  syncEnabled: boolean;
  setSyncEnabled: (enabled: boolean) => void;
  isSyncing: boolean;
  lastSyncAt: number | null;
  syncNow: () => Promise<void>;
  onSyncComplete: (callback: () => void) => () => void;
  createProject: (project: Omit<Project, 'id' | 'projectId' | 'isDeleted' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  createAddressGroup: (group: Omit<AddressGroup, 'id' | 'isDeleted' | 'updatedAt'>) => Promise<AddressGroup>;
  updateAddressGroup: (group: AddressGroup) => Promise<AddressGroup>;
  deleteAddressGroup: (id: string) => Promise<void>;
  setProjectOwnerValues: (projectId: string, owner: string, values: { userValue1?: number | null; userValue2?: number | null }) => Promise<ProjectOwnerValue>;
}

const SyncContext = createContext<SyncContextType | null>(null);

const SYNC_ENABLED_KEY = 'ownernote_sync_enabled';
const LAST_SYNC_AT_KEY = 'ownernote_last_sync_at';

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { supabase, user : supabaseUser, isAuthenticated, signOut } = useSupabaseAuth();
  
  const [syncEnabled, setSyncEnabledState] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAtState] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const hasInitialSynced = useRef(false);
  const syncInProgressRef = useRef(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  const syncListenersRef = useRef<Set<() => void>>(new Set());
  const syncEnabledRef = useRef(syncEnabled);
  const lastSyncAtRef = useRef<number | null>(null);

  const getSyncKey = (userId: string) => `${LAST_SYNC_AT_KEY}_${userId}`;

  // 初期化: localStorageから設定を読み込み
  useEffect(() => {
    const savedEnabled = localStorage.getItem(SYNC_ENABLED_KEY);
    if (savedEnabled !== null) {
      console.log('Loaded sync enabled from storage:', savedEnabled);
      const isEnabled = JSON.parse(savedEnabled);
      setSyncEnabledState(isEnabled);
      syncEnabledRef.current = isEnabled;
    }
    
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!supabaseUser?.id) return;

    const userSyncKey = getSyncKey(supabaseUser.id);
    const savedLastSync = localStorage.getItem(userSyncKey);
    
    if (savedLastSync !== null) {
      const timestamp = parseInt(savedLastSync);
      lastSyncAtRef.current = timestamp;
      setLastSyncAtState(timestamp);
    } else {
      // 新しいユーザー
      lastSyncAtRef.current = null;
      setLastSyncAtState(null);
    }
  }, [supabaseUser?.id]); // ユーザーが切り替わったら再実行

  // lastSyncAtを更新するヘルパー
  const setLastSyncAt = useCallback((timestamp: number) => {
    if (!supabaseUser?.id) return;

    const userSyncKey = getSyncKey(supabaseUser.id);
    lastSyncAtRef.current = timestamp;
    setLastSyncAtState(timestamp);
    localStorage.setItem(userSyncKey, JSON.stringify(timestamp));
  }, [supabaseUser?.id]);

  // リスナー登録（戻り値は解除関数）
  const onSyncComplete = useCallback((callback: () => void) => {
    syncListenersRef.current.add(callback);
    return () => {
      syncListenersRef.current.delete(callback);
    };
  }, []);

  // リスナーに通知
  const notifySyncComplete = useCallback(() => {
    syncListenersRef.current.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    });
  }, []);

  const canSync = isAuthenticated && syncEnabled && supabase && supabaseUser?.id;

  // 同期実行
  const syncNow = useCallback(async () => {
    console.log("syncNow");

    // 既存のチェックロジックを維持
    console.log(syncInProgressRef.current);
    console.log(syncEnabledRef.current);
    console.log(supabaseUser?.id);
    console.log(supabase);

    if (syncInProgressRef.current || !syncEnabledRef.current || !supabaseUser?.id || !supabase) return;

    syncInProgressRef.current = true;
    setIsSyncing(true);

    console.log("Proceeding to sync...");

    try {
      console.log('[SyncContext] Starting API-based sync...');

      // IndexedDBから時刻からの差分データを取得
      const lastSyncTime = lastSyncAtRef.current || 0;

      const [localGroups, localAddresses, localProjects, localOwnerValues] = await Promise.all([
        dbManager.getAllAddressGroupsModifiedSince(lastSyncTime),
        dbManager.getAllAddressInfosModifiedSince(lastSyncTime),
        dbManager.getAllProjectsModifiedSince(lastSyncTime),
        dbManager.getAllProjectOwnerValuesModifiedSince(lastSyncTime),
      ]);

      const localData = {
        addressGroups: localGroups,
        addresses: localAddresses,
        projects: localProjects,
        ownerValues: localOwnerValues,
      };

      const jsonString = JSON.stringify({ localData });
      const blob = new Blob([jsonString]);
      const sizeInBytes = blob.size;
      const sizeInKB = sizeInBytes / 1024;

      console.log(`[SyncContext] Payload size: ${sizeInBytes} bytes (${sizeInKB.toFixed(2)} KB)`);

      // APIにデータを送信 (ブラウザのロックを回避)
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString,
      });

      if (response.status === 401) {
        // 認証切れ
        console.warn('[SyncContext] 401 Unauthorized detected. Signing out...');
        await signOut(); // セッション切れなのでサインアウトを実行
        return; // 処理を中断
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Sync API error: ${response.statusText}`);
      }

      const { toLocal } = (await response.json()) as SyncResponse;

      // APIから受け取った「リモートの方が新しいデータ」をIndexedDBに反映
      // db.ts の既存の upsert メソッドをループで実行
      if (toLocal.addressGroups && toLocal.addressGroups.length > 0) {
        for (const item of toLocal.addressGroups) {
          await dbManager.upsertAddressGroup(item);
        }
      }

      await Promise.all([
        ...(toLocal.addresses || []).map((item: AddressInfo) => dbManager.upsertAddressInfo(item)),
        ...(toLocal.projects || []).map((item: Project) => dbManager.upsertProject(item)),
        ...(toLocal.ownerValues || []).map((item: ProjectOwnerValue) => dbManager.upsertProjectOwnerValue(item)),
      ]);

      // 同期完了後の状態更新
      setLastSyncAt(Date.now());
      console.log('[SyncContext] Sync completed via API');

    } catch (error) {
      console.error('[SyncContext] Sync failed:', error);
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false); // 同期中フラグを解除
      notifySyncComplete(); // 全ての処理が終わってから通知
    }
  }, [supabaseUser?.id, supabase, setLastSyncAt, notifySyncComplete, signOut]);

  const requestSync = useCallback(() => {
    console.log("requestSync");
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    // 変更があってから5000ms後に1回だけ同期を実行する
    syncTimerRef.current = setTimeout(() => {
      console.log("call syncNow");
      syncNow();
    }, 5000);
  }, [syncNow]);

  // 同期設定の保存 + 有効化時に即座に同期
  const setSyncEnabled = useCallback(async (enabled: boolean) => {
    console.log('Setting sync enabled to:', enabled);
    setSyncEnabledState(enabled);
    syncEnabledRef.current = enabled;
    localStorage.setItem(SYNC_ENABLED_KEY, JSON.stringify(enabled));
    console.log(isAuthenticated)
    console.log(supabaseUser?.id)
    if (enabled && isAuthenticated && supabaseUser?.id) {
      console.log("call requestSync");
      requestSync();
    }
  }, [isAuthenticated, supabaseUser?.id, requestSync]);

  // 認証完了 + 同期有効時に自動同期（初回のみ）
  useEffect(() => {
    if (!isInitialized) return;
    if (!canSync) {
      hasInitialSynced.current = false;
      return;
    }
    if (hasInitialSynced.current) return;
    
    hasInitialSynced.current = true;
    syncNow();
  }, [isInitialized, canSync, syncNow]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // タブが非アクティブになった時に同期を実行
      if (document.visibilityState === 'hidden' && canSync) {
        syncNow();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [canSync, syncNow]);

  // CRUD操作
  const createProject = useCallback(async (
    project: Omit<Project, 'id' | 'projectId' | 'isDeleted' | 'createdAt' | 'updatedAt'>
  ) => {
    console.log('Creating project:', project);
    const result = await dbManager.addProject(project);
    console.log('Project created:', result);
    return result;
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    await dbManager.softDeleteProject(projectId);
  }, []);

  const updateProject = useCallback(async (project: Project) => {
    const result = await dbManager.updateProject(project);
    return result;
  }, []);

  const createAddressGroup = useCallback(async (
    group: Omit<AddressGroup, 'id' | 'isDeleted' | 'updatedAt'>
  ) => {
    const result = await dbManager.createAddressGroup(group);
    return result;
  }, []);

  const updateAddressGroup = useCallback(async (group: AddressGroup) => {
    const result = await dbManager.updateAddressGroup(group);
    return result;
  }, []);

  const deleteAddressGroup = useCallback(async (id: string) => {
    await dbManager.softDeleteAddressGroup(id);
  }, []);

  const setProjectOwnerValues = useCallback(async (
    projectId: string,
    owner: string,
    values: { userValue1?: number | null; userValue2?: number | null }
  ) => {
    const result = await dbManager.setProjectOwnerValues(projectId, owner, values);
    return result;
  }, []);

  return (
    <SyncContext.Provider
      value={{
        syncEnabled,
        setSyncEnabled,
        isSyncing,
        lastSyncAt,
        syncNow,
        onSyncComplete,
        createProject,
        updateProject,
        deleteProject,
        createAddressGroup,
        updateAddressGroup,
        deleteAddressGroup,
        setProjectOwnerValues,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

// SyncContext用フック
export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

// 同期完了リスナー用フック
export function useSyncListener(onComplete: () => void) {
  const { onSyncComplete } = useSync();
  
  useEffect(() => {
    const unsubscribe = onSyncComplete(onComplete);
    return unsubscribe;
  }, [onSyncComplete, onComplete]);
}
