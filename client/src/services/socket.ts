import { io, Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from '@shared/types/events';

export type MesaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// 싱글톤: 앱 전체에서 하나의 연결만 유지
let socket: MesaSocket | null = null;

export const getSocket = (): MesaSocket => {
  if (!socket) {
    socket = io({
      reconnectionAttempts: 5,
      timeout: 10000,
    }) as MesaSocket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('error', (err) => {
      console.error('[Socket] Error:', err);
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
