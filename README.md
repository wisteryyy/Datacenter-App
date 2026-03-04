# TODO-LIST-Web

Fullstack приложение для управления задачами с системой авторизации и ролевым доступом.

**Стек:** Node.js · Express · Better-SQLite3 · Drizzle ORM · React · Vite · TypeScript

---

## Возможности

- Регистрация и вход с JWT-авторизацией (Access Token + Refresh Token)
- Создание, редактирование и удаление своих задач
- Автоматическое обновление токена без повторного входа
- Восстановление сессии при перезагрузке страницы
- Три уровня доступа: `user`, `admin`, `super_admin`
- Админ-панель для просмотра пользователей и их задач
- Супер-админ может менять роли, удалять пользователей и редактировать чужие задачи

---

## Установка и запуск

### 1. Клонировать репозиторий

```bash
git clone https://github.com/wisteryyy/TODO-LIST-Web.git
cd Datacenter App
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Создать `.env` файл в корне проекта

```bash
# .env
PORT=3000
DB_PATH=./todo-backend/todo.db
JWT_ACCESS_SECRET=замените-на-случайную-строку-минимум-64-символа
JWT_REFRESH_SECRET=замените-на-другую-случайную-строку-минимум-64-символа
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Сгенерировать секреты можно командой:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Запустить проект

```bash
npm run dev
```

Запускает бэкенд и фронтенд одновременно через `start.ts`.

- Бэкенд: [http://localhost:3000](http://localhost:3000)
- Фронтенд: [http://localhost:5173](http://localhost:5173)

---

## Роли пользователей

| Роль | Возможности |
|------|-------------|
| `user` | Управление своими задачами |
| `admin` | + Просмотр всех пользователей и их задач |
| `super_admin` | + Изменение ролей, удаление пользователей, редактирование и удаление чужих задач |

Назначить роль вручную можно через скрипт:

```bash
cd todo-backend
node setrole.mjs <username> <role>
```

---

## Просмотр базы данных

Drizzle Studio — визуальный интерфейс для просмотра и редактирования данных в БД.

```bash
npm run db:studio
```

Откроется в браузере: [https://local.drizzle.studio](https://local.drizzle.studio)

---

## Структура проекта

```
TODO-LIST-Web/
├── todo-backend/        # Express API
│   └── src/
│       ├── middleware/  # JWT-аутентификация, проверка ролей
│       ├── models/      # Работа с пользователями и задачами
│       ├── routes/      # auth, tasks, admin
│       └── services/    # Управление токенами
├── todo-frontend/       # React + Vite
│   └── src/
│       ├── api/         # authClient — все запросы к API
│       └── App.tsx      # UI: задачи, авторизация, админ-панель
├── .env                 # Переменные окружения
└── vite.config.ts       # Proxy /auth, /tasks, /admin → бэкенд
```