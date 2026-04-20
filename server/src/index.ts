import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app';
import { setupSocket } from './sockets';

const PORT = Number(process.env.PORT) || 3001;

const app = createApp();
const server = http.createServer(app);

setupSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 M.E.S.A server running on http://localhost:${PORT}`);
});
