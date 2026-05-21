import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { executeCode, getSupportedLanguages } from './executor';

interface Participant {
  socketId: string;
  name: string;
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
  participants: Participant[];
}

const rooms = new Map<string, RoomState>();

const LANG_DISPLAY: Record<string, { name: string; ext: string }> = {
  python: { name: 'Python', ext: 'py' },
  c: { name: 'C', ext: 'c' },
  cpp: { name: 'C++', ext: 'cpp' },
  javascript: { name: 'JavaScript', ext: 'js' },
  php: { name: 'PHP', ext: 'php' },
  java: { name: 'Java', ext: 'java' },
  assembly: { name: 'Assembly', ext: 'asm' },
};

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
      participantName = name;
      currentRoom = roomId;
      socket.join(roomId);

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
          participants: [],
        });
        console.log(`[socket] Room created: ${roomId} by ${name} (${socket.id})`);
      }

      const room = rooms.get(roomId)!;
      const isHost = room.hostSocketId === socket.id;

      const participant: Participant = { socketId: socket.id, name };
      room.participants.push(participant);

      console.log(`[socket] ${name} joined room ${roomId} (host=${isHost})`);

      socket.emit('room-state', {
        hostSocketId: room.hostSocketId,
        code: room.code,
        language: room.language,
        input: room.input,
        output: room.output,
        error: room.error,
        stats: room.stats,
        allowEdit: room.allowEdit,
        participants: room.participants,
        isHost,
      });

      socket.to(roomId).emit('user-joined', { socketId: socket.id, name });
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

      console.log(`[socket] Running code in room ${currentRoom}: ${room.language}`);

      io.to(currentRoom).emit('execution-start');

      try {
        const result = await executeCode({ language: room.language, code: room.code, input: room.input || '' });
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

        io.to(currentRoom).emit('output-change', {
          output: room.output,
          error: room.error,
          stats: room.stats,
        });
      } catch (e: any) {
        room.error = e.message || 'Execution failed';
        room.stats = { executionTimeMs: 0, memoryUsedKb: 0, cpuTimeMs: 0, exitCode: -1, timedOut: false };
        io.to(currentRoom).emit('output-change', {
          output: '',
          error: room.error,
          stats: room.stats,
        });
      }
    });

    socket.on('toggle-edit', ({ allowEdit }: { allowEdit: boolean }) => {
      if (!currentRoom || !rooms.has(currentRoom)) return;
      const room = rooms.get(currentRoom)!;
      if (room.hostSocketId !== socket.id) return;
      room.allowEdit = allowEdit;
      io.to(currentRoom).emit('edit-mode-change', { allowEdit });
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

    // WebRTC signaling
    socket.on('signal', ({ to, signal }: { to: string; signal: any }) => {
      if (!currentRoom) return;
      io.to(to).emit('signal', { from: socket.id, signal });
    });

    socket.on('media-state', ({ enabled }: { enabled: { audio: boolean; video: boolean } }) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('media-state', { socketId: socket.id, enabled });
    });

    socket.on('disconnect', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.participants = room.participants.filter(p => p.socketId !== socket.id);
        console.log(`[socket] ${participantName || socket.id} left room ${currentRoom}`);

        socket.to(currentRoom).emit('user-left', { socketId: socket.id, name: participantName });

        if (room.participants.length === 0) {
          rooms.delete(currentRoom);
          console.log(`[socket] Room ${currentRoom} deleted (empty)`);
        } else if (room.hostSocketId === socket.id) {
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
