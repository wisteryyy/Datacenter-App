import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),
  username:     text('username').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  createdAt:    text('createdAt').default(sql`CURRENT_TIMESTAMP`),
});

export const tasks = sqliteTable('tasks', {
  id:        text('id').primaryKey(),
  userId:    text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text:      text('text').notNull(),
  done:      integer('done').default(0), // 0 = не выполнена, 1 = выполнена
  createdAt: text('createdAt').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updatedAt').default(sql`CURRENT_TIMESTAMP`),
});