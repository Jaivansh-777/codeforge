import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ status: 'error', message: 'rate limited' }, { status: 429 });
  }

  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
