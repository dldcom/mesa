import jwt from 'jsonwebtoken';
import type { Role } from '../../../shared/types/api';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-fallback-secret';
const EXPIRES_IN = '24h';

export type JwtPayload = {
  userId: number;
  username: string;
  role: Role;
};

export const sign = (payload: JwtPayload): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });

export const verify = (token: string): JwtPayload => {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & {
    iat: number;
    exp: number;
  };
  return {
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
  };
};
