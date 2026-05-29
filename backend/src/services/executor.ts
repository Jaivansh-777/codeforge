import { dockerPool, type ExecOptions, type ExecResult } from './dockerPool';
import { config } from '../config';

const OUTPUT_LIMIT = config.execution.outputLimit;

interface AnalyzeResult {
  error: string;
  output: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  python: 'Python', c: 'C', cpp: 'C++', javascript: 'JavaScript',
  php: 'PHP', java: 'Java', assembly: 'Assembly',
};

export function getSupportedLanguages() {
  return [
    { id: 'python', name: 'Python' },
    { id: 'c', name: 'C' },
    { id: 'cpp', name: 'C++' },
    { id: 'javascript', name: 'JavaScript' },
    { id: 'php', name: 'PHP' },
    { id: 'java', name: 'Java' },
    { id: 'assembly', name: 'Assembly' },
  ];
}

function analyzeError(language: string, code: string, stderr: string, stdout: string, exitCode: number | null, timedOut: boolean): AnalyzeResult {
  let error = stderr || '';
  let output = stdout || '';

  if (timedOut) {
    return { error: 'Execution stopped: timeout reached.\nYour code may have an infinite loop or be too slow.', output };
  }

  if (language === 'c' || language === 'cpp') {
    if (error.includes('-Wformat') || error.includes('format not a string literal')) {
      error = `⚠️ Format string warning detected in printf()!\n\n` +
        `Instead of:  printf(variable)\n` +
        `Use:         printf("%d", variable)   (for integers)\n` +
        `             printf("%s", variable)   (for strings)\n` +
        `             printf("%f", variable)   (for floats)\n\n` +
        `Original warning:\n${error}`;
    }
    if (exitCode !== 0 && (error.includes('Segmentation fault') || error.includes('SIGSEGV') || error.includes('signal 11') || output.includes('Segmentation fault'))) {
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
          `Original error:\n${error}`;
      }
    }
    if (exitCode !== 0 && !error.trim()) {
      error = `Program exited with code ${exitCode}. This may indicate a runtime error.\n` +
        `Try compiling with -g and using a debugger, or add more error handling.\n`;
    }
  }

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

  if (language === 'java') {
    if (error.includes('Exception in thread')) {
      error = `☕ Java exception thrown!\n\n` +
        `The program encountered a runtime error. Check the exception type and stack trace below.\n\n` +
        `Original error:\n${error}`;
    }
  }

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
  console.log(`[execute] Starting ${params.language} execution via Docker pool`);
  const startTime = Date.now();

  try {
    const result = await dockerPool.execute({
      language: params.language,
      code: params.code,
      input: params.input || '',
      timeoutMs: config.execution.timeout * 1000,
    });

    const totalTime = Date.now() - startTime;

    const analyzed = analyzeError(
      params.language,
      params.code,
      result.error,
      result.output,
      result.exitCode,
      result.timedOut,
    );

    return {
      output: analyzed.output.slice(0, OUTPUT_LIMIT),
      error: analyzed.error.slice(0, OUTPUT_LIMIT),
      exitCode: result.exitCode,
      executionTimeMs: totalTime,
      timedOut: result.timedOut,
      memoryUsedKb: 0,
      cpuTimeMs: totalTime,
    };
  } catch (err: any) {
    return {
      output: '',
      error: err.message || 'Execution failed',
      exitCode: -1,
      executionTimeMs: Date.now() - startTime,
      timedOut: false,
      memoryUsedKb: 0,
      cpuTimeMs: Date.now() - startTime,
    };
  }
}

export async function executeCodeStreaming(
  params: { language: string; code: string; input?: string },
  onStdout: (data: string) => void,
  onStderr: (data: string) => void,
): Promise<ExecResult> {
  console.log(`[execute] Starting streaming ${params.language} execution`);

  const startTime = Date.now();
  let stdoutAccum = '';
  let stderrAccum = '';

  const wrappedStdout = (data: string) => {
    stdoutAccum += data;
    onStdout(data);
  };

  const wrappedStderr = (data: string) => {
    stderrAccum += data;
    onStderr(data);
  };

  try {
    const result = await dockerPool.execute({
      language: params.language,
      code: params.code,
      input: params.input || '',
      timeoutMs: config.execution.timeout * 1000,
      onStdout: wrappedStdout,
      onStderr: wrappedStderr,
    });

    const totalTime = Date.now() - startTime;

    const analyzed = analyzeError(
      params.language,
      params.code,
      result.error || stderrAccum,
      result.output || stdoutAccum,
      result.exitCode,
      result.timedOut,
    );

    return {
      output: analyzed.output.slice(0, OUTPUT_LIMIT),
      error: analyzed.error.slice(0, OUTPUT_LIMIT),
      exitCode: result.exitCode,
      executionTimeMs: totalTime,
      timedOut: result.timedOut,
      memoryUsedKb: 0,
      cpuTimeMs: totalTime,
    };
  } catch (err: any) {
    const totalTime = Date.now() - startTime;
    return {
      output: stdoutAccum.slice(0, OUTPUT_LIMIT),
      error: (stderrAccum || err.message || 'Execution failed').slice(0, OUTPUT_LIMIT),
      exitCode: -1,
      executionTimeMs: totalTime,
      timedOut: false,
      memoryUsedKb: 0,
      cpuTimeMs: totalTime,
    };
  }
}
