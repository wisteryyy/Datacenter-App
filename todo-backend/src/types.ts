import type { Request } from 'express';

export type User = {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
};

export type Task = {
  id: string;
  userId: string;
  text: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

// Расширяем стандартный тип Request из Express:
// добавляем поле userId, которое middleware записывает после проверки токена.
// Знак ? означает, что поле может отсутствовать (до проверки токена)
export type AuthRequest = Request & {
  userId?: string;
};