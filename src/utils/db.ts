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
  updatedAt: number;    // 更新日時
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
  updatedAt: number;        // 更新日時
}

export interface AddressInfo {
  address: string;
  groupId: string | null;  // 所属するグループのID
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

class DatabaseManager {
  private dbName = 'OwnerNoteDB';
  private version = 1;

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
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

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
      };
    });
  }

  // Project Methods
  async addProject(project: Omit<Project, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const db = await this.initDB();
    const projectId = await this.generateProjectId(project);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');

      const now = Date.now();

      const completeProject: Project = {
        id: crypto.randomUUID(),
        projectId,
        createdAt: now,
        updatedAt: now,
        ...project
      };

      const request = store.add(completeProject);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(completeProject);
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
          updatedAt: now,
        };
        
        const putRequest = store.put(updatedValues);
        putRequest.onsuccess = () => resolve(updatedValues);
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

      request.onsuccess = () => resolve(request.result);
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

      request.onsuccess = () => resolve(request.result || undefined);
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
      request.onsuccess = () => {
        const projects = request.result;
        projects.sort((a, b) => a.name.localeCompare(b.name));
        resolve(projects);
      };
    });
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.initDB();
    const project = await this.getProjectByProjectId(id);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['projects', 'nfts', 'projectOwnerValues'], 'readwrite');
      
      // Delete the project
      const projectStore = transaction.objectStore('projects');
      if (project) {
        projectStore.delete(project.id);
      }

      // Delete all associated NFTs
      const nftStore = transaction.objectStore('nfts');
      const nftIndex = nftStore.index('projectId');
      const nftRequest = nftIndex.openCursor(id);

      nftRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete all associated owner values
      const ownerValueStore = transaction.objectStore('projectOwnerValues');
      const ownerValueIndex = ownerValueStore.index('projectId');
      const ownerValueRequest = ownerValueIndex.openCursor(id);

      ownerValueRequest.onsuccess = (event) => {
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
    
      // 1. まず既存のグループ情報と全てのグループを取得
      const getGroupRequest = groupStore.get(group.id);
    
      getGroupRequest.onsuccess = () => {
        const oldGroup = getGroupRequest.result as AddressGroup;
        
        // 他の全グループを取得
        const getAllGroupsRequest = groupStore.getAll();
        
        getAllGroupsRequest.onsuccess = () => {
          const allGroups = getAllGroupsRequest.result as AddressGroup[];
          const otherGroups = allGroups.filter(g => g.id !== group.id);
          
          const oldAddresses = new Set(oldGroup.addresses);
          const newAddresses = new Set(group.addresses);
    
          // 2. 削除されたアドレスを処理
          const removedAddresses = Array.from(oldAddresses)
            .filter(addr => !newAddresses.has(addr));
          
          // 3. 新しく追加されたアドレスを処理
          const addedAddresses = Array.from(newAddresses)
            .filter(addr => !oldAddresses.has(addr));
    
          // 4. 削除されたアドレスの処理
          const removePromises = removedAddresses.map(address => {
            // このアドレスを含む他のグループを探す
            const otherGroupWithAddress = otherGroups.find(g => 
              g.addresses.includes(address)
            );
  
            if (otherGroupWithAddress) {
              // 他のグループで使用されている場合、そのグループIDを設定
              return addressStore.put({
                address,
                groupId: otherGroupWithAddress.id,
                updatedAt: now
              });
            } else {
              // 他のグループで使用されていない場合は削除
              return addressStore.delete(address);
            }
          });
    
          // 5. 追加されたアドレスの処理
          const addPromises = addedAddresses.map(address => {
            return addressStore.put({
              address,
              groupId: group.id,
              updatedAt: now
            });
          });
    
          // 6. グループ情報を更新
          const updateGroupRequest = groupStore.put(updatedGroup);
          
          // 7. 全ての処理の完了を待つ
          Promise.all([...removePromises, ...addPromises])
            .then(() => {
              updateGroupRequest.onsuccess = () => resolve(updatedGroup);
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
          group.addresses.includes(address)
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

  async deleteAddressGroup(id: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
      const groupStore = transaction.objectStore('addressGroups');
      const addressStore = transaction.objectStore('addresses');
  
      // 1. まず削除対象のグループ情報を取得
      const getGroupRequest = groupStore.get(id);
  
      getGroupRequest.onsuccess = async () => {
        const groupToDelete = getGroupRequest.result as AddressGroup;
        if (!groupToDelete) {
          resolve();
          return;
        }
  
        // 2. 他の全てのグループを取得して、アドレスの参照を確認
        const getAllGroupsRequest = groupStore.getAll();
        
        getAllGroupsRequest.onsuccess = () => {
          const allGroups = getAllGroupsRequest.result as AddressGroup[];
          const otherGroups = allGroups.filter(g => g.id !== id);
  
          // 3. 各アドレスについて、他のグループでの使用状況を確認
          const addressUpdates = groupToDelete.addresses.map(address => {
            // このアドレスを含む他のグループを探す
            const otherGroupWithAddress = otherGroups.find(g => 
              g.addresses.includes(address)
            );
  
            if (otherGroupWithAddress) {
              // 他のグループで使用されている場合、そのグループIDを設定
              return addressStore.put({
                address,
                groupId: otherGroupWithAddress.id,
                updatedAt: Date.now()
              });
            } else {
              // 他のグループで使用されていない場合は削除
              return addressStore.delete(address);
            }
          });
  
          // 4. グループを削除
          const deleteGroupRequest = groupStore.delete(id);
          deleteGroupRequest.onerror = () => reject(deleteGroupRequest.error);
  
          // 5. すべての更新が完了するのを待つ
          Promise.all(addressUpdates)
            .then(() => resolve())
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
        const groups = groupRequest.result as AddressGroup[];
        const addressRequest = addressStore.getAll();
        
        addressRequest.onsuccess = () => {
          const addresses = addressRequest.result as AddressInfo[];
          
          // 2. 各アドレスについて、正しいグループ参照を確認・修正
          addresses.forEach(addressInfo => {
            // このアドレスを含む最初のグループを見つける
            const correctGroup = groups.find(group => 
              group.addresses.includes(addressInfo.address)
            );
  
            if (correctGroup) {
              // グループが見つかった場合、groupIdを更新
              if (addressInfo.groupId !== correctGroup.id) {
                addressStore.put({
                  ...addressInfo,
                  groupId: correctGroup.id,
                  updatedAt: Date.now()
                });
              }
            } else {
              // どのグループにも属していない場合は削除
              addressStore.delete(addressInfo.address);
            }
          });
        };
  
        addressRequest.onerror = () => reject(addressRequest.error);
      };
  
      groupRequest.onerror = () => reject(groupRequest.error);
      transaction.oncomplete = () => resolve();
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
          p => p.issuer === issuer && p.taxon === taxon
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