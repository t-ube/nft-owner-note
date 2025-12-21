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
  createProject: (project: Omit<Project, 'id' | 'projectId' | 'isDeleted' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
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

  // 初期化: localStorageから設定を読み込み
  useEffect(() => {
    const savedEnabled = localStorage.getItem(SYNC_ENABLED_KEY);
    if (savedEnabled !== null) {
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

  const canSync = isAuthenticated && syncEnabled && supabase && supabaseUserId;

  // 同期実行
  const syncNow = useCallback(async () => {
    if (!isAuthenticated || !supabase || !supabaseUserId) return;
    
    setIsSyncing(true);
    try {
      const syncManager = new SyncManager(supabase, supabaseUserId);
      const result = await syncManager.syncAll();
      
      if (result.success) {
        setLastSyncAt(Date.now());
      } else {
        console.error('Sync errors:', result.errors);
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, supabase, supabaseUserId, setLastSyncAt]);

  // 同期設定の保存 + 有効化時に即座に同期
  const setSyncEnabled = useCallback(async (enabled: boolean) => {
    setSyncEnabledState(enabled);
    localStorage.setItem(SYNC_ENABLED_KEY, JSON.stringify(enabled));
    
    if (enabled && isAuthenticated && supabase && supabaseUserId) {
      setIsSyncing(true);
      try {
        const syncManager = new SyncManager(supabase, supabaseUserId);
        const result = await syncManager.syncAll();
        
        if (result.success) {
          setLastSyncAt(Date.now());
        } else {
          console.error('Sync errors:', result.errors);
        }
      } catch (error) {
        console.error('Sync failed:', error);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [isAuthenticated, supabase, supabaseUserId, setLastSyncAt]);

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

  // 自動同期
  const autoSync = useCallback(async () => {
    if (canSync) {
      await syncNow();
    }
  }, [canSync, syncNow]);

  // CRUD操作（省略 - 変更なし）
  const createProject = useCallback(async (
    project: Omit<Project, 'id' | 'projectId' | 'isDeleted' | 'createdAt' | 'updatedAt'>
  ) => {
    const result = await dbManager.addProject(project);
    await autoSync();
    return result;
  }, [autoSync]);

  const deleteProject = useCallback(async (projectId: string) => {
    await dbManager.softDeleteProject(projectId);
    await autoSync();
  }, [autoSync]);

  const createAddressGroup = useCallback(async (
    group: Omit<AddressGroup, 'id' | 'isDeleted' | 'updatedAt'>
  ) => {
    const result = await dbManager.createAddressGroup(group);
    await autoSync();
    return result;
  }, [autoSync]);

  const updateAddressGroup = useCallback(async (group: AddressGroup) => {
    const result = await dbManager.updateAddressGroup(group);
    await autoSync();
    return result;
  }, [autoSync]);

  const deleteAddressGroup = useCallback(async (id: string) => {
    await dbManager.softDeleteAddressGroup(id);
    await autoSync();
  }, [autoSync]);

  const setProjectOwnerValues = useCallback(async (
    projectId: string,
    owner: string,
    values: { userValue1?: number | null; userValue2?: number | null }
  ) => {
    const result = await dbManager.setProjectOwnerValues(projectId, owner, values);
    await autoSync();
    return result;
  }, [autoSync]);

  return (
    <SyncContext.Provider
      value={{
        syncEnabled,
        setSyncEnabled,
        isSyncing,
        lastSyncAt,
        syncNow,
        createProject,
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

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}