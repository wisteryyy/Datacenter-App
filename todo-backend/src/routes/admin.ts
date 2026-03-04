// routes/admin.ts
import { Router, type Request, type Response } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { UserRole } from '../schema.js';
import { db } from '../db.js';
import { users, tasks } from '../schema.js';

const router = Router();

router.use(authMiddleware);


// ─── Маршруты для ADMIN и SUPER_ADMIN ─────────────────────────────────────────

/**
 * GET /admin/users
 * Возвращает список всех пользователей (без passwordHash).
 * Доступно: admin, super_admin
 */
router.get(
  '/users',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (_req: Request, res: Response) => {
    const allUsers = db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .all();

    res.json(allUsers);
  }
);

/**
 * GET /admin/users/:id/tasks
 * Возвращает все задачи любого пользователя по его id.
 * Доступно: admin, super_admin
 */
router.get(
  '/users/:id/tasks',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: Request, res: Response) => {
    const userId = req.params.id as string;

    const userExists = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!userExists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userTasks = db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .all();

    res.json(userTasks);
  }
);

/**
 * DELETE /admin/users/:id
 * Удаляет пользователя и все его данные (CASCADE).
 * Нельзя удалить super_admin и самого себя.
 * Доступно: admin, super_admin
 */
router.delete(
  '/users/:id',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  (req: Request, res: Response) => {
    const userId = req.params.id as string;

    const targetUser = db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.role === UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: 'Cannot delete super admin' });
      return;
    }

    if (targetUser.id === req.userId) {
      res.status(403).json({ error: 'Cannot delete yourself' });
      return;
    }

    db.delete(users).where(eq(users.id, userId)).run();

    res.json({
      message: 'User deleted successfully',
      deletedUser: { id: targetUser.id, username: targetUser.username },
    });
  }
);


// ─── Маршруты только для SUPER_ADMIN ──────────────────────────────────────────

/**
 * PUT /admin/users/:id/role
 * Изменяет роль любого пользователя.
 * Нельзя изменить роль самому себе.
 * Доступно: только super_admin
 */
router.put(
  '/users/:id/role',
  requireRole(UserRole.SUPER_ADMIN),
  (req: Request, res: Response) => {
    const userId = req.params.id as string;
    const { role } = req.body;

    if (!Object.values(UserRole).includes(role as UserRole)) {
      res.status(400).json({
        error: 'Invalid role',
        allowedRoles: Object.values(UserRole),
      });
      return;
    }

    const targetUser = db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.id === req.userId) {
      res.status(403).json({ error: 'Cannot change your own role' });
      return;
    }

    db.update(users)
      .set({ role: role as UserRole })
      .where(eq(users.id, userId))
      .run();

    res.json({
      message: 'Role updated successfully',
      user: { id: targetUser.id, username: targetUser.username, newRole: role },
    });
  }
);

/**
 * PUT /admin/tasks/:taskId
 * Изменяет текст и/или статус задачи любого пользователя.
 * Доступно: только super_admin
 *
 * Body: { text?: string, done?: boolean }
 */
router.put(
  '/tasks/:taskId',
  requireRole(UserRole.SUPER_ADMIN),
  (req: Request, res: Response) => {
    const taskId = req.params.taskId as string;
    const { text, done } = req.body;

    if (text === undefined && done === undefined) {
      res.status(400).json({ error: 'Provide text or done to update' });
      return;
    }

    const task = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .get();

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const updates: Record<string, unknown> = {
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    if (text !== undefined) updates.text = String(text);
    if (done !== undefined) updates.done = done ? 1 : 0;

    db.update(tasks).set(updates).where(eq(tasks.id, taskId)).run();

    const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    res.json({ ...updated, done: Boolean(updated!.done) });
  }
);

/**
 * DELETE /admin/tasks/:taskId
 * Удаляет задачу любого пользователя.
 * Доступно: только super_admin
 */
router.delete(
  '/tasks/:taskId',
  requireRole(UserRole.SUPER_ADMIN),
  (req: Request, res: Response) => {
    const taskId = req.params.taskId as string;

    const task = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .get();

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    db.delete(tasks).where(eq(tasks.id, taskId)).run();

    res.json({
      message: 'Task deleted successfully',
      deletedTask: { id: task.id, text: task.text },
    });
  }
);

export default router;