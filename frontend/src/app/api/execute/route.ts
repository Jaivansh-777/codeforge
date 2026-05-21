import { NextRequest, NextResponse } from 'next/server';
import { executeCode, getSupportedLanguages } from '@/lib/executor';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
    const { allowed, remaining, resetAt } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { output: '', error: `Rate limit exceeded. Try again after ${new Date(resetAt).toISOString()}.`, exitCode: -1, executionTimeMs: 0, timedOut: false },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(resetAt) } }
      );
    }

    const { language, code, input } = await req.json();

    if (!language || !code) {
      return NextResponse.json({ output: '', error: 'Language and code are required.', exitCode: -1, executionTimeMs: 0, timedOut: false }, { status: 400 });
    }

    if (typeof code !== 'string' || code.length > 65536) {
      return NextResponse.json({ output: '', error: 'Code exceeds maximum size of 65536 bytes.', exitCode: -1, executionTimeMs: 0, timedOut: false }, { status: 400 });
    }

    const supported = getSupportedLanguages().map(l => l.id);
    if (!supported.includes(language)) {
      return NextResponse.json({ output: '', error: `Unsupported language: ${language}`, exitCode: -1, executionTimeMs: 0, timedOut: false }, { status: 400 });
    }

    const result = await executeCode({ language, code, input: input || '' });

    return NextResponse.json({
      success: result.exitCode === 0,
      output: result.output || '',
      error: result.error || '',
      executionTime: result.executionTimeMs,
      language,
      exitCode: result.exitCode ?? -1,
      executionTimeMs: result.executionTimeMs,
      timedOut: result.timedOut,
      memoryUsedKb: result.memoryUsedKb,
      cpuTimeMs: result.cpuTimeMs,
    });
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      output: '',
      error: e.message || 'Internal execution error',
      executionTime: 0,
      language: '',
      exitCode: -1,
      executionTimeMs: 0,
      timedOut: false,
      memoryUsedKb: 0,
      cpuTimeMs: 0,
    }, { status: 500 });
  }
}
