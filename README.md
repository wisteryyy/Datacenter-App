# Datacenter App

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
git clone https://github.com/wisteryyy/Datacenter-App.git
cd Datacenter-App
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Подставьте в файл `example.env` в корне проекта свои специальные секреты
Сгенерировать оба секрета автоматически:

```bash
npm run gen:secrets
```

Скопируйте вывод и вставьте значения в `.env`.
```bash
# .env
PORT=3000
DB_PATH=./todo-backend/todo.db
JWT_ACCESS_SECRET=замените-на-случайную-строку-минимум-64-символа
JWT_REFRESH_SECRET=замените-на-другую-случайную-строку-минимум-64-символа
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
VITE_API_URL=http://localhost:3000
```

### 4. Запустить проект

```bash
npm run dev
```

- Бэкенд: [http://localhost:3000](http://localhost:3000)
- Фронтенд: [http://localhost:5173](http://localhost:5173)

---

## Роли пользователей

| Роль | Возможности |
|------|-------------|
| `user` | Управление своими задачами |
| `admin` | + Просмотр всех пользователей и их задач |
| `super_admin` | + Изменение ролей, удаление пользователей, редактирование и удаление чужих задач |

Назначить роль вручную можно через скрипт из корня проекта:

```bash
npm run setrole <username> <role>
```

Пример:

```bash
npm run setrole SuperAdminUser super_admin
npm run setrole AdminUser admin
```

---

## Просмотр базы данных

Drizzle Studio — визуальный интерфейс для просмотра и редактирования данных в БД.

```bash
npm run db:studio
```

Откроется в браузере: [https://local.drizzle.studio](https://local.drizzle.studio)