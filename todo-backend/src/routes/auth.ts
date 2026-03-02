import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { createUser, findUserByUsername, verifyPassword } from '../models/user.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  if (findUserByUsername(username)) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  try {
    const user = await createUser(username, password);
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] }
    );
    res.status(201).json({ token });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = findUserByUsername(username);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] }
  );
  res.json({ token });
});

export default router;