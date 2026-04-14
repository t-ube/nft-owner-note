import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/syncSession';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ session: null });
  }
  return NextResponse.json({
    session: {
      address: session.address,
      expiresAt: session.expiresAt,
    },
  });
}
