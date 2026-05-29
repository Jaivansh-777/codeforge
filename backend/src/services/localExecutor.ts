import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LANG_CONFIG: Record<string, { filename: string; compile?: string; run: string[] }> = {
  python: { filename: 'main.py', run: ['python3', 'main.py'] },
  javascript: { filename: 'main.js', run: ['node', 'main.js'] },
  php: { filename: 'main.php', run: ['php', 'main.php'] },
  java: { filename: 'Main.java', compile: 'javac Main.java', run: ['java', 'Main'] },
  c: { filename: 'main.c', compile: 'gcc -O2 -Wall -o main main.c', run: ['./main'] },
  cpp: { filename: 'main.cpp', compile: 'g++ -O2 -Wall -o main main.cpp', run: ['./main'] },
  assembly: { filename: 'main.asm', compile: 'nasm -f elf64 main.asm -o main.o && ld main.o -o main', run: ['./main'] },
};

export async function executeLocal(
  options: { language: string; code: string; input?: string; timeoutMs?: number },
  onStdout?: (data: string) => void,
  onStderr?: (data: string) => void,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  const langConfig = LANG_CONFIG[options.language];
  if (!langConfig) {
    throw new Error(`Unsupported language: ${options.language}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
  const timeoutMs = options.timeoutMs ?? 10000;
  let timedOut = false;

  try {
    fs.writeFileSync(path.join(tmpDir, langConfig.filename), options.code, 'utf-8');

    if (options.input) {
      fs.writeFileSync(path.join(tmpDir, 'input.txt'), options.input, 'utf-8');
    }

    if (langConfig.compile) {
      try {
        execSync(langConfig.compile, { cwd: tmpDir, timeout: timeoutMs });
      } catch (compileErr: any) {
        const stderr = compileErr.stderr?.toString() || compileErr.message || 'Compilation failed';
        return { stdout: '', stderr, exitCode: compileErr.status ?? 1, timedOut: false };
      }
    }

    return await new Promise((resolve, reject) => {
      const child = spawn(langConfig.run[0], langConfig.run.slice(1), {
        cwd: tmpDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        resolve({ stdout, stderr, exitCode: child.exitCode, timedOut });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        stdout += text;
        onStdout?.(text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        stderr += text;
        onStderr?.(text);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve({ stdout, stderr: err.message, exitCode: null, timedOut });
        }
      });

      child.on('close', () => {
        clearTimeout(timer);
        finish();
      });

      if (options.input && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export function getSupportedLanguagesLocal() {
  return Object.keys(LANG_CONFIG).map((key) => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
  }));
}
