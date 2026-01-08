// contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useXRPLWallet } from './XRPLWalletContext';
import { dbManager, AddressGroup, Project, ProjectOwnerValue } from '@/utils/db';

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
  const { supabase, supabaseUserId, isAuthenticated } = useXRPLWallet();
  
  const [syncEnabled, setSyncEnabledState] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAtState] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const hasInitialSynced = useRef(false);
  const syncInProgressRef = useRef(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  const syncListenersRef = useRef<Set<() => void>>(new Set());

  // 初期化: localStorageから設定を読み込み
  useEffect(() => {
    const savedEnabled = localStorage.getItem(SYNC_ENABLED_KEY);
    if (savedEnabled !== null) {
      console.log('Loaded sync enabled from storage:', savedEnabled);
      setSyncEnabledState(JSON.parse(savedEnabled));
    }
    
    const savedLastSync = localStorage.getItem(LAST_SYNC_AT_KEY);
    if (savedLastSync !== null) {
      setLastSyncAtState(JSON.parse(savedLastSync));
    }
    
    setIsInitialized(true);
  }, []);

  // lastSyncAtを更新するヘルパー
  const setLastSyncAt = useCallback((timestamp: number) => {
    setLastSyncAtState(timestamp);
    localStorage.setItem(LAST_SYNC_AT_KEY, JSON.stringify(timestamp));
  }, []);

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

  const canSync = isAuthenticated && syncEnabled && supabase && supabaseUserId;

  // 同期実行
  const syncNow = useCallback(async () => {
    // 既存のチェックロジックを維持
    if (syncInProgressRef.current || !syncEnabled || !supabaseUserId) return;

    const { data: { session }, error } = await supabase.auth.getSession();

    if (!session || error) {
      console.warn('[SyncContext] Session is invalid. Skipping sync.');
      return;
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);
    try {
      console.log('[SyncContext] Starting API-based sync...');

      // 1. IndexedDBから全データを取得 (db.ts の既存メソッドを使用)
      const [localGroups, localAddresses, localProjects, localOwnerValues] = await Promise.all([
        dbManager.getAllAddressGroupsIncludingDeleted(),
        dbManager.getAllAddressInfosIncludingDeleted(),
        dbManager.getAllProjectsIncludingDeleted(),
        dbManager.getAllProjectOwnerValuesIncludingDeleted(),
      ]);

      // 2. APIにデータを送信 (ブラウザのロックを回避)
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localData: {
            addressGroups: localGroups,
            addresses: localAddresses,
            projects: localProjects,
            ownerValues: localOwnerValues,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Sync API error: ${response.statusText}`);
      }

      const { toLocal } = await response.json();

      // 3. APIから受け取った「リモートの方が新しいデータ」をIndexedDBに反映
      // db.ts の既存の upsert メソッドをループで実行
      await Promise.all([
        ...(toLocal.addressGroups || []).map((item: any) => dbManager.upsertAddressGroup(item)),
        ...(toLocal.addresses || []).map((item: any) => dbManager.upsertAddressInfo(item)),
        ...(toLocal.projects || []).map((item: any) => dbManager.upsertProject(item)),
        ...(toLocal.ownerValues || []).map((item: any) => dbManager.upsertProjectOwnerValue(item)),
      ]);

      // 4. 同期完了後の状態更新
      setLastSyncAt(Date.now());
      console.log('[SyncContext] Sync completed via API');

    } catch (error) {
      console.error('[SyncContext] Sync failed:', error);
      // 必要であればここでトースト通知などのエラー処理
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false); // 同期中フラグを解除
      notifySyncComplete(); // 全ての処理が終わってから通知
    }
  }, [syncEnabled, supabaseUserId, setLastSyncAt]);

  const requestSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    // 変更があってから5000ms後に1回だけ同期を実行する
    syncTimerRef.current = setTimeout(() => {
      syncNow();
    }, 5000);
  }, [syncNow]);

  // 同期設定の保存 + 有効化時に即座に同期
  const setSyncEnabled = useCallback(async (enabled: boolean) => {
    console.log('Setting sync enabled to:', enabled);
    setSyncEnabledState(enabled);
    localStorage.setItem(SYNC_ENABLED_KEY, JSON.stringify(enabled));
    if (enabled && isAuthenticated && supabaseUserId) {
      requestSync(); 
    }
  }, [isAuthenticated, supabaseUserId, syncNow]);

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
    //requestSync();
    console.log('Sync after project creation done');
    return result;
  }, [requestSync]);

  const deleteProject = useCallback(async (projectId: string) => {
    await dbManager.softDeleteProject(projectId);
    //requestSync();
  }, [requestSync]);

  const updateProject = useCallback(async (project: Project) => {
    const result = await dbManager.updateProject(project);
    //requestSync();
    return result;
  }, [requestSync]);

  const createAddressGroup = useCallback(async (
    group: Omit<AddressGroup, 'id' | 'isDeleted' | 'updatedAt'>
  ) => {
    const result = await dbManager.createAddressGroup(group);
    //requestSync();
    return result;
  }, [requestSync]);

  const updateAddressGroup = useCallback(async (group: AddressGroup) => {
    const result = await dbManager.updateAddressGroup(group);
    //requestSync();
    return result;
  }, [requestSync]);

  const deleteAddressGroup = useCallback(async (id: string) => {
    await dbManager.softDeleteAddressGroup(id);
    //requestSync();
  }, [requestSync]);

  const setProjectOwnerValues = useCallback(async (
    projectId: string,
    owner: string,
    values: { userValue1?: number | null; userValue2?: number | null }
  ) => {
    const result = await dbManager.setProjectOwnerValues(projectId, owner, values);
    //requestSync();
    return result;
  }, [requestSync]);

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
