// contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useXRPLWallet } from './XRPLWalletContext';
import { SyncManager } from '@/lib/sync/SyncManager';
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
  const { supabase, supabaseUserId, isAuthenticated, encryptionKey } = useXRPLWallet();
  
  const [syncEnabled, setSyncEnabledState] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAtState] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const hasInitialSynced = useRef(false);

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
    console.log('syncNow called - checking conditions:', {
      isAuthenticated,
      syncEnabled,
      supabase: !!supabase,
      supabaseUserId,
      encryptionKey: encryptionKey,
    });
    
    if (!isAuthenticated || !syncEnabled || !supabase || !supabaseUserId || !encryptionKey) {
      console.log('Sync skipped - conditions not met');
      return;
    }
    
    console.log('Starting sync...');
    setIsSyncing(true);
    try {
      const syncManager = new SyncManager(supabase, supabaseUserId, encryptionKey);
      const result = await syncManager.syncAll();
      console.log('Sync result:', result);
      if (result.success) {
        setLastSyncAt(Date.now());
        notifySyncComplete();
      } else {
        console.error('Sync errors:', result.errors);
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, syncEnabled, supabase, supabaseUserId, encryptionKey, setLastSyncAt, notifySyncComplete]);

  // 同期設定の保存 + 有効化時に即座に同期
  const setSyncEnabled = useCallback(async (enabled: boolean) => {
    console.log('Setting sync enabled to:', enabled);
    setSyncEnabledState(enabled);
    localStorage.setItem(SYNC_ENABLED_KEY, JSON.stringify(enabled));
    
    if (enabled && isAuthenticated && supabase && supabaseUserId && encryptionKey) {
      setIsSyncing(true);
      try {
        const syncManager = new SyncManager(supabase, supabaseUserId, encryptionKey);
        const result = await syncManager.syncAll();
        
        if (result.success) {
          setLastSyncAt(Date.now());
          notifySyncComplete();
        } else {
          console.error('Sync errors:', result.errors);
        }
      } catch (error) {
        console.error('Sync failed:', error);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [isAuthenticated, supabase, supabaseUserId, encryptionKey, setLastSyncAt]);

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

  // CRUD操作（省略 - 変更なし）
  const createProject = useCallback(async (
    project: Omit<Project, 'id' | 'projectId' | 'isDeleted' | 'createdAt' | 'updatedAt'>
  ) => {
    console.log('Creating project:', project);
    const result = await dbManager.addProject(project);
    console.log('Project created:', result);
    await syncNow();
    console.log('Sync after project creation done');
    return result;
  }, [syncNow]);

  const deleteProject = useCallback(async (projectId: string) => {
    await dbManager.softDeleteProject(projectId);
    await syncNow();
  }, [syncNow]);

  const updateProject = useCallback(async (project: Project) => {
    const result = await dbManager.updateProject(project);
    await syncNow();
    return result;
  }, [syncNow]);

  const createAddressGroup = useCallback(async (
    group: Omit<AddressGroup, 'id' | 'isDeleted' | 'updatedAt'>
  ) => {
    const result = await dbManager.createAddressGroup(group);
    await syncNow();
    return result;
  }, [syncNow]);

  const updateAddressGroup = useCallback(async (group: AddressGroup) => {
    const result = await dbManager.updateAddressGroup(group);
    await syncNow();
    return result;
  }, [syncNow]);

  const deleteAddressGroup = useCallback(async (id: string) => {
    await dbManager.softDeleteAddressGroup(id);
    await syncNow();
  }, [syncNow]);

  const setProjectOwnerValues = useCallback(async (
    projectId: string,
    owner: string,
    values: { userValue1?: number | null; userValue2?: number | null }
  ) => {
    const result = await dbManager.setProjectOwnerValues(projectId, owner, values);
    await syncNow();
    return result;
  }, [syncNow]);

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
