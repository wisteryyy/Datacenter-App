import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [username, role] = process.argv.slice(2);

const validRoles = ['user', 'admin', 'super_admin'] as const;
type Role = typeof validRoles[number];

if (!username || !role) {
  console.error('Использование: npx tsx setrole.ts <username> <role>');
  console.error('Роли: user, admin, super_admin');
  process.exit(1);
}

if (!validRoles.includes(role as Role)) {
  console.error(`Недопустимая роль: "${role}"`);
  console.error(`Допустимые роли: ${validRoles.join(', ')}`);
  process.exit(1);
}

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, 'todo-backend/todo.db');

const db = new Database(dbPath);

const user = db
  .prepare<[string], { id: string; username: string; role: string }>
  ('SELECT id, username, role FROM users WHERE username = ?')
  .get(username);

if (!user) {
  console.error(`Пользователь "${username}" не найден`);
  db.close();
  process.exit(1);
}

db.prepare('UPDATE users SET role = ? WHERE username = ?').run(role, username);

console.log(`✓ Роль пользователя "${username}" изменена: ${user.role} → ${role}`);
db.close();