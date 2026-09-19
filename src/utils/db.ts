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
  /** 特典を渡した日時。値があれば使用済み（受け渡しによる使い回しを防ぐため NFT 側に持たせる）。 */
  usedAt?: number | null;
  /** 使用済みにした時点の保有アドレス。 */
  usedOwner?: string | null;
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

/** 容量不足で書き込めなかったときのエラー。 */
export class DatabaseQuotaError extends Error {
  constructor() {
    super('IndexedDB quota exceeded');
    this.name = 'DatabaseQuotaError';
  }
}

/** トランザクションのエラーを、扱いやすい Error に変換する。 */
function toDatabaseError(error: DOMException | null): Error {
  if (error?.name === 'QuotaExceededError') return new DatabaseQuotaError();
  return error ?? new Error('IndexedDB transaction failed');
}

class DatabaseManager {
  private dbName = 'OwnerNoteDB';
  private version = 2;

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

  /** 接続は1つだけ作って使い回す（開きっぱなしの接続がたまるとバージョンアップが止まるため）。 */
  private dbPromise: Promise<IDBDatabase> | null = null;
  private blockedListeners = new Set<() => void>();

  /**
   * 別のタブが古いバージョンで開いたままで、バージョンアップできないときに呼ばれる。
   * 戻り値を呼ぶと解除できる。
   */
  addBlockedListener(listener: () => void): () => void {
    this.blockedListeners.add(listener);
    return () => {
      this.blockedListeners.delete(listener);
    };
  }

  async initDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDB().catch(error => {
        this.dbPromise = null; // 次の呼び出しでやり直せるようにする
        throw error;
      });
    }
    return this.dbPromise;
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);

      request.onblocked = () => {
        console.warn('[db] 別のタブが開いているためバージョンアップできません');
        this.blockedListeners.forEach(listener => listener());
      };

      request.onsuccess = () => {
        const db = request.result;
        // 別のタブがバージョンアップしようとしたら、こちらは閉じて道を譲る
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        db.onclose = () => {
          this.dbPromise = null;
        };
        resolve(db);
      };

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
      };
    });
  }

  /** IDBRequest を待つ（同じトランザクション内で続けて使える）。 */
  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** トランザクションの確定を待つ。中止（容量不足など）も失敗として扱う。 */
  private done(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(toDatabaseError(transaction.error));
      transaction.onabort = () => reject(toDatabaseError(transaction.error));
    });
  }

  /** 保存領域の使用量（バイト）。取得できない環境では null。 */
  async estimateStorage(): Promise<{ usage: number; quota: number } | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number') return null;
    return { usage, quota };
  }

  /** ブラウザによる自動削除を避けるため、永続化を要求する（対応環境のみ）。 */
  async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
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
    const transaction = db.transaction('projects', 'readwrite');
    const now = Date.now();

    const completeProject: Project = {
      id: crypto.randomUUID(),
      projectId,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      ...project
    };

    transaction.objectStore('projects').add(completeProject);
    await this.done(transaction);
    return completeProject;
  }

  // ProjectOwnerValue Methods
  async setProjectOwnerValues(
    projectId: string,
    owner: string,
    values: { userValue1?: number | null; userValue2?: number | null }
  ): Promise<ProjectOwnerValue> {
    const db = await this.initDB();
    const transaction = db.transaction('projectOwnerValues', 'readwrite');
    const store = transaction.objectStore('projectOwnerValues');
    const id = `${projectId}-${owner}`;

    const existingData = await this.request(store.get(id)) as ProjectOwnerValue | undefined;
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

    store.put(updatedValues);
    await this.done(transaction);
    return updatedValues;
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
    const transaction = db.transaction('projectOwnerValues', 'readwrite');
    const index = transaction.objectStore('projectOwnerValues').index('projectId');
    const request = index.openCursor(projectId);

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await this.done(transaction);
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

  /** プロジェクトを保存する（更新日時は自動で更新）。 */
  async updateProject(project: Project): Promise<Project> {
    const db = await this.initDB();
    const transaction = db.transaction('projects', 'readwrite');
    const updatedProject: Project = { ...project, updatedAt: Date.now() };
    transaction.objectStore('projects').put(updatedProject);
    await this.done(transaction);
    return updatedProject;
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.initDB();
    const project = await this.getProjectByProjectId(id);
    const transaction = db.transaction(['projects', 'nfts', 'projectOwnerValues'], 'readwrite');

    if (project) {
      transaction.objectStore('projects').delete(project.id);
    }

    // 関連する NFT とオーナー値も同じトランザクションで消す
    const nftRequest = transaction.objectStore('nfts').index('projectId').openCursor(id);
    nftRequest.onsuccess = () => {
      const cursor = nftRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    const ownerValueRequest = transaction
      .objectStore('projectOwnerValues')
      .index('projectId')
      .openCursor(id);
    ownerValueRequest.onsuccess = () => {
      const cursor = ownerValueRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await this.done(transaction);
  }

  // NFT Methods
  async updateNFTs(projectId: string, nfts: Omit<NFTokenBase, 'id' | 'projectId' | 'updatedAt'>[]): Promise<NFToken[]> {
    const db = await this.initDB();
    const transaction = db.transaction('nfts', 'readwrite');
    const store = transaction.objectStore('nfts');
    const now = Date.now();

    const existingNFTs = await this.request(store.index('projectId').getAll(projectId)) as NFToken[];
    const existingNFTsMap = new Map(existingNFTs.map(nft => [nft.nft_id, nft]));

    const updatedNFTs = nfts.map(nft => {
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

      store.put(completeNFT);
      return completeNFT;
    });

    await this.done(transaction);
    return updatedNFTs;
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
    const transaction = db.transaction('nfts', 'readwrite');
    transaction.objectStore('nfts').put({
      ...nft,
      updatedAt: Date.now()
    });
    await this.done(transaction);
  }

  /**
   * 指定した NFT の使用済み状態をまとめて更新する。
   * `ids` は nfts ストアのキー（`${projectId}-${nft_id}`）。
   */
  async setNFTsUsed(ids: string[], used: boolean, owner?: string | null): Promise<NFToken[]> {
    const db = await this.initDB();
    const transaction = db.transaction('nfts', 'readwrite');
    const store = transaction.objectStore('nfts');
    const now = Date.now();
    const updated: NFToken[] = [];

    for (const id of ids) {
      const nft = await this.request(store.get(id)) as NFToken | undefined;
      if (!nft) continue;
      const next: NFToken = {
        ...nft,
        usedAt: used ? now : null,
        usedOwner: used ? (owner ?? nft.owner) : null,
        updatedAt: now,
      };
      store.put(next);
      updated.push(next);
    }

    await this.done(transaction);
    return updated;
  }

  async clearProjectNFTs(projectId: string): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction('nfts', 'readwrite');
    const request = transaction.objectStore('nfts').index('projectId').openCursor(projectId);

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await this.done(transaction);
  }

  // アドレスグループの操作メソッド
  async createAddressGroup(group: Omit<AddressGroup, 'id' | 'isDeleted' | 'updatedAt'>): Promise<AddressGroup> {
    const db = await this.initDB();
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

    groupStore.add(completeGroup);
    for (const address of group.addresses) {
      addressStore.put({
        address,
        groupId: completeGroup.id,
        isDeleted: false,
        updatedAt: now
      });
    }

    await this.done(transaction);
    return completeGroup;
  }

  async updateAddressGroup(group: AddressGroup): Promise<AddressGroup> {
    const db = await this.initDB();
    const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
    const groupStore = transaction.objectStore('addressGroups');
    const addressStore = transaction.objectStore('addresses');

    const now = Date.now();
    const updatedGroup: AddressGroup = { ...group, updatedAt: now };

    const oldGroup = await this.request(groupStore.get(group.id)) as AddressGroup | undefined;
    const allGroups = await this.request(groupStore.getAll()) as AddressGroup[];
    const otherGroups = allGroups.filter(g => g.id !== group.id);

    const oldAddresses = new Set(oldGroup?.addresses ?? []);
    const newAddresses = new Set(group.addresses);

    // 外されたアドレスは、他のグループにあればそちらへ付け替え、なければ削除
    for (const address of Array.from(oldAddresses)) {
      if (newAddresses.has(address)) continue;
      const otherGroupWithAddress = otherGroups.find(g => g.addresses.includes(address));
      if (otherGroupWithAddress) {
        addressStore.put({
          address,
          groupId: otherGroupWithAddress.id,
          isDeleted: false,
          updatedAt: now
        });
      } else {
        addressStore.delete(address);
      }
    }

    // 追加されたアドレスはこのグループへ
    for (const address of Array.from(newAddresses)) {
      if (oldAddresses.has(address)) continue;
      addressStore.put({
        address,
        groupId: group.id,
        isDeleted: false,
        updatedAt: now
      });
    }

    groupStore.put(updatedGroup);
    await this.done(transaction);
    return updatedGroup;
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
    const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
    const groupStore = transaction.objectStore('addressGroups');
    const addressStore = transaction.objectStore('addresses');

    const groupToDelete = await this.request(groupStore.get(id)) as AddressGroup | undefined;
    if (!groupToDelete) {
      await this.done(transaction);
      return;
    }

    const allGroups = await this.request(groupStore.getAll()) as AddressGroup[];
    const otherGroups = allGroups.filter(g => g.id !== id);
    const now = Date.now();

    // 所属アドレスは、他のグループにあれば付け替え、なければ削除
    for (const address of groupToDelete.addresses) {
      const otherGroupWithAddress = otherGroups.find(g => g.addresses.includes(address));
      if (otherGroupWithAddress) {
        addressStore.put({
          address,
          groupId: otherGroupWithAddress.id,
          isDeleted: false,
          updatedAt: now
        });
      } else {
        addressStore.delete(address);
      }
    }

    groupStore.delete(id);
    await this.done(transaction);
  }

  async repairAddressReferences(): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(['addressGroups', 'addresses'], 'readwrite');
    const groupStore = transaction.objectStore('addressGroups');
    const addressStore = transaction.objectStore('addresses');

    const groups = await this.request(groupStore.getAll()) as AddressGroup[];
    const addresses = await this.request(addressStore.getAll()) as AddressInfo[];
    const now = Date.now();

    for (const addressInfo of addresses) {
      const correctGroup = groups.find(group => group.addresses.includes(addressInfo.address));
      if (!correctGroup) {
        // どのグループにも属していないアドレスは削除
        addressStore.delete(addressInfo.address);
        continue;
      }
      if (addressInfo.groupId !== correctGroup.id) {
        addressStore.put({
          ...addressInfo,
          groupId: correctGroup.id,
          isDeleted: false,
          updatedAt: now
        });
      }
    }

    await this.done(transaction);
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
    const transaction = db.transaction('allowlist', 'readwrite');
    const entry: AllowlistEntry = {
      id: address,
      address,
      mints,
      isManual,
      updatedAt: Date.now()
    };

    transaction.objectStore('allowlist').put(entry);
    await this.done(transaction);
    return entry;
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
    const transaction = db.transaction('allowlist', 'readwrite');
    transaction.objectStore('allowlist').clear();
    await this.done(transaction);
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
    const transaction = db.transaction('allowlistRules', 'readwrite');
    const store = transaction.objectStore('allowlistRules');

    // まず既存のルールを全て削除
    store.clear();

    const now = Date.now();
    const savedRules = rules.map(rule => {
      const completeRule: AllowlistRule = {
        id: crypto.randomUUID(),
        updatedAt: now,
        ...rule
      };
      store.add(completeRule);
      return completeRule;
    });

    await this.done(transaction);
    // minNFTs の降順でソート
    savedRules.sort((a, b) => b.minNFTs - a.minNFTs);
    return savedRules;
  }
}

export const dbManager = new DatabaseManager();