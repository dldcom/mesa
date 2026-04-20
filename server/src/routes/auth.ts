import express, { Router } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { sign } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import type { LoginRequest, LoginResponse } from '../../../shared/types/api';

const router: Router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = (req.body ?? {}) as Partial<LoginRequest>;

  if (!username || !password) {
    res.status(400).json({ message: '아이디와 비밀번호를 모두 입력하세요.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    return;
  }

  const token = sign({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const response: LoginResponse = {
    token,
    user: { id: user.id, username: user.username, role: user.role },
  };
  res.json(response);
});

// GET /api/auth/me  — 토큰으로 현재 로그인 상태 확인
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, username: true, role: true },
  });
  if (!user) {
    res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    return;
  }
  res.json({ user });
});

export default router;
