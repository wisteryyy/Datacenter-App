import Database from 'better-sqlite3';
const db = new Database('todo.db');
// db.prepare("UPDATE users SET role = 'super_admin' WHERE username = 'SuperAdminUser'").run();
// db.prepare("UPDATE users SET role = 'admin' WHERE username = 'AdminUser'").run();
console.log('Done');