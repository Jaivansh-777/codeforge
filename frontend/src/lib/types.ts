export interface Language {
  id: string;
  name: string;
}

export interface ExecuteResponse {
  success: boolean;
  output: string;
  error: string;
  executionTime: number;
  language: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  memoryUsedKb: number;
  cpuTimeMs: number;
}

export interface BinaryResponse {
  binary: string;
  decimal: number;
  hex: string;
  octal: string;
  ascii: string | null;
  length: number;
  nibbles: number;
  bytes: number;
}

export interface ExecutionStats {
  executionTimeMs: number;
  memoryUsedKb: number;
  cpuTimeMs: number;
  exitCode: number | null;
  timedOut: boolean;
}
