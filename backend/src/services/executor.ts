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
  python: { filename: 'main.py', run: 'python3 main.py' },
  c: { filename: 'main.c', compile: 'gcc -O2 -Wall -o main main.c', run: './main' },
  cpp: { filename: 'main.cpp', compile: 'g++ -O2 -Wall -o main main.cpp', run: './main' },
  javascript: { filename: 'main.js', run: 'node main.js' },
  php: { filename: 'main.php', run: 'php main.php' },
  java: { filename: 'Main.java', compile: 'javac Main.java', run: 'java Main' },
  assembly: { filename: 'main.asm', compile: 'nasm -f elf64 main.asm -o main.o && ld main.o -o main', run: './main' },
};

const LANGUAGE_NAMES: Record<string, string> = {
  python: 'Python', c: 'C', cpp: 'C++', javascript: 'JavaScript',
  php: 'PHP', java: 'Java', assembly: 'Assembly',
};

export function getSupportedLanguages() {
  return Object.keys(LANG_CONFIG).map(key => ({
    id: key,
    name: LANGUAGE_NAMES[key] || key,
  }));
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

function analyzeError(language: string, code: string, stderr: string, stdout: string, exitCode: number | null, timedOut: boolean): { error: string; output: string } {
  let error = stderr || '';
  let output = stdout || '';

  if (timedOut) {
    return { error: '⏱ Execution timed out after 10 seconds.\nYour code may have an infinite loop or be too slow.', output };
  }

  // C/C++ smart error detection
  if (language === 'c' || language === 'cpp') {
    // Compile-time: format string warnings
    if (error.includes('-Wformat') || error.includes('format not a string literal')) {
      error = `⚠️ Format string warning detected in printf()!\n\n` +
        `Instead of:  printf(variable)\n` +
        `Use:         printf("%d", variable)   (for integers)\n` +
        `             printf("%s", variable)   (for strings)\n` +
        `             printf("%f", variable)   (for floats)\n\n` +
        `Original warning:\n${error}`;
    }

    // Runtime: segmentation fault
    if (exitCode !== 0 && (error.includes('Segmentation fault') || error.includes('SIGSEGV') || error.includes('signal 11') || output.includes('Segmentation fault'))) {
      // Check for printf with missing format string
      const printfMatch = code.match(/printf\s*\([^"'][^)]*\)/);
      if (printfMatch) {
        error = `💥 Segmentation fault (SIGSEGV) - crash detected!\n\n` +
          `Most likely cause: printf() is missing a format string.\n\n` +
          `Found in your code: ${printfMatch[0].trim()}\n\n` +
          `Fix it by adding a format string as the first argument:\n` +
          `  printf("%d", a + b)    ← for integers\n` +
          `  printf("%s", str)      ← for strings\n` +
          `  printf("%f", x)        ← for floats\n\n` +
          `Original error:\n${error}`;
      } else {
        error = `💥 Segmentation fault (SIGSEGV) - crash detected!\n\n` +
          `Common causes:\n` +
          `  • Dereferencing a null or invalid pointer\n` +
          `  • Array index out of bounds\n` +
          `  • Stack overflow (infinite recursion)\n` +
          `  • Using uninitialized memory\n\n` +
          `Check your array accesses, pointer operations, and recursion depth.\n\n` +
          `Original error:\n${error}`;
      }
    }

    // Runtime: non-zero exit with no stderr (silent crash)
    if (exitCode !== 0 && !error.trim()) {
      error = `Program exited with code ${exitCode}. This may indicate a runtime error.\n` +
        `Try compiling with -g and using a debugger, or add more error handling.\n`;
    }
  }

  // C/C++ compile-time: general helpful suggestions
  if (language === 'c' || language === 'cpp') {
    if (error.includes('undefined reference')) {
      error = `🔗 Linker error: undefined reference.\n\n` +
        `Make sure all functions and variables are defined before use.\n` +
        `Common issues:\n` +
        `  • Misspelled function name\n` +
        `  • Missing function body (declared but not defined)\n` +
        `  • Missing #include for library functions\n\n` +
        `Original error:\n${error}`;
    }
    if (error.includes('expected') && error.includes('before')) {
      error = `❌ Syntax error detected!\n\n` +
        `Check for missing semicolons (;), brackets, or parentheses.\n` +
        `Remember: every statement in C/C++ ends with a semicolon.\n\n` +
        `Original error:\n${error}`;
    }
  }

  // Python runtime errors
  if (language === 'python') {
    if (error.includes('NameError')) {
      error = `🐍 NameError: variable not defined.\n\n` +
        `This usually means you're using a variable before assigning it.\n` +
        `Check for typos or missing assignments.\n\n` +
        `Original error:\n${error}`;
    }
    if (error.includes('IndentationError')) {
      error = `🐍 IndentationError: check your spacing.\n\n` +
        `Python uses indentation (spaces/tabs) to define code blocks.\n` +
        `Make sure all lines in a block have the same indentation.\n\n` +
        `Original error:\n${error}`;
    }
    if (error.includes('TypeError')) {
      error = `🐍 TypeError: operation on incompatible types.\n\n` +
        `You may be trying to add/concat different types (e.g., str + int).\n` +
        `Use str() or int() to convert types explicitly.\n\n` +
        `Original error:\n${error}`;
    }
  }

  // Java runtime errors
  if (language === 'java') {
    if (error.includes('Exception in thread')) {
      error = `☕ Java exception thrown!\n\n` +
        `The program encountered a runtime error. Check the exception type and stack trace below.\n\n` +
        `Original error:\n${error}`;
    }
  }

  // JavaScript runtime errors
  if (language === 'javascript') {
    if (error.includes('ReferenceError')) {
      error = `🟨 ReferenceError: variable not defined.\n\n` +
        `Check for typos or make sure the variable is declared with let/const/var.\n\n` +
        `Original error:\n${error}`;
    }
    if (error.includes('TypeError')) {
      error = `🟨 TypeError: wrong data type.\n\n` +
        `You may be calling a method on undefined/null, or accessing a property that doesn't exist.\n\n` +
        `Original error:\n${error}`;
    }
  }

  return { error, output };
}

export async function executeCode(params: { language: string; code: string; input?: string }): Promise<ExecResult> {
  const config = LANG_CONFIG[params.language];
  if (!config) throw new Error(`Unsupported language: ${params.language}`);

  console.log(`[execute] Starting ${params.language} execution`);
  console.log(`[execute] Code length: ${params.code.length} chars`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeforge-'));
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
        const analyzed = analyzeError(params.language, params.code, compileResult.stderr, compileResult.stdout, compileResult.exitCode, compileResult.timedOut);
        console.log(`[execute] Compilation failed: exit=${compileResult.exitCode}`);
        return {
          output: analyzed.output,
          error: analyzed.error,
          exitCode: compileResult.exitCode,
          executionTimeMs: totalTime,
          timedOut: compileResult.timedOut,
          memoryUsedKb: 0,
          cpuTimeMs: totalTime,
        };
      }
    }

    const runResult = execWithTimeout(config.run, tmpDir, TIMEOUT);
    const totalTime = Date.now() - startTime;

    console.log(`[execute] Execution complete: time=${totalTime}ms, exit=${runResult.exitCode}, output=${runResult.stdout.length}chars`);

    // Analyze runtime results for smart errors
    const analyzed = analyzeError(
      params.language,
      params.code,
      runResult.stderr,
      runResult.stdout,
      runResult.exitCode,
      runResult.timedOut
    );

    return {
      output: analyzed.output.slice(0, OUTPUT_LIMIT),
      error: analyzed.error.slice(0, OUTPUT_LIMIT),
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
