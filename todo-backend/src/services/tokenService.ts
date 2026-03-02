import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, and, gt, lt } from 'drizzle-orm';
import { db } from '../db.js';
import { refreshTokens } from '../schema.js';
import type { JwtPayload } from '../types.js';

// ─── Конфигурация ──────────────────────────────────────────────────────────────
const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRES  = '15m';
const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней в мс

// ─── Access Token ──────────────────────────────────────────────────────────────

export const generateAccessToken = (userId: string): string =>
  jwt.sign({ sub: userId }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
    algorithm: 'HS256',
  });

export const verifyAccessToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new Error('ACCESS_TOKEN_EXPIRED');
    throw new Error('ACCESS_TOKEN_INVALID');
  }
};

// ─── Refresh Token ─────────────────────────────────────────────────────────────

// RT — случайная строка (не JWT), храним только её хэш в БД
export const generateRefreshToken = (): string =>
  crypto.randomBytes(64).toString('hex');

export const saveRefreshToken = async (
  userId: string,
  token: string,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<void> => {
  const id = crypto.randomUUID();
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS).toISOString();

  db.insert(refreshTokens).values({
    id,
    userId,
    tokenHash,
    expiresAt,
    userAgent: meta?.userAgent ?? null,
    ipAddress: meta?.ipAddress ?? null,
  }).run();
};

// Ищет запись по userId и проверяет хэш. Возвращает id записи или null.
export const findRefreshToken = async (
  token: string,
  userId: string
): Promise<string | null> => {
  const now = new Date().toISOString();

  const records = db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), gt(refreshTokens.expiresAt, now)))
    .all();

  for (const record of records) {
    const valid = await bcrypt.compare(token, record.tokenHash);
    if (valid) return record.id;
  }

  return null;
};

// Атомарная ротация: удаляем старый RT, сохраняем новый
export const rotateRefreshToken = async (
  oldRecordId: string,
  userId: string,
  newToken: string,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<void> => {
  const newId = crypto.randomUUID();
  const tokenHash = await bcrypt.hash(newToken, 10);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS).toISOString();

  // better-sqlite3 поддерживает транзакции через .transaction()
  const rotate = db.$client.transaction(() => {
    db.$client.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(oldRecordId);
    db.$client
      .prepare(
        'INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt, userAgent, ipAddress) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(newId, userId, tokenHash, expiresAt, meta?.userAgent ?? null, meta?.ipAddress ?? null);
  });

  rotate();
};

// Удаляем конкретный RT (logout из текущей сессии)
export const deleteRefreshToken = (recordId: string): void => {
  db.delete(refreshTokens).where(eq(refreshTokens.id, recordId)).run();
};

// Удаляем все RT пользователя (logout everywhere)
export const deleteAllUserTokens = (userId: string): void => {
  db.delete(refreshTokens).where(eq(refreshTokens.userId, userId)).run();
};

// Очистка истёкших токенов — запускать по cron раз в сутки
export const cleanupExpiredTokens = (): void => {
  const now = new Date().toISOString();
  db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now)).run();
};