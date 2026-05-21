import { Router, Request, Response } from 'express';
import { executeCode, getSupportedLanguages } from '../services/executor';
import { config } from '../config';

const router = Router();

router.post('/execute', async (req: Request, res: Response) => {
  const { language, code, input } = req.body;

  console.log('========================================');
  console.log('[POST /api/execute] Request received');
  console.log(`  Language: ${language}`);
  console.log(`  Code length: ${typeof code === 'string' ? code.length : 0} chars`);
  console.log(`  Input: ${input ? input.slice(0, 100) : '(none)'}`);

  if (!language || !code) {
    console.log('[POST /api/execute] ERROR: Missing language or code');
    return res.status(400).json({ output: '', error: 'Language and code are required.', exitCode: -1, executionTimeMs: 0, timedOut: false });
  }

  if (typeof code !== 'string' || code.length > config.execution.maxFileSize) {
    console.log('[POST /api/execute] ERROR: Code too large');
    return res.status(400).json({ output: '', error: `Code exceeds maximum size of ${config.execution.maxFileSize} bytes.`, exitCode: -1, executionTimeMs: 0, timedOut: false });
  }

  const supportedLanguages = getSupportedLanguages().map(l => l.id);
  if (!supportedLanguages.includes(language)) {
    console.log(`[POST /api/execute] ERROR: Unsupported language ${language}`);
    return res.status(400).json({ output: '', error: `Unsupported language: ${language}`, exitCode: -1, executionTimeMs: 0, timedOut: false });
  }

  try {
    console.log('[POST /api/execute] Starting execution...');
    const result = await executeCode({ language, code, input: input || '' });
    console.log(`[POST /api/execute] Execution complete:`);
    console.log(`  Time: ${result.executionTimeMs}ms`);
    console.log(`  Exit code: ${result.exitCode}`);
    console.log(`  Output length: ${result.output.length}`);
    console.log(`  Error length: ${result.error.length}`);

    console.log('========================================');

    return res.json({
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
  } catch (err: any) {
    console.error('[POST /api/execute] EXCEPTION:', err.message);
    console.log('========================================');
    return res.status(500).json({
      success: false,
      output: '',
      error: err.message || 'Internal execution error',
      executionTime: 0,
      language,
      exitCode: -1,
      executionTimeMs: 0,
      timedOut: false,
      memoryUsedKb: 0,
      cpuTimeMs: 0,
    });
  }
});

router.get('/languages', (_req: Request, res: Response) => {
  const langs = getSupportedLanguages();
  console.log(`[GET /api/languages] Returning ${langs.length} languages`);
  return res.json({ languages: langs });
});

router.post('/binary', (req: Request, res: Response) => {
  const { binary } = req.body;
  if (!binary || typeof binary !== 'string') {
    return res.status(400).json({ error: 'Binary string is required.' });
  }
  const cleaned = binary.replace(/\s/g, '');
  if (!/^[01]+$/.test(cleaned)) {
    return res.status(400).json({ error: 'Invalid binary string. Only 0 and 1 allowed.' });
  }
  const decimal = parseInt(cleaned, 2);
  const hex = decimal.toString(16).toUpperCase();
  const octal = decimal.toString(8);
  const ascii = cleaned.length % 8 === 0
    ? cleaned.match(/.{1,8}/g)?.map(b => String.fromCharCode(parseInt(b, 2))).join('')
    : null;
  return res.json({ binary: cleaned, decimal, hex: `0x${hex}`, octal: `0o${octal}`, ascii, length: cleaned.length, nibbles: Math.ceil(cleaned.length / 4), bytes: Math.ceil(cleaned.length / 8) });
});

export default router;
