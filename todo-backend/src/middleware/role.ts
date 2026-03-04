// middleware/role.ts
// Проверяет роль пользователя, которая уже загружена из БД в authMiddleware.
// ВАЖНО: использовать ТОЛЬКО после authMiddleware, так как req.userRole
// заполняется именно там через запрос к БД.
//
// Порядок middleware в маршруте:
// authMiddleware → requireRole(...) → handler
//
// authMiddleware:  проверяет JWT, делает SELECT к БД, пишет req.userId и req.userRole
// requireRole:     читает req.userRole и проверяет права (без лишних запросов к БД)

import type { Request, Response, NextFunction } from 'express';
import { UserRole } from '../schema.js';

/**
 * Фабрика middleware для проверки ролей.
 *
 * @param allowedRoles — список ролей, которым разрешён доступ
 *
 * Примеры использования:
 *   // Только super_admin
 *   router.put('/users/:id/role', authMiddleware, requireRole(UserRole.SUPER_ADMIN), handler);
 *
 *   // admin ИЛИ super_admin
 *   router.get('/users', authMiddleware, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), handler);
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.userRole;

    // Роль отсутствует — значит authMiddleware не был вызван перед этим middleware
    if (!userRole) {
      res.status(401).json({ error: 'Unauthorized: no role found' });
      return;
    }

    // Проверяем что роль пользователя входит в список разрешённых
    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required: ${allowedRoles.join(' or ')}. Your role: ${userRole}`,
      });
      return;
    }

    next();
  };
};