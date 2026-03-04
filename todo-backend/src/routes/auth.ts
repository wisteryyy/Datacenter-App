import { Router, type Request, type Response } from 'express'; // Express: создание роутера
import type { AuthRequest } from '../types.js';// Тип: запрос с userId
import { createUser, findUserByUsername, verifyPassword } from '../models/user.js'; // Пользователи
import { authMiddleware } from '../middleware/auth.js'; // Middleware: проверка JWT
import { db } from '../db.js';
import { users } from '../schema.js';
import { eq } from 'drizzle-orm';
import {
  generateAccessToken,    // Генерация короткоживущего JWT (15 мин)
  generateRefreshToken,   // Генерация долгоживущего токена (30 дней)
  saveRefreshToken,       // Сохранение хэша токена в БД
  findRefreshToken,       // Поиск токена по хэшу
  rotateRefreshToken,     // Ротация: старый → новый токен
  deleteRefreshToken,     // Удаление одного токена
  deleteAllUserTokens,    // Удаление всех токенов пользователя
} from '../services/tokenService.js';

const router = Router();

/**
 * HttpOnly cookie для хранения refresh токена
 * 
 * ПАРАМЕТРЫ БЕЗОПАСНОСТИ:
 * - httpOnly: true — JavaScript не может прочитать (защита от XSS)
 * - secure: true в production — только HTTPS (защита от перехвата)
 * - sameSite: 'strict' — защита от CSRF атак
 * - maxAge: 30 дней — срок жизни refresh токена
 * - path: '/' — доступен на всех маршрутах
 * 
 * ПОЧЕМУ COOKIE А НЕ LOCALSTORAGE:
 * - LocalStorage доступен через JS (уязвимо к XSS)
 * - HttpOnly cookie недоступен через JS (безопаснее)
 * - Автоматически отправляется браузером на тот же домен
 */
const COOKIE_OPTIONS = {
  httpOnly: true,                                       // JS не может прочитать
  secure: process.env.NODE_ENV === 'production',        // только HTTPS в prod
  sameSite: 'strict' as const,                          // защита от CSRF
  maxAge: 30 * 24 * 60 * 60 * 1000,                     // 30 дней в мс
  path: '/',                                            // доступен на всех маршрутах
};

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  // Валидация: обязательные поля
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  // Валидация: типы данных (защита от { password: 123456 } без кавычек)
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password must be strings' });
    return;
  }

  // Валидация: минимальная длина пароля
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  // Проверка: пользователь с таким username уже существует
  if (findUserByUsername(username)) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  try {
    // Создаём пользователя (пароль хэшируется внутри createUser)
    const user = await createUser(username, password);

    // Генерируем пару токенов
    const accessToken  = generateAccessToken(user.id); // 15 минут
    const refreshToken = generateRefreshToken(); // 64 символа, случайно

    // Сохраняем хэш refresh токена в БД (не сам токен!)
    await saveRefreshToken(user.id, refreshToken, {
      userAgent: req.headers['user-agent'], // Для аудита
      ipAddress: req.ip, // Для безопасности
    });

    // Устанавливаем HttpOnly cookies
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.cookie('userId', user.id, { // Нужен для /refresh
      sameSite: 'strict' as const,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // Access токен в теле ответа (клиент хранит в памяти JS)
    res.status(201).json({
      accessToken,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /auth/login — Вход пользователя
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  // Валидация: обязательные поля и типы
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password must be strings' });
    return;
  }

  // Поиск пользователя по username
  const user = findUserByUsername(username);

  // Проверка пароля (если user не найден — тоже 401 для безопасности)
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Генерируем пару токенов
  const accessToken  = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken();

  // Сохраняем хэш refresh токена в БД
  await saveRefreshToken(user.id, refreshToken, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  // Устанавливаем HttpOnly cookies
  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
  res.cookie('userId', user.id, {
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  // Возвращаем access токен и информацию о пользователе
  res.json({
    accessToken,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

// POST /auth/refresh — Обновление access токена
/**
 * Обновляет пару токенов когда access токен истёк
 * Как работает:
 * 1. Клиент отправляет запрос с истёкшим access токеном → 401
 * 2. Клиент вызывает /auth/refresh (cookie отправляется автоматически)
 * 3. Сервер проверяет refresh токен в БД
 * 4. Если ок → выдаёт новую пару токенов (ротация)
 * 5. Клиент повторяет исходный запрос с новым access токеном
 * Паттерн Token Rotation:
 * - При каждом /refresh выдаётся НОВЫЙ refresh токен
 * - Старый токен инвалидируется (удаляется из БД)
 * - Если старый токен используется снова → возможная кража → отозвать все сессии
 */
router.post('/refresh', async (req: Request, res: Response) => {
  // Cookie отправляются браузером автоматически (SameSite позволяет)
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  const userId = req.cookies?.userId as string | undefined;

  if (!refreshToken || !userId) {
    res.status(401).json({ error: 'Refresh token missing' });
    return;
  }

  try {
    // Ищем запись в БД и сверяем хэш токена
    const recordId = await findRefreshToken(refreshToken, userId);

    if (!recordId) {
      // Токен не найден → возможна атака с перехватом токена
      // Инвалидируем ВСЕ сессии пользователя (force logout)
      deleteAllUserTokens(userId);
      res.clearCookie('refreshToken');
      res.clearCookie('userId');
      res.status(401).json({ error: 'Session expired, please login again' });
      return;
    }

    // Генерируем новую пару токенов (ротация)
    const newAccessToken  = generateAccessToken(userId);
    const newRefreshToken = generateRefreshToken();

    // Заменяем старый токен на новый в БД
    await rotateRefreshToken(recordId, userId, newRefreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // Устанавливаем новый refresh токен в cookie
    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    // Возвращаем только access токен (refresh уже в cookie)
    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/me — восстановление данных пользователя по токену
// Используется фронтендом при перезагрузке страницы
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  const user = db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.id, req.userId!))
    .get();

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
});

// POST /auth/logout — Выход (текущая сессия)
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  const userId = req.userId!;

  // Удаляем конкретный refresh токен из БД
  if (refreshToken) {
    const recordId = await findRefreshToken(refreshToken, userId);
    if (recordId) deleteRefreshToken(recordId);
  }

  // Очищаем cookies на клиенте
  res.clearCookie('refreshToken');
  res.clearCookie('userId');
  
  res.json({ message: 'Logged out successfully' });
});

// POST /auth/logout-all — Выход со всех устройств
router.post('/logout-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  // Удаляем ВСЕ refresh токены пользователя
  deleteAllUserTokens(req.userId!);
  
  // Очищаем cookies на текущем устройстве
  res.clearCookie('refreshToken');
  res.clearCookie('userId');
  
  res.json({ message: 'Logged out from all devices' });
});

export default router;