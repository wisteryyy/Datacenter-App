import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '../shema.js'

export type User = typeof users.$inferSelect;

export const createUser = async (username: string, password: string): Promise<User> => {
  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  db.insert(users).values({ id, username, passwordHash }).run();

  return db.select().from(users).where(eq(users.id, id)).get() as User;
};

// Ищет пользователя по логину
export const findUserByUsername = (username: string): User | undefined =>
  db.select().from(users).where(eq(users.username, username)).get() as User | undefined;

// Сравнивает пароль с хэшем
export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);