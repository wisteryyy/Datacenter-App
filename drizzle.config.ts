import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './todo-backend/src/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: './todo-backend/todo.db',
  },
});