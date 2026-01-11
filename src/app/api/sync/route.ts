import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/crypto';
import { Project } from '@/utils/db';

export const runtime = 'edge';

interface BaseEntity {
  updatedAt: number;
}

// ローカル/アプリ内で扱う型
interface AddressGroup extends BaseEntity {
  id: string;
  name?: string;
  addresses: string[];
  xAccount?: string;
  memo?: string;
  isDeleted: boolean;
}

// DB(Supabase)のテーブル構造に合わせた型
interface RemoteAddressGroup {
  id: string;
  user_id: string;
  name: string | null;       // 暗号化された文字列
  addresses: string[] | null;
  x_account: string | null;
  memo: string | null;       // 暗号化された文字列
  is_deleted: boolean;
  updated_at: number;
}

interface RemoteProject {
  id: string;
  user_id: string;
  project_id: string;
  name: string;        // 暗号化された文字列
  issuer: string;
  taxon: string;
  is_deleted: boolean;
  created_at: number;
  updated_at: number;
}

// 汎用マージ関数の型
interface MergeResult<T, R = T> {
  toLocal: T[];
  toRemote: R[];
}

// リクエストボディの型
interface SyncRequestPayload {
  localData: {
    addressGroups: AddressGroup[];
    addresses: Array<BaseEntity & { address: string; groupId: string; isDeleted: boolean }>;
    projects: Array<BaseEntity & { id: string; projectId: string; name: string; issuer: string; taxon: string; isDeleted: boolean; createdAt: number }>;
    ownerValues: Array<BaseEntity & { id: string; projectId: string; owner: string; isDeleted: boolean; userValue1: string; userValue2: string }>;
  };
}

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

export async function POST(req: Request) {
  console.log('[API] raw cookie header:', req.headers.get('cookie')?.slice(0, 200));

  const cookieStore = await cookies();
  // ユーザー特定 (非推奨警告 ts(6387) を回避する最新シグネチャ)
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  /*
  サーバーサイドでは決して getSession を信用してはいけない
  const { data: { session }, error: authError } = await authClient.auth.getSession();

  if (authError || !session?.user) {
    console.error('[API] Auth error:', authError?.message);
    return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 });
  }

  const user = session.user;
  */
  
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError || !user) {
    console.error('[API] Auth error:', authError?.message);
    return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 });
  }

  const admin = createAdminClient();
  const { localData } = (await req.json()) as SyncRequestPayload;

  const encryptionKey = user.user_metadata?.encryption_key;

  try {
    // 全テーブルのリモートデータを一括取得
    const [rGroups, rAddrs, rProjs, rValues] = await Promise.all([
      admin.from('address_groups').select('*').eq('user_id', user.id),
      admin.from('addresses').select('*').eq('user_id', user.id),
      admin.from('projects').select('*').eq('user_id', user.id),
      admin.from('project_owner_values').select('*').eq('user_id', user.id),
    ]);

    // マージロジックの実行 (SyncManager.ts の mergeByUpdatedAt を再現)
    const syncResults = {
      addressGroups: await mergeAddressGroups(localData.addressGroups, rGroups.data || [], user.id, encryptionKey),
      addresses: mergeGeneric(localData.addresses, (rAddrs.data || []).map(r => ({
        address: r.address,
        groupId: r.group_id,
        isDeleted: r.is_deleted,
        updatedAt: r.updated_at
      })), 'address'),
      projects: await mergeProjects(localData.projects, rProjs.data || [], user.id, encryptionKey),
      ownerValues: mergeGeneric(localData.ownerValues, (rValues.data || []).map(r => ({
        id: r.id,
        projectId: r.project_id,
        owner: r.owner,
        isDeleted: r.is_deleted,
        userValue1: r.user_value1,
        userValue2: r.user_value2,
        updatedAt: r.updated_at
      })), 'id')
    };

    // リモートDBへの書き込み (Admin権限で一括実行)
    await Promise.all([
      syncResults.addressGroups.toRemote.length > 0 && admin.from('address_groups').upsert(syncResults.addressGroups.toRemote),
      syncResults.addresses.toRemote.length > 0 && admin.from('addresses').upsert(syncResults.addresses.toRemote.map(i => ({
        address: i.address, user_id: user.id, group_id: i.groupId, is_deleted: i.isDeleted, updated_at: i.updatedAt
      }))),
      syncResults.projects.toRemote.length > 0 && admin.from('projects').upsert(syncResults.projects.toRemote),
      syncResults.ownerValues.toRemote.length > 0 && admin.from('project_owner_values').upsert(syncResults.ownerValues.toRemote.map(i => ({
        id: i.id, user_id: user.id, project_id: i.projectId, owner: i.owner, is_deleted: i.isDeleted, user_value1: i.userValue1, user_value2: i.userValue2, updated_at: i.updatedAt
      })))
    ]);

    return NextResponse.json({
      success: true,
      toLocal: {
        addressGroups: syncResults.addressGroups.toLocal,
        addresses: syncResults.addresses.toLocal,
        projects: syncResults.projects.toLocal,
        ownerValues: syncResults.ownerValues.toLocal,
      }
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// --- ヘルパー関数 (SyncManager.ts のロジックを移植) ---

async function mergeAddressGroups(local: AddressGroup[], remote: RemoteAddressGroup[], userId: string, key: string) {
  
  // 既存ロジック通り、リモートデータをフォーマット
  const formattedRemote: AddressGroup[] = await Promise.all(remote.map(async r => ({
    id: r.id,
    name: r.name && key ? await decrypt(r.name, key) : (r.name ?? undefined),
    addresses: r.addresses || [],
    xAccount: r.x_account ?? undefined,
    memo: r.memo && key ? await decrypt(r.memo, key) : (r.memo ?? undefined), // サーバー側で復号
    isDeleted: r.is_deleted,
    updatedAt: r.updated_at
  })));

  const { toLocal: tl, toRemote: tr } = mergeGeneric(local, formattedRemote, 'id');

  // リモートへ送る分は暗号化
  const encryptedRemote = await Promise.all(tr.map(async item => ({
    id: item.id,
    user_id: userId,
    name: item.name && key ? await encrypt(item.name, key) : item.name,
    addresses: item.addresses,
    x_account: item.xAccount,
    memo: item.memo && key ? await encrypt(item.memo, key) : item.memo, // サーバー側で暗号化
    is_deleted: item.isDeleted,
    updated_at: item.updatedAt
  })));

  return { toLocal: tl, toRemote: encryptedRemote };
}

async function mergeProjects(local: Project[], remote: RemoteProject[], userId: string, key: string) {
  const formattedRemote: Project[] = await Promise.all(remote.map(async r => ({
    id: r.id,
    projectId: r.project_id,
    name: r.name && key ? await decrypt(r.name, key) : (r.name ?? ""), // 復号
    issuer: r.issuer,
    taxon: r.taxon,
    isDeleted: r.is_deleted,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  })));

  const { toLocal: tl, toRemote: tr } = mergeGeneric(local, formattedRemote, 'id');

  const encryptedRemote = await Promise.all(tr.map(async item => ({
    id: item.id,
    user_id: userId,
    project_id: item.projectId,
    name: item.name && key ? await encrypt(item.name, key) : item.name, // 暗号化
    issuer: item.issuer,
    taxon: item.taxon,
    is_deleted: item.isDeleted,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  })));

  return { toLocal: tl, toRemote: encryptedRemote };
}

function mergeGeneric<T extends BaseEntity>(
  local: T[], 
  remote: T[], 
  key: keyof T
): MergeResult<T> {
  const toLocal: T[] = [];
  const toRemote: T[] = [];
  const localMap = new Map(local.map(i => [i[key], i]));
  const remoteMap = new Map(remote.map(i => [i[key], i]));

  for (const lItem of local) {
    const rItem = remoteMap.get(lItem[key]);
    if (!rItem || lItem.updatedAt > rItem.updatedAt) toRemote.push(lItem);
    else if (lItem.updatedAt < rItem.updatedAt) toLocal.push(rItem);
  }
  for (const rItem of remote) {
    if (!localMap.has(rItem[key])) toLocal.push(rItem);
  }
  return { toLocal, toRemote };
}