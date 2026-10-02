import { dbManager, type AddressGroup } from '@/utils/db'

export const XRPCAFE_ENDPOINT = 'https://api.xrp.cafe/'

/**
 * xrp.cafe のプロフィール API でユーザー名と X アカウントを引き、アドレス帳に入れる（1 アドレス分）。
 * OwnerList の「自動でプロフィール取得」と同じ流れ:
 *   - アドレス帳のグループに入っていれば、X アカウントが空のときだけ埋める
 *   - 入っていなければ、ユーザー名（無ければ X アカウント）を名前にしてグループを作る
 * 'saved' は保存した、'notFound' は xrp.cafe にプロフィールが無い（名前も X も無い）。
 */
export async function importXrpcafeProfile(address: string): Promise<'saved' | 'notFound'> {
  const response = await fetch(`${XRPCAFE_ENDPOINT}user/profile?xrpAddress=${encodeURIComponent(address)}`)
  if (!response.ok) throw new Error(`xrp.cafe profile: HTTP ${response.status}`)
  const json = await response.json()
  if (json.success === false) return 'notFound'

  const username: string = json.data?.username ?? ''
  const twitter: string = json.data?.twitter ?? ''
  const name = username || twitter
  if (!name) return 'notFound'

  const existingGroups = await dbManager.getAddressGroups(address)
  if (existingGroups.length > 0) {
    const existing = existingGroups[0]
    await dbManager.updateAddressGroup({
      ...existing,
      xAccount: existing.xAccount ? existing.xAccount : twitter || null,
    } as AddressGroup)
  } else {
    await dbManager.createAddressGroup({
      name,
      xAccount: twitter || null,
      addresses: [json.data?.xrp_address || address],
      memo: '',
    } as Omit<AddressGroup, 'id' | 'updatedAt'>)
  }
  // 拡張機能に通知（AddressGroupDialog の保存と同じ）
  window.postMessage({ type: 'OWNERNOTE_UPDATED' }, '*')
  return 'saved'
}
