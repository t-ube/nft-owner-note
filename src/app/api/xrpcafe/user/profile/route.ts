export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { XRPCAFE_ENDPOINT } from '@/utils/xrpcafe'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { address } = body

  if (!address) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
  }

  try {
    const url = `${XRPCAFE_ENDPOINT}user/profile?xrpAddress=${address}`
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `xrp.cafe API error: ${response.statusText}` },
        { status: response.status }
      )
    }

    /*
    {
      "success": true,
      "data": {
          "xrp_address": "r3qebgzfnj8odT4uLUk7CkikwnocE1HFgB",
          "username": "SPEC",
          "bio": "",
          "userProfileImage": "https://cdn.xrp.cafe/profile-9f3239d19a3f-4ab5-a14a-04d8c063d08c.webp",
          "bannerImage": "https://cdn.xrp.cafe/banner-21045b2c5091-4ad9-8d4f-2ea205e144f1.webp",
          "twitter": "",
          "website": "",
          "pinnedNftIds": [],
          "linkedProjectsOrder": [],
          "followersCount": 21,
          "followingCount": 0,
          "linkedProjects": []
      }
    }
    */

    const json = await response.json()

    if (json.success === false) {
      return NextResponse.json(
        { error: 'xrp.cafe API error' },
        { status: 500 }
      )
    }

    const xrp_address: string = json.data?.xrp_address ?? ""
    const username: string = json.data?.username ?? ""
    const twitter: string = json.data?.twitter ?? ""

    return NextResponse.json({ address: xrp_address, username, twitter })
  } catch (error) {
    console.error('Unexpected XRPL proxy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
