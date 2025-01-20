// utils/db.ts

export interface Project {
  id: string;
  projectId: string;
  name: string;
  issuer: string;
  taxon: string;
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
  lastTransferredAt?: number | null;
  firstSaleAmount?: number | null;
  firstTransferredAt?: number | null;
  mintedAt?: number | null;
  isOrderMade?: boolean;
  customValue1?: number | null;
  customValue2?: number | null;
  symbol?: string | null;
  memo?: string | null;
}

export interface NFTDetail {
  id: string;
  nftId: string;  // NFTokenのid（プロジェクトID-NFT_ID）と紐付け
  projectId: string;
  name: string;
  lastSaleAmount: number | null;
  lastTransferredAt: number | null;
  isOrderMade: boolean;
  customValue1: number | null;
  customValue2: number | null;
  symbol: string | null;
  memo: string | null;
  updatedAt: number;
}

export interface AddressGroup {
  id: string;           // グループID
  name: string;         // グループ名（表示名）
  addresses: string[];  // 所属するアドレスのリスト
  xAccount: string | null;   // Xアカウント名
  memo: string | null;       // メモ
  customValue1: number | null; // ユーザー定義数値1
  customValue2: number | null; // ユーザー定義数値2
  updatedAt: number;        // 更新日時
}

export interface AddressInfo {
  address: string;
  groupId: string | null;  // 所属するグループのID
  updatedAt: number;
}

class DatabaseManager {
  private dbName = 'OwnerNoteDB';
  private version = 1;

  async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

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
          store.createIndex('nft_id', 'nft_id', { unique: true });
          store.createIndex('owner', 'owner', { unique: false });
          store.createIndex('projectId_nft_id', ['projectId', 'nft_id'], { unique: true });
          store.createIndex('isOrderMade', 'isOrderMade', { unique: false });
          store.createIndex('symbol', 'symbol', { unique: false });
          store.createIndex('firstSaleAmount', 'firstSaleAmount', { unique: false });
          store.createIndex('firstTransferredAt', 'firstTransferredAt', { unique: false });
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
      };
    });
  }

  // Project Methods
  async addProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');

      const now = Date.now();
      const completeProject: Project = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...project
      };

      const request = store.add(completeProject);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(completeProject);
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
      request.onsuccess = () => resolve(request.result || undefined);
    });
  }

  async getAllProjects(): Promise<Project[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readonly');
      const store = transaction.objectStore('projects');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['projects', 'nfts'], 'readwrite');
      
      // Delete the project
      const projectStore = transaction.objectStore('projects');
      projectStore.delete(id);

      // Delete all associated NFTs
      const nftStore = transaction.objectStore('nfts');
      const index = nftStore.index('projectId');
      const nftRequest = index.openCursor(id);

      nftRequest.onsuccess = (event) => {
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
            lastTransferredAt: null,
            isOrderMade: false,
            customValue1: null,
            customValue2: null,
            symbol: null,
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
  async createAddressGroup(group: Omit<AddressGroup, 'id' | 'updatedAt'>): Promise<AddressGroup> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
      const groupStore = transaction.objectStore('addressGroups');
      const addressStore = transaction.objectStore('addresses');

      const now = Date.now();
      const completeGroup: AddressGroup = {
        id: crypto.randomUUID(),
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
            updatedAt: now
          });
        });

        Promise.all(addressUpdates)
          .then(() => resolve(completeGroup))
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
  
      // まず既存のグループ情報を取得
      const getRequest = groupStore.get(group.id);
  
      getRequest.onsuccess = () => {
        const oldGroup = getRequest.result as AddressGroup;
        const oldAddresses = new Set(oldGroup.addresses);
        const newAddresses = new Set(group.addresses);
  
        // 削除されたアドレスのgroupIdをnullに
        const removedAddresses = Array.from(oldAddresses)
          .filter(addr => !newAddresses.has(addr));
  
        // 新しいアドレスのgroupIdを設定
        const addedAddresses = Array.from(newAddresses)
          .filter(addr => !oldAddresses.has(addr));
  
        // 削除されたアドレスの更新
        removedAddresses.forEach(address => {
          addressStore.put({
            address,
            groupId: null,
            updatedAt: now
          });
        });
  
        // 追加されたアドレスの更新
        addedAddresses.forEach(address => {
          addressStore.put({
            address,
            groupId: group.id,
            updatedAt: now
          });
        });
  
        // グループ情報を更新
        const updateRequest = groupStore.put(updatedGroup);
        updateRequest.onsuccess = () => resolve(updatedGroup);
        updateRequest.onerror = () => reject(updateRequest.error);
      };
  
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getAddressGroup(id: string): Promise<AddressGroup | undefined> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addressGroups', 'readonly');
      const store = transaction.objectStore('addressGroups');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || undefined);
    });
  }

  async getAllAddressGroups(): Promise<AddressGroup[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addressGroups', 'readonly');
      const store = transaction.objectStore('addressGroups');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAddressInfo(address: string): Promise<AddressInfo | undefined> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addresses', 'readonly');
      const store = transaction.objectStore('addresses');
      const request = store.get(address);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || undefined);
    });
  }

  async getAllAddressInfos(): Promise<AddressInfo[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('addresses', 'readonly');
      const store = transaction.objectStore('addresses');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

export const dbManager = new DatabaseManager();