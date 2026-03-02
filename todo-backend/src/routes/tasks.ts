import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { createTask, getTasksByUser, updateTask, deleteTask } from '../models/task.js';
import type { AuthRequest } from '../types.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res) => {
  const tasks = getTasksByUser(req.userId!);
  res.json(tasks);
});

router.post('/', (req: AuthRequest, res) => {
  const { text } = req.body;
  if (!text) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }
  const task = createTask(req.userId!, text);
  res.status(201).json(task);
});

router.put('/:id', (req: AuthRequest, res) => {
  const task = updateTask(req.params.id as string, req.userId!, req.body);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

router.delete('/:id', (req: AuthRequest, res) => {
  const task = deleteTask(req.params.id as string, req.userId!);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.sendStatus(204);
});

export default router;