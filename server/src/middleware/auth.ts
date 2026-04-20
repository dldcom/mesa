import type { Request, Response, NextFunction } from 'express';
import { verify, JwtPayload } from '../lib/jwt';

// Express Request 에 user 필드 주입 (TypeScript 타입 확장)
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: '로그인이 필요합니다.' });
    return;
  }

  const token = header.substring(7);
  try {
    const payload = verify(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({ message: '로그인이 필요합니다.' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ message: '관리자 권한이 필요합니다.' });
    return;
  }
  next();
};
