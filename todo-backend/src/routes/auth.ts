import { Router } from 'express';
import type { AuthRequest } from '../types.js';
import { createUser, findUserByUsername, verifyPassword } from '../models/user.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  findRefreshToken,
  rotateRefreshToken,
  deleteRefreshToken,
  deleteAllUserTokens,
} from '../services/tokenService.js';

const router = Router();

// Настройки HttpOnly cookie для Refresh Token
const COOKIE_OPTIONS = {
  httpOnly: true,                                       // JS не может прочитать
  secure: process.env.NODE_ENV === 'production',        // только HTTPS в prod
  sameSite: 'strict' as const,                         // защита от CSRF
  maxAge: 30 * 24 * 60 * 60 * 1000,                   // 30 дней в мс
  path: '/',                                            // нужен и для /auth/refresh, и для /auth/logout
};

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  // Защита от передачи числа вместо строки (например, password: 123456 без кавычек)
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password must be strings' });
    return;
  }

  if (password.length < 6) {
  res.status(400).json({ error: 'Password must be at least 6 characters' });
  return;
  }

  if (findUserByUsername(username)) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

try {
    const user = await createUser(username, password);

    const accessToken  = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();

    await saveRefreshToken(user.id, refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // RT → HttpOnly cookie; AT → тело ответа (клиент хранит в памяти JS)
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.cookie('userId', user.id, {               // нужен на фронте, чтобы передать на /refresh
      sameSite: 'strict' as const,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      accessToken,
      user: { id: user.id, username: user.username },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  // Защита от передачи числа вместо строки
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password must be strings' });
    return;
  }

  const user = findUserByUsername(username);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const accessToken  = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken();

  await saveRefreshToken(user.id, refreshToken, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
  res.cookie('userId', user.id, {
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({
    accessToken,
    user: { id: user.id, username: user.username },
  });
});


// ─── POST /auth/refresh ────────────────────────────────────────────────────────
// Клиент вызывает, когда AT истёк. Cookie отправляется браузером автоматически.
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  const userId       = req.cookies?.userId as string | undefined;

  if (!refreshToken || !userId) {
    res.status(401).json({ error: 'Refresh token missing' });
    return;
  }

  try {
    // Ищем запись в БД и сверяем хэш
    const recordId = await findRefreshToken(refreshToken, userId);

    if (!recordId) {
      // Токен не найден → возможна атака с перехватом.
      // На всякий случай инвалидируем ВСЕ сессии пользователя.
      deleteAllUserTokens(userId);
      res.clearCookie('refreshToken');
      res.clearCookie('userId');
      res.status(401).json({ error: 'Session expired, please login again' });
      return;
    }

    // Генерируем новую пару токенов (ротация RT)
    const newAccessToken  = generateAccessToken(userId);
    const newRefreshToken = generateRefreshToken();

    await rotateRefreshToken(recordId, userId, newRefreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    // Возвращаем только AT — клиент обновит его в памяти
    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  const userId = req.userId!;

  if (refreshToken) {
    const recordId = await findRefreshToken(refreshToken, userId);
    if (recordId) deleteRefreshToken(recordId);
  }

  res.clearCookie('refreshToken');
  res.clearCookie('userId');
  res.json({ message: 'Logged out successfully' });
});

// ─── POST /auth/logout-all ─────────────────────────────────────────────────────
// Выход со всех устройств — удаляем все RT пользователя
router.post('/logout-all', authMiddleware, (req: AuthRequest, res) => {
  deleteAllUserTokens(req.userId!);
  res.clearCookie('refreshToken');
  res.clearCookie('userId');
  res.json({ message: 'Logged out from all devices' });
});

export default router;