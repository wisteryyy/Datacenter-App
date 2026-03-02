import crypto from 'crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { tasks } from '../shema.js';

type TaskRow = typeof tasks.$inferSelect;

// Конвертируем done: 0/1 → boolean перед отправкой клиенту
export type Task = Omit<TaskRow, 'done'> & { done: boolean };

const mapTask = (row: TaskRow): Task => ({ ...row, done: Boolean(row.done) });

// CREATE
export const createTask = (userId: string, text: string): Task => {
  const id = crypto.randomUUID();
  db.insert(tasks).values({ id, userId, text }).run();
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow;
  return mapTask(task);
};

// READ — только задачи текущего пользователя
export const getTasksByUser = (userId: string): Task[] =>
  db.select().from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.createdAt))
    .all()
    .map(mapTask);

// UPDATE — обновляем только переданные поля
export const updateTask = (
  id: string,
  userId: string,
  body: { text?: string; done?: boolean }
): Task | null => {
  const task = db.select().from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .get() as TaskRow | undefined;

  if (!task) return null;

  const updates: Partial<TaskRow> = { updatedAt: sql`CURRENT_TIMESTAMP` as unknown as string };
  if (body.text !== undefined) updates.text = body.text;
  if (body.done !== undefined) updates.done = body.done ? 1 : 0;

  db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

  const updated = db.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow;
  return mapTask(updated);
};

// DELETE
export const deleteTask = (id: string, userId: string): Task | null => {
  const task = db.select().from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .get() as TaskRow | undefined;

  if (!task) return null;

  db.delete(tasks).where(eq(tasks.id, id)).run();
  return mapTask(task);
};