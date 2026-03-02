import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDB, closeDB } from './db.js';
import authRouter from './routes/auth.js';
import tasksRouter from './routes/tasks.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/auth', authRouter);
app.use('/tasks', tasksRouter);

const PORT = process.env.PORT ?? 3000;

initDB();
console.log('База данных подключена!');
app.listen(PORT, () => console.log(`Сервер запустился на http://localhost:${PORT}`));

process.on('SIGINT', () => { closeDB(); process.exit(0); });
process.on('SIGTERM', () => { closeDB(); process.exit(0); });