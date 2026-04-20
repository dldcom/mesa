import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { sessionManager } from '../game/sessionManager';
import type { CreateSessionResponse } from '../../../shared/types/api';

const router: Router = express.Router();

// POST /api/session — 새 세션 생성 (교사/관리자 공용)
router.post('/', requireAuth, (req, res) => {
  const teacherId = req.user!.userId;
  const code = sessionManager.createSession(teacherId);
  const response: CreateSessionResponse = { sessionCode: code };
  res.json(response);
});

// GET /api/session/:code — 세션 스냅샷 조회 (교사가 페이지 새로고침했을 때 복구용)
router.get('/:code', requireAuth, (req, res) => {
  const snapshot = sessionManager.getSnapshot(req.params.code);
  if (!snapshot) {
    res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    return;
  }
  // 자기가 만든 세션인지 확인 (다른 교사 세션은 볼 수 없게)
  if (snapshot.teacherId !== req.user!.userId) {
    res.status(403).json({ message: '접근 권한이 없습니다.' });
    return;
  }
  res.json(snapshot);
});

export default router;
