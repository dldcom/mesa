import express, { Application } from 'express';
import cors from 'cors';
import path from 'node:path';

import authRouter from './routes/auth';
import sessionRouter from './routes/session';
import adminRouter from './routes/admin';

export const createApp = (): Application => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // 업로드 이미지 정적 서빙 (레거시 경로)
  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

  // 에셋 폴더 정적 서빙 — Maker 로 저장된 파일을 Phaser/클라가 직접 로드
  app.use(
    '/assets',
    express.static(path.join(__dirname, '../../assets'))
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mesa-server' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/session', sessionRouter);
  app.use('/api/admin', adminRouter);

  return app;
};
