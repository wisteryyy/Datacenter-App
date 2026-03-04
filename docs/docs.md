# Документация — Datacenter App

---

## 1. Архитектура проекта

Проект построен по классической слоистой архитектуре (Layered Architecture). Каждый слой отвечает за своё — роуты принимают запросы, middleware фильтруют их, модели работают с БД, сервисы содержат бизнес-логику.

### 1.1 Структура файлов

| Файл | Слой | Ответственность |
|------|------|-----------------|
| `src/index.ts` | Точка входа | Запуск Express, подключение роутов, инициализация БД |
| `src/db.ts` | База данных | Создание соединения с SQLite, инициализация таблиц |
| `src/schema.ts` | Схема БД | Описание таблиц через Drizzle ORM, enum ролей |
| `src/types.ts` | Типы | TypeScript-типы и глобальный augmentation Express.Request |
| `src/models/user.ts` | Модель | CRUD-операции над таблицей users |
| `src/models/task.ts` | Модель | CRUD-операции над таблицей tasks |
| `src/services/tokenService.ts` | Сервис | Вся логика JWT и refresh-токенов |
| `src/middleware/auth.ts` | Middleware | Проверка Access Token, загрузка роли пользователя |
| `src/middleware/role.ts` | Middleware | Проверка роли пользователя (requireRole) |
| `src/routes/auth.ts` | Роутер | `/register`, `/login`, `/refresh`, `/logout`, `/me` |
| `src/routes/tasks.ts` | Роутер | CRUD-маршруты для задач текущего пользователя |
| `src/routes/admin.ts` | Роутер | Маршруты управления пользователями и задачами для admin/super_admin |

### 1.2 Схема взаимодействия слоёв

```
Клиент (браузер)
       │  HTTP-запрос
       ▼
Express Router  ─── проверяет URL и метод
       │
       ▼
authMiddleware  ─── проверяет JWT, загружает userId и userRole
       │
       ▼
requireRole()   ─── проверяет что роль пользователя разрешена (только для /admin)
       │
       ▼
Route Handler   ─── валидирует входные данные
       │
       ▼
Model / Service ─── бизнес-логика + работа с БД
       │
       ▼
SQLite (через Drizzle ORM)
```

---

## 2. База данных

### 2.1 Таблицы (schema.ts)

Drizzle ORM позволяет описывать структуру таблиц прямо в TypeScript — schema-first подход: сначала описываем схему в коде, затем применяем миграции.

**Таблица `users`**

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT (PK) | UUID |
| `username` | TEXT | Уникальный логин |
| `passwordHash` | TEXT | bcrypt-хэш пароля (не сам пароль) |
| `role` | TEXT | `user` / `admin` / `super_admin`, по умолчанию `user` |
| `createdAt` | TEXT | Дата создания (CURRENT_TIMESTAMP) |

**Таблица `tasks`**

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT (PK) | UUID |
| `userId` | TEXT (FK) | Ссылка на `users.id`, CASCADE при удалении |
| `text` | TEXT | Текст задачи |
| `done` | INTEGER | 0 = активна, 1 = выполнена |
| `createdAt` | TEXT | Дата создания |
| `updatedAt` | TEXT | Дата последнего изменения |

**Таблица `refresh_tokens`**

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT (PK) | UUID |
| `userId` | TEXT (FK) | Ссылка на `users.id`, CASCADE при удалении |
| `tokenHash` | TEXT | bcrypt-хэш refresh-токена (не сам токен) |
| `expiresAt` | TEXT | ISO-дата истечения |
| `userAgent` | TEXT | Браузер/устройство (для аудита) |
| `ipAddress` | TEXT | IP-адрес (для безопасности) |

> Пароли и refresh-токены никогда не хранятся в открытом виде — только bcrypt-хэши. Даже при утечке базы данных реальные значения останутся недоступны.

### 2.2 Связи таблиц

```
users (1) ──── (N) tasks
users (1) ──── (N) refresh_tokens
```

При удалении пользователя все его задачи и токены удаляются автоматически (ON DELETE CASCADE).

### 2.3 Подключение (db.ts)

SQLite открывается через `better-sqlite3`. Включены два PRAGMA:
- `journal_mode = WAL` — ускоряет запись
- `foreign_keys = ON` — включает каскадное удаление

База данных создаётся автоматически при первом запуске через `initDB()`. Путь к файлу берётся из переменной окружения `DB_PATH`, по умолчанию — `./todo.db`.

---

## 3. Модели

Модели инкапсулируют все операции с базой данных. Роуты вызывают функции моделей, но не знают деталей ORM-запросов.

### 3.1 user.ts

| Функция | Описание |
|---------|----------|
| `createUser(username, password)` | Хэширует пароль через bcrypt, создаёт пользователя, возвращает запись |
| `findUserByUsername(username)` | Поиск пользователя по логину, возвращает `User` или `undefined` |
| `verifyPassword(password, hash)` | Сравнивает пароль с bcrypt-хэшем, возвращает `boolean` |

### 3.2 task.ts

SQLite хранит `done` как `INTEGER` (0/1). На границе БД↔API функция `mapTask()` конвертирует его в `boolean`.

| Функция | Описание |
|---------|----------|
| `createTask(userId, text)` | Создаёт задачу, возвращает её с `done: boolean` |
| `getTasksByUser(userId)` | Возвращает все задачи пользователя, отсортированные по дате (новые сверху) |
| `updateTask(id, userId, body)` | Обновляет `text` и/или `done`, проверяет принадлежность задачи пользователю |
| `deleteTask(id, userId)` | Удаляет задачу с проверкой прав, возвращает удалённую запись |

---

## 4. Сервис токенов (tokenService.ts)

### 4.1 Access Token

- Тип: JWT (HS256)
- Срок жизни: 15 минут
- Содержит: `{ sub: userId }`
- Хранится: в памяти JavaScript на фронтенде (не в localStorage, не в cookie)

### 4.2 Refresh Token

- Тип: случайная строка (64 байта hex, не JWT)
- Срок жизни: 30 дней
- Хранится: в `HttpOnly cookie` на клиенте, в БД — только bcrypt-хэш

### 4.3 Token Rotation

При каждом вызове `/auth/refresh` старый refresh-токен удаляется и выдаётся новый. Если старый токен попытаются использовать повторно — все сессии пользователя аннулируются (защита от кражи токена).

### 4.4 Функции сервиса

| Функция | Описание |
|---------|----------|
| `generateAccessToken(userId)` | Генерирует JWT |
| `verifyAccessToken(token)` | Верифицирует JWT, бросает `ACCESS_TOKEN_EXPIRED` или `ACCESS_TOKEN_INVALID` |
| `generateRefreshToken()` | Генерирует случайную строку |
| `saveRefreshToken(userId, token, meta)` | Хэширует и сохраняет RT в БД |
| `findRefreshToken(token, userId)` | Ищет валидный RT по userId и проверяет хэш |
| `rotateRefreshToken(oldId, userId, newToken, meta)` | Атомарная замена старого RT на новый (транзакция) |
| `deleteRefreshToken(recordId)` | Удаляет конкретный RT (logout из текущей сессии) |
| `deleteAllUserTokens(userId)` | Удаляет все RT пользователя (logout со всех устройств) |
| `cleanupExpiredTokens()` | Удаляет истёкшие RT (запускается раз в сутки) |

---

## 5. Middleware

### 5.1 auth.ts — authMiddleware

Проверяет заголовок `Authorization: Bearer <token>`. При успехе записывает в объект запроса:
- `req.userId` — ID пользователя из JWT
- `req.userRole` — роль пользователя (загружается из БД)

При истёкшем токене возвращает `401` с `{ code: "TOKEN_EXPIRED" }` — фронтенд использует этот код для автоматического обновления токена.

### 5.2 role.ts — requireRole(...allowedRoles)

Фабрика middleware. Читает `req.userRole` (заполненный в `authMiddleware`) и проверяет что роль входит в список разрешённых. Используется только после `authMiddleware`.

```typescript
// Пример использования
router.get('/users', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), handler);
router.put('/users/:id/role', requireRole(UserRole.SUPER_ADMIN), handler);
```

---

## 6. API маршруты

### 6.1 /auth

| Метод | Маршрут | Доступ | Описание |
|-------|---------|--------|----------|
| POST | `/auth/register` | Публичный | Регистрация. Возвращает `accessToken` и `user` |
| POST | `/auth/login` | Публичный | Вход. Возвращает `accessToken` и `user` |
| POST | `/auth/refresh` | Cookie (RT) | Обновляет пару токенов (ротация) |
| GET | `/auth/me` | Bearer Token | Возвращает данные текущего пользователя |
| POST | `/auth/logout` | Bearer Token | Удаляет текущий RT, очищает cookies |
| POST | `/auth/logout-all` | Bearer Token | Удаляет все RT пользователя |

### 6.2 /tasks

Все маршруты защищены `authMiddleware`. Пользователь видит только свои задачи.

| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/tasks` | Получить все задачи текущего пользователя |
| POST | `/tasks` | Создать задачу. Body: `{ text: string }` |
| PUT | `/tasks/:id` | Обновить задачу. Body: `{ text?: string, done?: boolean }` |
| DELETE | `/tasks/:id` | Удалить задачу |

### 6.3 /admin

Все маршруты защищены `authMiddleware` + `requireRole`.

| Метод | Маршрут | Доступ | Описание |
|-------|---------|--------|----------|
| GET | `/admin/users` | admin, super_admin | Список всех пользователей |
| GET | `/admin/users/:id/tasks` | admin, super_admin | Задачи любого пользователя |
| DELETE | `/admin/users/:id` | admin, super_admin | Удалить пользователя (и все его данные) |
| PUT | `/admin/users/:id/role` | super_admin | Изменить роль пользователя |
| PUT | `/admin/tasks/:taskId` | super_admin | Изменить задачу любого пользователя |
| DELETE | `/admin/tasks/:taskId` | super_admin | Удалить задачу любого пользователя |

---

## 7. Фронтенд

### 7.1 authClient.ts

Класс `AuthClient` хранит `accessToken` в памяти JS (не в localStorage). Основной метод — `fetchWithAuth()` — автоматически:
1. Если токена нет — вызывает `/auth/refresh` перед запросом
2. Если получил `401` с `code: TOKEN_EXPIRED` — обновляет токен и повторяет запрос

### 7.2 Восстановление сессии

При перезагрузке страницы `App.tsx` вызывает `authClient.refresh()`, а затем `authClient.getMe()` — пользователь остаётся залогиненным без повторного ввода пароля, пока refresh-токен не истёк (30 дней).

### 7.3 Proxy (vite.config.ts)

В режиме разработки Vite проксирует запросы к бэкенду:

```
/auth   → http://localhost:3000
/tasks  → http://localhost:3000
/admin  → http://localhost:3000
```

Это позволяет фронтенду делать запросы на тот же origin (`localhost:5173`) без CORS-проблем.

### 7.4 Роли в UI

| Роль | Что видит |
|------|-----------|
| `user` | Только свои задачи |
| `admin` | Вкладка «Пользователи» — просмотр пользователей и их задач |
| `super_admin` | + Смена ролей, удаление пользователей, редактирование и удаление чужих задач |

---

## 8. Безопасность

| Механизм | Реализация |
|----------|------------|
| Хэширование паролей | bcrypt, 10 rounds |
| Хранение RT | Только bcrypt-хэш в БД, сам токен в HttpOnly cookie |
| Защита от XSS | Access Token в памяти JS, RT в HttpOnly cookie (недоступен через JS) |
| Защита от CSRF | `sameSite: strict` на cookies |
| Token Rotation | При каждом refresh старый RT инвалидируется |
| Обнаружение кражи токена | Повторное использование старого RT → удаление всех сессий |
| HTTPS в production | `secure: true` на cookies при `NODE_ENV=production` |
| Ролевой доступ | Двойная проверка: `authMiddleware` + `requireRole` |