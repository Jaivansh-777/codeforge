import { NextRequest, NextResponse } from 'next/server';
import { getSupportedLanguages } from '@/lib/executor';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ languages: [] }, { status: 429 });
  }

  const languages = getSupportedLanguages();
  return NextResponse.json({ languages });
}
