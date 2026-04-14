export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { REST_ENDPOINT } from '@/utils/xrpl'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { address } = body

  if (!address) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
  }

  try {
    const response = await fetch(REST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: address, ledger_index: 'validated' }]
      })
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `XRPL RPC error: ${response.statusText}` },
        { status: response.status }
      )
    }

    const json = await response.json()

    if (json.result?.error) {
      return NextResponse.json(
        { error: json.result.error_message || 'XRPL error' },
        { status: 500 }
      )
    }

    const ownerCount = json.result.account_data.OwnerCount || 0
    const accountReserve = 1
    const ownerReserve = 0.2 * ownerCount

    const drops = json.result.account_data.Balance
    const xrp = Number(drops) / 1_000_000
    const availableXrp = Math.floor((xrp - accountReserve - ownerReserve) * 1_000_000) / 1_000_000

    return NextResponse.json({ xrp, raw: drops, availableXrp, data: json.result.account_data })
  } catch (error) {
    console.error('Unexpected XRPL proxy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
