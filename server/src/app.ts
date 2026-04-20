import express, { Application } from 'express';
import cors from 'cors';
import path from 'node:path';

import authRouter from './routes/auth';
import sessionRouter from './routes/session';

export const createApp = (): Application => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mesa-server' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/session', sessionRouter);

  return app;
};
