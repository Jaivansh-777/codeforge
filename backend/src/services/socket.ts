import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { executeCode, executeCodeStreaming } from './executor';

interface Participant {
  socketId: string;
  name: string;
}

interface DrawAction {
  id: string;
  type: 'path' | 'rectangle' | 'circle' | 'line' | 'arrow' | 'text';
  color: string;
  strokeSize: number;
  points?: { x: number; y: number }[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
  isEraser?: boolean;
}

interface RoomState {
  hostSocketId: string;
  code: string;
  language: string;
  input: string;
  output: string;
  error: string;
  stats: null | {
    executionTimeMs: number;
    memoryUsedKb: number;
    cpuTimeMs: number;
    exitCode: number | null;
    timedOut: boolean;
  };
  allowEdit: boolean;
  locked: boolean;
  participants: Participant[];
  whiteboardActions: DrawAction[];
}

const rooms = new Map<string, RoomState>();
const socketRooms = new Map<string, string>();

function sanitizeUsername(name: string): string {
  return name.trim().slice(0, 30).replace(/[<>]/g, '');
}

function validateRoomCode(roomId: string): boolean {
  return typeof roomId === 'string' && roomId.length >= 3 && roomId.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(roomId);
}

export function createSocketServer(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[socket] Connected: ${socket.id}`);

    let currentRoom: string | null = null;
    let participantName: string | null = null;

    socket.on('join-room', ({ roomId, name }: { roomId: string; name: string }) => {
      if (!roomId || !name) return;
      if (!validateRoomCode(roomId)) {
        socket.emit('join-error', { message: 'Invalid room code.' });
        return;
      }

      const sanitized = sanitizeUsername(name);
      if (!sanitized) {
        socket.emit('join-error', { message: 'Invalid username.' });
        return;
      }

      if (socketRooms.has(socket.id)) {
        const prevRoom = socketRooms.get(socket.id)!;
        socket.leave(prevRoom);
        const prevState = rooms.get(prevRoom);
        if (prevState) {
          prevState.participants = prevState.participants.filter(p => p.socketId !== socket.id);
          io.to(prevRoom).emit('participants-update', prevState.participants);
          if (prevState.participants.length === 0) {
            rooms.delete(prevRoom);
          }
        }
      }

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          hostSocketId: socket.id,
          code: '',
          language: 'python',
          input: '',
          output: '',
          error: '',
          stats: null,
          allowEdit: true,
          locked: false,
          participants: [],
          whiteboardActions: [],
        });
        console.log(`[socket] Room created: ${roomId} by ${sanitized} (${socket.id})`);
      }

      const room = rooms.get(roomId)!;

      if (room.locked && room.hostSocketId !== socket.id) {
        socket.emit('join-error', { message: 'Room is locked by the host.' });
        return;
      }

      const nameTaken = room.participants.some(p => p.name.toLowerCase() === sanitized.toLowerCase());
      if (nameTaken) {
        socket.emit('join-error', { message: `Username "${sanitized}" already taken in this room.` });
        return;
      }

      participantName = sanitized;
      currentRoom = roomId;
      socket.join(roomId);
      socketRooms.set(socket.id, roomId);

      const isHost = room.hostSocketId === socket.id;

      const participant: Participant = { socketId: socket.id, name: sanitized };
      room.participants.push(participant);

      console.log(`[socket] ${sanitized} joined room ${roomId} (host=${isHost})`);

      socket.emit('room-state', {
        hostSocketId: room.hostSocketId,
        code: room.code,
        language: room.language,
        input: room.input,
        output: room.output,
        error: room.error,
        stats: room.stats,
        allowEdit: room.allowEdit,
        locked: room.locked,
        participants: room.participants,
        whiteboardActions: room.whiteboardActions,
        isHost,
      });

      socket.to(roomId).emit('user-joined', { socketId: socket.id, name: sanitized });
      io.to(roomId).emit('participants-update', room.participants);
    });

    socket.on('code-change', ({ code }: { code: string }) => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      const isHost = room.hostSocketId === socket.id;
      if (!isHost && !room.allowEdit) return;
      room.code = code;
      socket.to(currentRoom).emit('code-change', { code, by: socket.id });
    });

    socket.on('language-change', ({ language }: { language: string }) => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      room.language = language;
      room.code = '';
      room.output = '';
      room.error = '';
      room.stats = null;
      socket.to(currentRoom).emit('language-change', { language, by: socket.id });
    });

    socket.on('stdin-change', ({ input }: { input: string }) => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      room.input = input;
      socket.to(currentRoom).emit('stdin-change', { input, by: socket.id });
    });

    socket.on('run-code', async () => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      const isHost = room.hostSocketId === socket.id;
      if (!isHost) return;
      if (!room.code.trim()) return;

      const roomId = currentRoom;
      console.log(`[socket] Running code in room ${roomId}: ${room.language}`);

      io.to(roomId).emit('execution-start');

      try {
        const result = await executeCodeStreaming(
          { language: room.language, code: room.code, input: room.input || '' },
          (data) => io.to(roomId).emit('execution-output', { type: 'stdout', data }),
          (data) => io.to(roomId).emit('execution-output', { type: 'stderr', data }),
        );

        room.output = result.output || '';
        room.error = result.error || '';
        room.stats = {
          executionTimeMs: result.executionTimeMs,
          memoryUsedKb: result.memoryUsedKb,
          cpuTimeMs: result.cpuTimeMs,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        };

        if (!room.output && !room.error) {
          room.output = 'No output returned';
        }

        io.to(roomId).emit('execution-complete', {
          output: room.output,
          error: room.error,
          stats: room.stats,
        });
      } catch (e: any) {
        room.error = e.message || 'Execution failed';
        room.stats = { executionTimeMs: 0, memoryUsedKb: 0, cpuTimeMs: 0, exitCode: -1, timedOut: false };
        io.to(roomId).emit('execution-complete', {
          output: '',
          error: room.error,
          stats: room.stats,
        });
      }
    });

    socket.on('execute-code', async (payload: { language: string; code: string; input?: string }) => {
      const { language, code, input } = payload;

      if (!language || !code || !code.trim()) {
        socket.emit('execution-error', { message: 'Language and code are required.' });
        return;
      }

      console.log(`[socket] execute-code from ${socket.id}: ${language}`);

      const onStdout = (data: string) => {
        socket.emit('execution-output', { type: 'stdout', data });
      };

      const onStderr = (data: string) => {
        socket.emit('execution-output', { type: 'stderr', data });
      };

      try {
        const result = await executeCodeStreaming(
          { language, code, input: input || '' },
          onStdout,
          onStderr,
        );

        socket.emit('execution-complete', {
          output: result.output,
          error: result.error,
          stats: {
            executionTimeMs: result.executionTimeMs,
            memoryUsedKb: result.memoryUsedKb,
            cpuTimeMs: result.cpuTimeMs,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
          },
        });
      } catch (e: any) {
        socket.emit('execution-error', { message: e.message || 'Execution failed' });
      }
    });

    socket.on('toggle-edit', ({ allowEdit }: { allowEdit: boolean }) => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      if (room.hostSocketId !== socket.id) return;
      room.allowEdit = allowEdit;
      io.to(currentRoom).emit('edit-mode-change', { allowEdit });
    });

    socket.on('kick-participant', ({ targetSocketId }: { targetSocketId: string }) => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      if (room.hostSocketId !== socket.id) return;
      if (targetSocketId === socket.id) return;

      room.participants = room.participants.filter(p => p.socketId !== targetSocketId);
      io.to(currentRoom).emit('participants-update', room.participants);

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.leave(currentRoom);
        targetSocket.emit('kicked', { reason: 'You were removed by the host.' });
        socketRooms.delete(targetSocketId);
      }
    });

    socket.on('lock-room', () => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      if (room.hostSocketId !== socket.id) return;
      room.locked = true;
      io.to(currentRoom).emit('room-locked');
    });

    socket.on('unlock-room', () => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      if (room.hostSocketId !== socket.id) return;
      room.locked = false;
      io.to(currentRoom).emit('room-unlocked');
    });

    socket.on('chat-message', ({ message }: { message: string }) => {
      if (!currentRoom || !participantName) return;
      io.to(currentRoom).emit('chat-message', {
        socketId: socket.id,
        name: participantName,
        message,
        timestamp: Date.now(),
      });
    });

    socket.on('whiteboard-draw', (action: DrawAction) => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      room.whiteboardActions.push(action);
      socket.to(currentRoom).emit('whiteboard-draw', action);
    });

    socket.on('whiteboard-request-state', () => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      socket.emit('whiteboard-state', room.whiteboardActions);
    });

    socket.on('whiteboard-clear', () => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      room.whiteboardActions = [];
      io.to(currentRoom).emit('whiteboard-clear');
    });

    socket.on('disconnect', () => {
      socketRooms.delete(socket.id);

      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        const wasHost = room.hostSocketId === socket.id;

        room.participants = room.participants.filter(p => p.socketId !== socket.id);
        console.log(`[socket] ${participantName || socket.id} left room ${currentRoom}`);

        socket.to(currentRoom).emit('user-left', { socketId: socket.id, name: participantName || 'Anonymous' });

        if (room.participants.length === 0) {
          rooms.delete(currentRoom);
          console.log(`[socket] Room ${currentRoom} deleted (empty)`);
        } else if (wasHost) {
          room.hostSocketId = room.participants[0].socketId;
          io.to(currentRoom).emit('host-change', { hostSocketId: room.hostSocketId });
          console.log(`[socket] New host for ${currentRoom}: ${room.hostSocketId}`);
        }

        io.to(currentRoom).emit('participants-update', room.participants);
      }
    });
  });

  return io;
}
