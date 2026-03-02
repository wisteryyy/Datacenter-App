import { verifyAccessToken } from '../services/tokenService.js';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types.js';

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token required' });
    return;
  }

  const token = header.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch (err: any) {
    if (err.message === 'ACCESS_TOKEN_EXPIRED') {
      // Клиент видит отдельный код и знает, что надо вызвать /auth/refresh
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};