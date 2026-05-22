import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const OUTPUT_LIMIT = 65536;
const TIMEOUT = 10_000;

interface ExecResult {
  output: string;
  error: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  memoryUsedKb: number;
  cpuTimeMs: number;
}

const LANG_CONFIG: Record<string, { filename: string; compile?: string; run: string }> = {
  python: {
    filename: 'main.py',
    run: 'python3 main.py',
  },
  c: {
    filename: 'main.c',
    compile: 'gcc -O2 -Wall -o main main.c',
    run: './main',
  },
  cpp: {
    filename: 'main.cpp',
    compile: 'g++ -O2 -Wall -o main main.cpp',
    run: './main',
  },
  javascript: {
    filename: 'main.js',
    run: 'node main.js',
  },
  php: {
    filename: 'main.php',
    run: 'php main.php',
  },
  java: {
    filename: 'Main.java',
    compile: 'javac Main.java',
    run: 'java Main',
  },
  assembly: {
    filename: 'main.asm',
    compile: 'nasm -f elf64 main.asm -o main.o && ld main.o -o main',
    run: './main',
  },
};

export function getSupportedLanguages() {
  return Object.keys(LANG_CONFIG).map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) }));
}

function execWithTimeout(cmd: string, cwd: string, timeout: number): { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean } {
  const start = Date.now();
  try {
    const out = execSync(cmd, { cwd, timeout, maxBuffer: OUTPUT_LIMIT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout: out || '', stderr: '', exitCode: 0, timedOut: false };
  } catch (e: any) {
    const stdout = e.stdout || '';
    const stderr = e.stderr || '';
    const timedOut = e.killed || e.signal === 'SIGTERM' || (Date.now() - start) >= timeout;
    return { stdout, stderr, exitCode: e.status ?? 1, timedOut };
  }
}

export async function executeCode(params: { language: string; code: string; input?: string }): Promise<ExecResult> {
  const config = LANG_CONFIG[params.language];
  if (!config) throw new Error(`Unsupported language: ${params.language}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberclasses-'));
  const startTime = Date.now();

  try {
    fs.writeFileSync(path.join(tmpDir, config.filename), params.code);
    if (params.input) fs.writeFileSync(path.join(tmpDir, 'input.txt'), params.input);

    let compileTime = 0;
    if (config.compile) {
      const compileStart = Date.now();
      const compileResult = execWithTimeout(config.compile, tmpDir, TIMEOUT);
      compileTime = Date.now() - compileStart;
      if (compileResult.exitCode !== 0) {
        const totalTime = Date.now() - startTime;
        return { output: compileResult.stdout, error: compileResult.stderr, exitCode: compileResult.exitCode, executionTimeMs: totalTime, timedOut: compileResult.timedOut, memoryUsedKb: 0, cpuTimeMs: totalTime };
      }
    }

    const runResult = execWithTimeout(config.run, tmpDir, TIMEOUT);
    const totalTime = Date.now() - startTime;

    return {
      output: runResult.stdout.slice(0, OUTPUT_LIMIT),
      error: runResult.stderr.slice(0, OUTPUT_LIMIT),
      exitCode: runResult.exitCode,
      executionTimeMs: totalTime,
      timedOut: runResult.timedOut,
      memoryUsedKb: 0,
      cpuTimeMs: totalTime,
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
