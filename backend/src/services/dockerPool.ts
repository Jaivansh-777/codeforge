import Dockerode from 'dockerode';
import { config } from '../config';
import { executeLocal } from './localExecutor';

const POOL_SIZE_PER_LANG = config.pool.sizePerLang;
const CONTAINER_IMAGE = 'codeforge-executor:latest';
const CONTAINER_USER = '1000:1000';
const WORK_DIR = '/code';

export interface ExecResult {
  output: string;
  error: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  memoryUsedKb: number;
  cpuTimeMs: number;
}

export interface ExecOptions {
  language: string;
  code: string;
  input?: string;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  timeoutMs?: number;
}

interface ContainerSlot {
  id: string;
  container: Dockerode.Container;
  language: string;
  busy: boolean;
}

interface QueueEntry {
  id: string;
  options: ExecOptions;
  resolve: (result: ExecResult) => void;
  reject: (err: Error) => void;
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

class DockerPool {
  private docker: Dockerode;
  private pools: Map<string, ContainerSlot[]> = new Map();
  private queues: Map<string, QueueEntry[]> = new Map();
  private initialized = false;
  private localMode = false;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;

  constructor() {
    this.docker = new Dockerode();
  }

  async initialize(): Promise<void> {
    console.log('[dockerPool] Initializing container pool...');

    try {
      await this.docker.ping();
      console.log('[dockerPool] Docker daemon is reachable');
    } catch {
      console.warn('[dockerPool] Docker daemon not reachable — falling back to local execution');
      this.localMode = true;
      this.initialized = true;
      console.log('[dockerPool] Pool initialized in local mode');
      return;
    }

    try {
      const image = await this.docker.getImage(CONTAINER_IMAGE).inspect();
      console.log(`[dockerPool] Image ${CONTAINER_IMAGE} found (${(image.Size || 0) / 1024 / 1024}MB)`);
    } catch {
      console.warn(`[dockerPool] Image ${CONTAINER_IMAGE} not found — falling back to local execution`);
      this.localMode = true;
      this.initialized = true;
      console.log('[dockerPool] Pool initialized in local mode');
      return;
    }

    const languages = Object.keys(LANG_CONFIG);
    let anyCreated = false;

    for (const lang of languages) {
      const slots: ContainerSlot[] = [];
      this.pools.set(lang, slots);
      this.queues.set(lang, []);

      for (let i = 0; i < POOL_SIZE_PER_LANG; i++) {
        try {
          const container = await this.createContainer(lang);
          await container.start();
          const slot: ContainerSlot = {
            id: `${lang}-${i}`,
            container,
            language: lang,
            busy: false,
          };
          slots.push(slot);
          anyCreated = true;
          console.log(`[dockerPool] Created ${lang} container #${i} (${container.id})`);
        } catch (err) {
          console.error(`[dockerPool] Failed to create ${lang} container #${i}:`, err);
        }
      }
    }

    if (!anyCreated) {
      console.warn('[dockerPool] Failed to create any containers — falling back to local execution');
      this.localMode = true;
      this.initialized = true;
      console.log('[dockerPool] Pool initialized in local mode');
      return;
    }

    this.healthInterval = setInterval(() => this.healthCheck(), 30000);
    this.initialized = true;
    console.log('[dockerPool] Pool initialized successfully (Docker mode)');
  }

  private async healthCheck(): Promise<void> {
    if (this.shuttingDown || !this.initialized || this.localMode) return;
    for (const [lang, slots] of this.pools) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        try {
          const info = await slot.container.inspect();
          if (!info.State.Running) {
            console.warn(`[dockerPool] Container ${slot.id} is not running, restarting...`);
            await this.replaceContainer(slot, i, lang);
          }
        } catch {
          console.warn(`[dockerPool] Container ${slot.id} unreachable, replacing...`);
          await this.replaceContainer(slot, i, lang);
        }
      }
    }
  }

  private async replaceContainer(slot: ContainerSlot, index: number, lang: string): Promise<void> {
    try {
      await slot.container.remove({ force: true }).catch(() => {});
    } catch {}
    try {
      const container = await this.createContainer(lang);
      await container.start();
      this.pools.get(lang)![index] = {
        id: `${lang}-${index}`,
        container,
        language: lang,
        busy: false,
      };
      console.log(`[dockerPool] Replaced container for ${lang} #${index}`);
    } catch (err) {
      console.error(`[dockerPool] Failed to replace container ${slot.id}:`, err);
    }
  }

  private async createContainer(language: string): Promise<Dockerode.Container> {
    const container = (await this.docker.createContainer({
      Image: CONTAINER_IMAGE,
      Cmd: ['tail', '-f', '/dev/null'],
      WorkingDir: WORK_DIR,
      User: CONTAINER_USER,
      HostConfig: {
        NetworkMode: 'none',
        Memory: config.execution.memoryLimit * 1024 * 1024,
        MemorySwap: 0,
        CpuPeriod: 100000,
        CpuQuota: config.execution.cpuLimit * 100000,
        ReadonlyRootfs: true,
        PidsLimit: 50,
        Tmpfs: { '/tmp': 'size=64M,noexec,nosuid,nodev' },
      },
      Env: ['HOME=/tmp'],
      OpenStdin: false,
      Tty: false,
    })) as unknown as Dockerode.Container;
    return container;
  }

  async execute(options: ExecOptions): Promise<ExecResult> {
    if (!this.initialized) {
      throw new Error('Docker pool not initialized');
    }

    if (this.localMode) {
      return this.executeLocalFallback(options);
    }

    const langConfig = LANG_CONFIG[options.language];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${options.language}`);
    }

    const execId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const workDir = `/tmp/${execId}`;
    const timeoutMs = options.timeoutMs ?? config.execution.timeout * 1000;

    const slots = this.pools.get(options.language);
    if (!slots || slots.length === 0) {
      return this.executeLocalFallback(options);
    }

    const slot = this.acquireContainer(options.language);

    if (!slot) {
      return new Promise<ExecResult>((resolve, reject) => {
        this.queues.get(options.language)!.push({
          id: execId,
          options,
          resolve,
          reject,
        });
      });
    }

    try {
      return await this.executeInSlot(slot, langConfig, execId, workDir, options, timeoutMs);
    } finally {
      this.releaseContainer(slot);
    }
  }

  private async executeLocalFallback(options: ExecOptions): Promise<ExecResult> {
    const startTime = Date.now();
    try {
      const result = await executeLocal(
        {
          language: options.language,
          code: options.code,
          input: options.input,
          timeoutMs: options.timeoutMs ?? config.execution.timeout * 1000,
        },
        options.onStdout,
        options.onStderr,
      );
      return {
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        executionTimeMs: Date.now() - startTime,
        timedOut: result.timedOut,
        memoryUsedKb: 0,
        cpuTimeMs: Date.now() - startTime,
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

  private acquireContainer(language: string): ContainerSlot | null {
    const slots = this.pools.get(language);
    if (!slots) return null;
    for (const slot of slots) {
      if (!slot.busy) {
        slot.busy = true;
        return slot;
      }
    }
    return null;
  }

  private releaseContainer(slot: ContainerSlot): void {
    slot.busy = false;
    const queue = this.queues.get(slot.language);
    if (queue && queue.length > 0) {
      const entry = queue.shift()!;
      this.processQueued(entry);
    }
  }

  private async processQueued(entry: QueueEntry): Promise<void> {
    const langConfig = LANG_CONFIG[entry.options.language];
    if (!langConfig) {
      entry.reject(new Error(`Unsupported language: ${entry.options.language}`));
      return;
    }

    const slots = this.pools.get(entry.options.language);
    if (!slots || slots.length === 0) {
      entry.reject(new Error(`No containers available for language: ${entry.options.language}`));
      return;
    }

    const slot = this.acquireContainer(entry.options.language);
    if (!slot) {
      this.queues.get(entry.options.language)!.unshift(entry);
      return;
    }

    const execId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const workDir = `/tmp/${execId}`;
    const timeoutMs = entry.options.timeoutMs ?? config.execution.timeout * 1000;

    try {
      const result = await this.executeInSlot(slot, langConfig, execId, workDir, entry.options, timeoutMs);
      entry.resolve(result);
    } catch (err) {
      entry.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.releaseContainer(slot);
    }
  }

  private async executeInSlot(
    slot: ContainerSlot,
    langConfig: typeof LANG_CONFIG[string],
    execId: string,
    workDir: string,
    options: ExecOptions,
    timeoutMs: number,
  ): Promise<ExecResult> {
    const startTime = Date.now();
    let timedOut = false;

    try {
      await this.execInContainer(slot.container, `mkdir -p ${workDir}`);

      const b64 = Buffer.from(options.code).toString('base64');
      await this.execInContainer(slot.container, `echo '${b64}' | base64 -d > ${workDir}/${langConfig.filename}`);

      if (options.input) {
        const inputB64 = Buffer.from(options.input).toString('base64');
        await this.execInContainer(slot.container, `echo '${inputB64}' | base64 -d > ${workDir}/input.txt`);
      }

      if (langConfig.compile) {
        const compileResult = await this.execInContainer(
          slot.container,
          `cd ${workDir} && ${langConfig.compile}`,
          options.onStdout,
          options.onStderr,
          timeoutMs,
        );
        if (compileResult.exitCode !== 0) {
          const totalTime = Date.now() - startTime;
          return {
            output: compileResult.stdout,
            error: compileResult.stderr || 'Compilation failed',
            exitCode: compileResult.exitCode,
            executionTimeMs: totalTime,
            timedOut: compileResult.timedOut,
            memoryUsedKb: 0,
            cpuTimeMs: totalTime,
          };
        }
      }

      const runCmd = `cd ${workDir} && ${langConfig.run}`;
      const runResult = await this.execInContainer(
        slot.container,
        runCmd,
        options.onStdout,
        options.onStderr,
        timeoutMs,
        options.input,
      );

      const totalTime = Date.now() - startTime;

      if (runResult.timedOut) {
        timedOut = true;
        try {
          await this.killProcessGroup(slot.container, workDir);
        } catch {}
      }

      return {
        output: runResult.stdout,
        error: runResult.timedOut ? 'Execution stopped: timeout reached.' : runResult.stderr,
        exitCode: runResult.timedOut ? 137 : runResult.exitCode,
        executionTimeMs: totalTime,
        timedOut: runResult.timedOut,
        memoryUsedKb: 0,
        cpuTimeMs: totalTime,
      };
    } catch (err: any) {
      const totalTime = Date.now() - startTime;
      return {
        output: '',
        error: err.message || 'Execution failed',
        exitCode: -1,
        executionTimeMs: totalTime,
        timedOut: false,
        memoryUsedKb: 0,
        cpuTimeMs: totalTime,
      };
    } finally {
      try {
        await this.execInContainer(slot.container, `rm -rf ${workDir} 2>/dev/null || true`);
      } catch {}
    }
  }

  private async killProcessGroup(container: Dockerode.Container, workDir: string): Promise<void> {
    try {
      await this.execInContainer(
        container,
        `pkill -f "${workDir}" 2>/dev/null; pkill -9 -f "${workDir}" 2>/dev/null; true`,
      );
    } catch {}
  }

  private execInContainer(
    container: Dockerode.Container,
    cmd: string,
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void,
    timeoutMs?: number,
    stdinInput?: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolve, reject) => {
      container.exec(
        {
          Cmd: ['sh', '-c', cmd],
          AttachStdout: true,
          AttachStderr: true,
          AttachStdin: !!stdinInput,
        },
        (err, exec) => {
          if (err || !exec) return reject(err || new Error('Failed to create exec'));
          exec.start({ hijack: true, stdin: !!stdinInput, Detach: false, Tty: false }, (err, stream) => {
            if (err || !stream) return reject(err || new Error('Failed to start exec'));

            const stdoutChunks: string[] = [];
            const stderrChunks: string[] = [];
            let buffer = Buffer.alloc(0);
            let execTimedOut = false;

            let timeoutId: NodeJS.Timeout | null = null;
            if (timeoutMs && timeoutMs > 0) {
              timeoutId = setTimeout(() => {
                execTimedOut = true;
                (exec as any).kill('SIGTERM', () => {});
              }, timeoutMs);
            }

            stream.on('data', (chunk: Buffer) => {
              buffer = Buffer.concat([buffer, chunk]);
              while (buffer.length >= 8) {
                const type = buffer[0];
                const length = buffer.readUInt32BE(4);
                if (buffer.length < 8 + length) break;
                const data = buffer.slice(8, 8 + length).toString('utf-8');
                if (type === 1) {
                  stdoutChunks.push(data);
                  onStdout?.(data);
                } else if (type === 2) {
                  stderrChunks.push(data);
                  onStderr?.(data);
                }
                buffer = buffer.slice(8 + length);
              }
            });

            const finish = () => {
              if (timeoutId) clearTimeout(timeoutId);
              if (buffer.length > 0) {
                const data = buffer.toString('utf-8');
                stdoutChunks.push(data);
                onStdout?.(data);
              }
              exec.inspect((err, info) => {
                resolve({
                  stdout: stdoutChunks.join(''),
                  stderr: stderrChunks.join(''),
                  exitCode: execTimedOut ? 137 : (info?.ExitCode ?? 0),
                  timedOut: execTimedOut,
                });
              });
            };

            stream.on('end', finish);
            stream.on('close', finish);
            stream.on('error', (e) => {
              if (timeoutId) clearTimeout(timeoutId);
              reject(e);
            });

            if (stdinInput && stream.writable) {
              stream.write(stdinInput);
              stream.end();
            }
          });
        },
      );
    });
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.initialized = false;
    console.log('[dockerPool] Shutting down...');

    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }

    if (!this.localMode) {
      const allSlots: ContainerSlot[] = [];
      for (const [, slots] of this.pools) {
        allSlots.push(...slots);
      }

      await Promise.allSettled(
        allSlots.map(async (slot) => {
          try {
            await slot.container.stop({ t: 2 });
          } catch {}
          try {
            await slot.container.remove({ force: true });
          } catch {}
        })
      );
    }

    this.pools.clear();
    this.queues.clear();
    console.log('[dockerPool] Shutdown complete');
  }
}

export const dockerPool = new DockerPool();
