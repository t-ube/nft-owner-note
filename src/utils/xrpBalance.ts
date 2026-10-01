import { REST_ENDPOINT } from '@/utils/xrpl'

/**
 * XRP の残高（XRP 単位）をブラウザから直接取る。取れなければ null。
 * サーバー（Cloudflare Workers）経由だと xrplcluster.com に 418 で断られるため、
 * 秘密の値の要らないこの問い合わせはブラウザから行う（xrplcluster.com は CORS を許可している）。
 */
export async function fetchXrpBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(REST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: address, ledger_index: 'validated' }],
      }),
    })
    if (!res.ok) {
      console.warn('Failed to fetch balance:', res.status)
      return null
    }
    const json = await res.json()
    const drops = json?.result?.account_data?.Balance
    if (json?.result?.error || typeof drops !== 'string') {
      console.warn('Failed to fetch balance:', json?.result?.error_message ?? json?.result?.error)
      return null
    }
    return Number(drops) / 1_000_000
  } catch (err) {
    console.error('Balance fetch error:', err)
    return null
  }
}
