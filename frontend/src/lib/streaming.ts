import { connectSocket, disconnectSocket, getSocket } from './socket';
import type { Socket } from 'socket.io-client';

export interface StreamResult {
  output: string;
  error: string;
  stats: {
    executionTimeMs: number;
    memoryUsedKb: number;
    cpuTimeMs: number;
    exitCode: number | null;
    timedOut: boolean;
  };
}

export function executeCodeStreaming(
  params: { language: string; code: string; input?: string },
  onStdout: (data: string) => void,
  onStderr: (data: string) => void,
  onComplete: (result: StreamResult) => void,
  onError: (message: string) => void,
): { socket: Socket; cleanup: () => void } {
  const socket = connectSocket();

  const handleOutput = ({ type, data }: { type: string; data: string }) => {
    if (type === 'stdout') onStdout(data);
    else if (type === 'stderr') onStderr(data);
  };

  const handleComplete = (result: StreamResult) => {
    cleanup();
    onComplete(result);
  };

  const handleError = ({ message }: { message: string }) => {
    cleanup();
    onError(message || 'Execution failed');
  };

  const cleanup = () => {
    socket.off('execution-output', handleOutput);
    socket.off('execution-complete', handleComplete);
    socket.off('execution-error', handleError);
  };

  socket.on('execution-output', handleOutput);
  socket.on('execution-complete', handleComplete);
  socket.on('execution-error', handleError);

  socket.emit('execute-code', params);

  return { socket, cleanup };
}
