import { useState, useEffect, useCallback } from 'react';
import { authClient, api, adminApi } from './api/authClient.js';
import type { UserRole, AdminUser, AdminTask } from './api/authClient.js';
import './App.css';

// ─── Типы ─────────────────────────────────────────────────
type Task = {
  id: string;
  userId: string;
  text: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

type User = {
  id: string;
  username: string;
  role: UserRole;
};

// ─── Диалог подтверждения ─────────────────────────────────────
type ConfirmState = {
  message: string;
  onConfirm: () => void;
} | null;

function ConfirmDialog({ state, onCancel }: {
  state: ConfirmState;
  onCancel: () => void;
}) {
  if (!state) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{state.message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn-cancel" onClick={onCancel}>Отмена</button>
          <button className="confirm-btn-ok" onClick={() => { state.onConfirm(); onCancel(); }}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

// ─── Бейдж роли ───────────────────────────────────────────────
function RoleBadge({ role }: { role: UserRole }) {
  const labels: Record<UserRole, string> = {
    user: 'Пользователь',
    admin: 'Админ',
    super_admin: 'Супер-Админ',
  };
  return <span className={`role-badge role-${role}`}>{labels[role]}</span>;
}

// ─── Форма входа/регистрации ──────────────────────────────────
function AuthForm({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Заполните все поля');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // authClient.login/register сохраняет AT в памяти,
      // RT приходит в HttpOnly cookie автоматически
      const user = mode === 'login'
        ? await authClient.login(username, password)
        : await authClient.register(username, password);

      onAuth(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h1 className="auth-title">
          {mode === 'login' ? 'Добро пожаловать' : 'Создать аккаунт'}
        </h1>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label>Логин</label>
            <input
              type="text"
              placeholder="Введите ваш логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label>Пароль</label>
            <input
              type="password"
              placeholder="Введите ваш пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
          <button
            className="btn-link"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Одна задача ──────────────────────────────────────────────
function TaskItem({ task, onUpdate, onDelete }: {
  task: Task;
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);

  const saveEdit = async () => {
    if (editText.trim() && editText !== task.text)
      await onUpdate(task.id, { text: editText.trim() });
    setEditing(false);
  };

  return (
    <div className={`task-item ${task.done ? 'task-done' : ''}`}>
      <button className="task-check" onClick={() => onUpdate(task.id, { done: !task.done })} aria-label="Отметить">
        {task.done && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4L4 7.5L10 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {editing ? (
        <input className="task-edit-input" value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditText(task.text); setEditing(false); } }}
          autoFocus />
      ) : (
        <span className="task-text" onDoubleClick={() => setEditing(true)}>{task.text}</span>
      )}
      <button className="task-delete" onClick={() => onDelete(task.id)} aria-label="Удалить">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ─── Одна задача в админке ────────────────────────────────────
function AdminTaskItem({ task, isSuperAdmin, onUpdate, onDelete }: {
  task: AdminTask;
  isSuperAdmin: boolean;
  onUpdate: (id: string, data: { text?: string; done?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);

  const saveEdit = async () => {
    if (editText.trim() && editText.trim() !== task.text) {
      await onUpdate(task.id, { text: editText.trim() });
    }
    setEditing(false);
  };

  const isDone = Boolean(task.done);

  return (
    <div className={`admin-task-item ${isDone ? 'done' : ''}`}>
      {/* Чекбокс — только super_admin может менять статус */}
      <button
        className="admin-task-check"
        onClick={() => isSuperAdmin && onUpdate(task.id, { done: !isDone })}
        style={{ cursor: isSuperAdmin ? 'pointer' : 'default' }}
        title={isSuperAdmin ? (isDone ? 'Отметить активной' : 'Отметить выполненной') : undefined}
      >
        {isDone ? '✓' : '○'}
      </button>

      {/* Текст задачи — двойной клик для редактирования (только super_admin) */}
      {editing ? (
        <input
          className="admin-task-edit-input"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') { setEditText(task.text); setEditing(false); }
          }}
          autoFocus
        />
      ) : (
        <span
          className="admin-task-text"
          onDoubleClick={() => isSuperAdmin && setEditing(true)}
          title={isSuperAdmin ? 'Двойной клик для редактирования' : undefined}
        >
          {task.text}
        </span>
      )}

      <span className="admin-task-date">
        {new Date(task.createdAt).toLocaleDateString('ru-RU')}
      </span>

      {/* Кнопка удаления — только super_admin */}
      {isSuperAdmin && (
        <button
          className="admin-task-delete"
          onClick={() => onDelete(task.id)}
          title="Удалить задачу"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Панель администратора ────────────────────────────────────
function AdminPanel({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userTasks, setUserTasks] = useState<AdminTask[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';

  const askConfirm = (message: string, onConfirm: () => void) => {
    setConfirmState({ message, onConfirm });
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError('');
    try {
      const data = await adminApi.getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setError('Не удалось загрузить пользователей');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSelectUser = async (user: AdminUser) => {
    if (selectedUser?.id === user.id) {
      setSelectedUser(null);
      setUserTasks([]);
      return;
    }
    setSelectedUser(user);
    setLoadingTasks(true);
    try {
      const tasks = await adminApi.getUserTasks(user.id);
      setUserTasks(Array.isArray(tasks) ? tasks : []);
    } catch {
      setUserTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    askConfirm(
      `Удалить пользователя «${user.username}»? Все его задачи также будут удалены.`,
      async () => {
        try {
          const res = await adminApi.deleteUser(user.id);
          if (res.ok) {
            showSuccess(`Пользователь «${user.username}» удалён`);
            if (selectedUser?.id === user.id) { setSelectedUser(null); setUserTasks([]); }
            loadUsers();
          } else {
            const data = await res.json();
            setError(data.error ?? 'Ошибка удаления');
          }
        } catch {
          setError('Ошибка удаления пользователя');
        }
      }
    );
  };

  const handleUpdateTask = async (taskId: string, data: { text?: string; done?: boolean }) => {
    if (!isSuperAdmin) return;
    try {
      const updated = await adminApi.updateTask(taskId, data);
      setUserTasks(prev => prev.map(t => t.id === taskId ? { ...updated, done: updated.done ? 1 : 0 } : t));
    } catch {
      setError('Ошибка обновления задачи');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!isSuperAdmin) return;
    askConfirm('Удалить эту задачу?', async () => {
      try {
        const res = await adminApi.deleteTask(taskId);
        if (res.ok) {
          setUserTasks(prev => prev.filter(t => t.id !== taskId));
          showSuccess('Задача удалена');
        }
      } catch {
        setError('Ошибка удаления задачи');
      }
    });
  };

  const handleChangeRole = async (user: AdminUser, newRole: UserRole) => {
    setChangingRole(user.id);
    try {
      const res = await adminApi.changeRole(user.id, newRole);
      if (res.ok) {
        showSuccess(`Роль «${user.username}» изменена на ${newRole}`);
        loadUsers();
      } else {
        const data = await res.json();
        setError(data.error ?? 'Ошибка изменения роли');
      }
    } catch {
      setError('Ошибка изменения роли');
    } finally {
      setChangingRole(null);
    }
  };

  return (
    <>
    <div className="admin-panel">
      <div className="admin-header">
        <h2 className="admin-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Управление пользователями
        </h2>
        <button className="btn-refresh" onClick={loadUsers} title="Обновить">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      {error && <div className="admin-error">{error} <button onClick={() => setError('')}>✕</button></div>}
      {successMsg && <div className="admin-success">{successMsg}</div>}

      {loadingUsers ? (
        <p className="admin-loading">Загрузка пользователей...</p>
      ) : (
        <div className="admin-users-list">
          {users.map(user => (
            <div key={user.id} className={`admin-user-row ${selectedUser?.id === user.id ? 'selected' : ''}`}>
              <div className="admin-user-main">
                <div className="admin-user-info" onClick={() => handleSelectUser(user)}>
                  <span className="admin-username">{user.username}</span>
                  <RoleBadge role={user.role as UserRole} />
                  <span className="admin-user-date">
                    {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>

                <div className="admin-user-actions">
                  {/* Смена роли — только super_admin и не для самого себя */}
                  {isSuperAdmin && user.id !== currentUser.id && (
                    <select
                      className="role-select"
                      value={user.role}
                      disabled={changingRole === user.id}
                      onChange={(e) => handleChangeRole(user, e.target.value as UserRole)}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                      <option value="super_admin">super_admin</option>
                    </select>
                  )}

                  {/* Просмотр задач */}
                  <button
                    className={`btn-tasks-toggle ${selectedUser?.id === user.id ? 'active' : ''}`}
                    onClick={() => handleSelectUser(user)}
                    title="Задачи пользователя"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                    Задачи
                  </button>

                  {/* Удаление — нельзя удалить super_admin и себя */}
                  {user.role !== 'super_admin' && user.id !== currentUser.id && (
                    <button
                      className="btn-delete-user"
                      onClick={() => handleDeleteUser(user)}
                      title="Удалить пользователя"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4h6v2"/>
                      </svg>
                      Удалить
                    </button>
                  )}
                </div>
              </div>

              {/* Задачи пользователя — раскрывается по клику */}
              {selectedUser?.id === user.id && (
                <div className="admin-user-tasks">
                  <p className="admin-tasks-title">
                    Задачи пользователя «{user.username}»:
                  </p>
                  {loadingTasks ? (
                    <p className="admin-loading">Загрузка задач...</p>
                  ) : userTasks.length === 0 ? (
                    <p className="admin-no-tasks">Задач нет</p>
                  ) : (
                    <div className="admin-tasks-list">
                      {userTasks.map(task => (
                        <AdminTaskItem
                          key={task.id}
                          task={task}
                          isSuperAdmin={isSuperAdmin}
                          onUpdate={handleUpdateTask}
                          onDelete={handleDeleteTask}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
    </>
  );
}

// ─── Приложение задач ─────────────────────────────────────────
function TodoApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'admin'>('tasks');
  const [sessionExpired, setSessionExpired] = useState(false);

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.getTasks();
      if (Array.isArray(data)) setTasks(data);
    } catch (err) {
      // AT и RT оба невалидны — отправляем на логин
      if (err instanceof Error && err.message === 'Unauthorized') {
        setSessionExpired(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // При монтировании пробуем получить задачи.
  // authClient.fetchWithAuth автоматически вызовет /auth/refresh,
  // если AT отсутствует (например, после перезагрузки страницы).
  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Сессия истекла — показываем форму входа
  if (sessionExpired) {
    return <AuthForm onAuth={() => { setSessionExpired(false); loadTasks(); }} />;
  }

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      const task = await api.createTask(newText.trim());
      // Проверяем что ответ — задача, а не ошибка
      if (task && !task.error) {
        setTasks((prev) => [task, ...prev]);
        setNewText('');
      }
    } catch (err) {
      console.error('Ошибка создания задачи:', err);
    }
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    try {
      const updated = await api.updateTask(id, data);
      // Проверяем что сервер вернул задачу без ошибки
      if (updated && !updated.error) {
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
    } catch (err) {
      console.error('Ошибка обновления задачи:', err);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const res = await api.deleteTask(id);
      // Сервер возвращает 204 No Content при успехе
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error('Ошибка удаления задачи:', err);
    }
  };

  const filtered = tasks.filter(t => {
    if (filter === 'active') return !t.done;
    if (filter === 'done') return t.done;
    return true;
  });

  const doneCount = tasks.filter(t => t.done).length;

  return (
    <div className="app-wrapper">
      <div className={`app-card ${isAdmin ? 'app-card-wide' : ''}`}>
        {/* Шапка */}
        <header className="app-header">
          <div className="header-user">
            <span className="header-username">{user.username}</span>
            <RoleBadge role={user.role} />
          </div>
          <button className="btn-logout" onClick={onLogout}>Выйти</button>
        </header>

        {/* Вкладки — только для admin/super_admin */}
        {isAdmin && (
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Мои задачи
            </button>
            <button
              className={`tab ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Пользователи
            </button>
          </div>
        )}

        {/* Контент вкладки задач */}
        {activeTab === 'tasks' && (
          <>
            <div className="stats">
              <div className="stat">
                <span className="stat-num">{tasks.length}</span>
                <span className="stat-label">всего</span>
              </div>
              <div className="stat">
                <span className="stat-num">{tasks.length - doneCount}</span>
                <span className="stat-label">активных</span>
              </div>
              <div className="stat">
                <span className="stat-num accent">{doneCount}</span>
                <span className="stat-label">готово</span>
              </div>
            </div>

            <form onSubmit={addTask} className="add-form">
          <input
            className="add-input"
            placeholder="Добавить задачу..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
              <button type="submit" className="btn-add" disabled={!newText.trim()}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2V14M2 8H14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </form>

            <div className="filters">
          {(['all', 'active', 'done'] as const).map((f) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
                  {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Готовые'}
                </button>
              ))}
            </div>

            <div className="task-list">
              {loading && <p className="empty-msg">Загрузка...</p>}

              {!loading && filtered.length === 0 && (
            <p className="empty-msg">
              {filter === 'all' ? 'Задач пока нет' : 'Ничего не найдено'}
            </p>
              )}

          {filtered.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onUpdate={updateTask}
              onDelete={deleteTask}
            />
              ))}
            </div>

            {tasks.length > 0 && <p className="hint">Двойной клик по задаче — чтобы редактировать</p>}
          </>
        )}

        {/* Контент вкладки админ-панели */}
        {activeTab === 'admin' && isAdmin && (
          <AdminPanel currentUser={user} />
        )}
      </div>
    </div>
  );
}

// ─── Корневой компонент ───────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  const handleAuth = (u: User) => setUser(u);

  const handleLogout = async () => {
    await authClient.logout();
    setUser(null);
  };

  // Тихое восстановление сессии при перезагрузке страницы
  useEffect(() => {
    const restore = async () => {
      const ok = await authClient.refresh();
      if (ok) {
        // Токен обновлён — получаем данные пользователя (имя, роль)
        const userData = await authClient.getMe();
        if (userData) setUser(userData);
      }
      setInitializing(false);
    };
    restore();
  }, []);

  if (initializing) {
    return (
      <div className="auth-wrapper">
        <p style={{ color: '#999' }}>Загрузка...</p>
      </div>
    );
  }

  return user
    ? <TodoApp user={user} onLogout={handleLogout} />
    : <AuthForm onAuth={handleAuth} />;
}