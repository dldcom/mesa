import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../shared/types/events';
import { registerTeacherHandlers } from './teacherHandlers';
import { registerStudentHandlers } from './studentHandlers';

export type MesaIo = SocketServer<ClientToServerEvents, ServerToClientEvents>;

export const setupSocket = (httpServer: HttpServer): MesaIo => {
  const io: MesaIo = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents
  >(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 10000,
    pingInterval: 5000,
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    registerStudentHandlers(io, socket);
    registerTeacherHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
};
