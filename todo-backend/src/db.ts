import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve('todo.db');

const sqlite = new Database(dbPath);

// WAL-режим ускоряет запись, foreign_keys включает каскадное удаление
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// db — основной объект для выполнения типизированных запросов через Drizzle
export const db = drizzle(sqlite, { schema });

// Создаём таблицы при первом запуске (если не существуют)
export const initDB = () => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      username     TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt    TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text      TEXT NOT NULL,
      done      INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         TEXT PRIMARY KEY,
      userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tokenHash  TEXT NOT NULL,
      expiresAt  TEXT NOT NULL,
      createdAt  TEXT DEFAULT CURRENT_TIMESTAMP,
      userAgent  TEXT,
      ipAddress  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userId
      ON refresh_tokens(userId);

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiresAt
      ON refresh_tokens(expiresAt);
  `);
};

export const closeDB = () => sqlite.close();