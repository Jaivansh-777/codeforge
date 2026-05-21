import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

const docker = new Docker();
type DockerContainer = Docker.Container;

const HOST_WORKSPACE = '/tmp/codeforge-workspace';
const CONTAINER_WORKSPACE = '/workspace';

const LANGUAGE_CONFIGS: Record<string, {
  image: string;
  filename: string;
  prepare: (workDir: string, code: string) => Promise<void>;
  execCmd: (codeFile: string) => string[];
}> = {
  python: {
    image: 'codeforge-executor:latest',
    filename: 'main.py',
    prepare: async (workDir, code) => { await fs.writeFile(path.join(workDir, 'main.py'), code); },
    execCmd: () => ['sh', '-c', 'python3 main.py > /code/stdout.txt 2> /code/stderr.txt; echo $? > /code/exit.txt'],
  },
  c: {
    image: 'codeforge-executor:latest',
    filename: 'main.c',
    prepare: async (workDir, code) => { await fs.writeFile(path.join(workDir, 'main.c'), code); },
    execCmd: () => ['sh', '-c', 'gcc -O2 -Wall -o main main.c > /code/stdout.txt 2> /code/stderr.txt; echo $? > /code/exit.txt; if [ -f main ]; then ./main > /code/stdout.txt 2>> /code/stderr.txt; echo $? > /code/exit.txt; fi'],
  },
  cpp: {
    image: 'codeforge-executor:latest',
    filename: 'main.cpp',
    prepare: async (workDir, code) => { await fs.writeFile(path.join(workDir, 'main.cpp'), code); },
    execCmd: () => ['sh', '-c', 'g++ -O2 -Wall -o main main.cpp > /code/stdout.txt 2> /code/stderr.txt; echo $? > /code/exit.txt; if [ -f main ]; then ./main > /code/stdout.txt 2>> /code/stderr.txt; echo $? > /code/exit.txt; fi'],
  },
  javascript: {
    image: 'codeforge-executor:latest',
    filename: 'main.js',
    prepare: async (workDir, code) => { await fs.writeFile(path.join(workDir, 'main.js'), code); },
    execCmd: () => ['sh', '-c', 'node main.js > /code/stdout.txt 2> /code/stderr.txt; echo $? > /code/exit.txt'],
  },
  php: {
    image: 'codeforge-executor:latest',
    filename: 'main.php',
    prepare: async (workDir, code) => { await fs.writeFile(path.join(workDir, 'main.php'), code); },
    execCmd: () => ['sh', '-c', 'php main.php > /code/stdout.txt 2> /code/stderr.txt; echo $? > /code/exit.txt'],
  },
  java: {
    image: 'codeforge-executor:latest',
    filename: 'Main.java',
    prepare: async (workDir, code) => { await fs.writeFile(path.join(workDir, 'Main.java'), code); },
    execCmd: () => ['sh', '-c', 'javac Main.java > /code/stdout.txt 2> /code/stderr.txt; echo $? > /code/exit.txt; java Main >> /code/stdout.txt 2>> /code/stderr.txt; echo $? > /code/exit.txt'],
  },
  assembly: {
    image: 'codeforge-executor:latest',
    filename: 'main.asm',
    prepare: async (workDir, code) => { await fs.writeFile(path.join(workDir, 'main.asm'), code); },
    execCmd: () => ['sh', '-c', 'nasm -f elf64 main.asm -o main.o > /code/stdout.txt 2> /code/stderr.txt; echo $? > /code/exit.txt; ld main.o -o main >> /code/stdout.txt 2>> /code/stderr.txt; echo $? > /code/exit.txt; if [ -f main ]; then ./main >> /code/stdout.txt 2>> /code/stderr.txt; echo $? > /code/exit.txt; fi'],
  },
};

const LANGUAGE_NAMES: Record<string, string> = {
  python: 'Python', c: 'C', cpp: 'C++', javascript: 'JavaScript',
  php: 'PHP', java: 'Java', assembly: 'Assembly',
};

export function getSupportedLanguages() {
  return Object.keys(LANGUAGE_CONFIGS).map(key => ({
    id: key,
    name: LANGUAGE_NAMES[key] || key,
  }));
}

export async function executeCode(params: {
  language: string;
  code: string;
  input?: string;
}): Promise<{
  output: string;
  error: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  memoryUsedKb: number;
  cpuTimeMs: number;
}> {
  const langConfig = LANGUAGE_CONFIGS[params.language];
  if (!langConfig) {
    throw new Error(`Unsupported language: ${params.language}`);
  }

  const execId = uuidv4().slice(0, 8);
  const containerWorkDir = path.join(CONTAINER_WORKSPACE, execId);
  const hostWorkDir = path.join(HOST_WORKSPACE, execId);

  console.log(`[execute] Starting ${params.language} execution [${execId}]`);
  console.log(`[execute] Code length: ${params.code.length} chars`);

  try {
    await fs.mkdir(containerWorkDir, { recursive: true, mode: 0o777 });
    await langConfig.prepare(containerWorkDir, params.code);

    await fs.chmod(containerWorkDir, 0o777).catch(() => {});

    if (params.input) {
      await fs.writeFile(path.join(containerWorkDir, 'input.txt'), params.input);
      await fs.chmod(path.join(containerWorkDir, 'input.txt'), 0o666).catch(() => {});
    }

    const cmd = langConfig.execCmd(langConfig.filename);
    console.log(`[execute] Running: ${cmd.join(' ')}`);

    const container = await docker.createContainer({
      Image: langConfig.image,
      Cmd: cmd,
      WorkingDir: '/code',
      User: '1000:1000',
      HostConfig: {
        Binds: [`${hostWorkDir}:/code:rw,Z`],
        NetworkMode: 'none',
        Memory: config.execution.memoryLimit * 1024 * 1024,
        MemorySwap: 0,
        CpuPeriod: 100000,
        CpuQuota: config.execution.cpuLimit * 100000,
        ReadonlyRootfs: true,
        PidsLimit: 50,
      },
      Env: ['HOME=/tmp'],
    }) as DockerContainer;

    console.log(`[execute] Container created with bind: ${hostWorkDir}:/code`);

    const startTime = Date.now();
    await container.start();
    console.log(`[execute] Container started`);

    if (params.input) {
      try {
        const stdinStream = await container.attach({ stream: true, stdin: true });
        stdinStream.end(params.input);
      } catch (err) {
        console.error('[execute] Stdin attach failed:', err);
      }
    }

    let timedOut = false;
    const timeoutId = setTimeout(async () => {
      timedOut = true;
      try { await container.kill(); } catch {}
    }, config.execution.timeout * 1000);

    let exitCode: number | null = null;
    try {
      const waitResult = await container.wait();
      exitCode = waitResult.StatusCode;
      console.log(`[execute] Container exited with code: ${exitCode}`);
    } catch (err: any) {
      console.error('[execute] Container wait error:', err.message);
      if (err.statusCode === 137) timedOut = true;
    }
    clearTimeout(timeoutId);

    const execTime = Date.now() - startTime;

    if (timedOut) {
      await container.remove({ force: true }).catch(() => {});
      return { output: '', error: 'Execution timed out.', exitCode: 137, executionTimeMs: execTime, timedOut: true, memoryUsedKb: 0, cpuTimeMs: execTime };
    }

    // Read output files from the workspace
    let output = '';
    let error = '';
    try {
      const outPath = path.join(containerWorkDir, 'stdout.txt');
      const errPath = path.join(containerWorkDir, 'stderr.txt');
      const exitPath = path.join(containerWorkDir, 'exit.txt');

      const [outData, errData] = await Promise.all([
        fs.readFile(outPath, 'utf-8').catch(() => ''),
        fs.readFile(errPath, 'utf-8').catch(() => ''),
      ]);
      output = outData;
      error = errData;

      try {
        const exitData = await fs.readFile(exitPath, 'utf-8').catch(() => '');
        if (exitData.trim()) {
          exitCode = parseInt(exitData.trim(), 10);
        }
      } catch {}

      console.log(`[execute] Output: ${output.length} chars, Error: ${error.length} chars`);
      if (output) console.log(`[execute] STDOUT: ${output.slice(0, 300)}`);
      if (error) console.log(`[execute] STDERR: ${error.slice(0, 300)}`);
    } catch (err) {
      console.error('[execute] Failed to read output files:', err);
    }

    await container.remove({ force: true }).catch(() => {});
    console.log(`[execute] Container removed`);

    return {
      output: output.slice(0, config.execution.outputLimit),
      error: error.slice(0, config.execution.outputLimit),
      exitCode,
      executionTimeMs: execTime,
      timedOut: false,
      memoryUsedKb: 0,
      cpuTimeMs: execTime,
    };
  } finally {
    try {
      await fs.rm(containerWorkDir, { recursive: true, force: true });
    } catch (err) {
      console.error('[execute] Cleanup failed:', err);
    }
  }
}
