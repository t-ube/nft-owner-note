import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {

  try {
    const cookieStore = cookies()
    
    let userId = cookieStore.get('user_id')?.value
    const isNewUser = !userId

    if (!userId) {
      userId = uuidv4()
    }

    const body = await req.json().catch(() => null)
    const path = req.headers.get('referer') || ''
    const ownerListCount =
      typeof body.owner_list_count === 'number' ? body.owner_list_count : null
    const issuer = typeof body.issuer === 'string' ? body.issuer : null
    const taxon = typeof body.taxon === 'number' ? body.taxon : null
    
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.ip ||
      ''

    const { data, error } = await supabase
        .from('visits')
        .insert([
          { 
            user_id: userId,
            path,
            ip,
            user_agent: req.headers.get('user-agent') || '',
            owner_list_count: ownerListCount,
            issuer,
            taxon
          }
        ])
        .select()
        .single()
      
      if (error) {
        console.error('Supabase error during insert:', error)
        return NextResponse.json({ error: 'Database error during registration' }, { status: 500 })
      }
    
    const res = NextResponse.json({ ok: true, visit: data });

    if (isNewUser) {
      res.cookies.set('user_id', userId!, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      })
    }

    return res
    
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
