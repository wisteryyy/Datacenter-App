import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDB, closeDB } from './db.js';
import authRouter from './routes/auth.js';
import tasksRouter from './routes/tasks.js';
import { cleanupExpiredTokens } from './services/tokenService.js';

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,   // обязательно для отправки cookie с фронтенда
}));
app.use(express.json());
app.use(cookieParser());   // парсит req.cookies

app.use('/auth', authRouter);
app.use('/tasks', tasksRouter);

const PORT = process.env.PORT ?? 3000;

initDB();
console.log('База данных подключена!');

// Очистка истёкших refresh_tokens раз в сутки
setInterval(() => {
  cleanupExpiredTokens();
  console.log('Expired refresh tokens cleaned up');
}, 24 * 60 * 60 * 1000);

app.listen(PORT, () => console.log(`Сервер запустился на http://localhost:${PORT}`));

process.on('SIGINT', () => { closeDB(); process.exit(0); });
process.on('SIGTERM', () => { closeDB(); process.exit(0); });