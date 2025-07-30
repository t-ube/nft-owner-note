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
    if (!userId) {
      userId = uuidv4()
    }

    const path = req.headers.get('referer') || ''
    const { data, error } = await supabase
        .from('visits')
        .insert([
          { 
            user_id: userId,
            path,
            ip: req.headers.get('x-forwarded-for') || '',
            user_agent: req.headers.get('user-agent') || ''
          }
        ])
        .select()
        .single()
      
      if (error) {
        console.error('Supabase error during insert:', error)
        return NextResponse.json({ error: 'Database error during registration' }, { status: 500 })
      }
    
    return NextResponse.json({ ok: true, visit: data });
    
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
