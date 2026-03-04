// src/api/authClient.ts

// Proxy в vite.config.ts перенаправляет /auth, /tasks, /admin на бэкенд.
// Поэтому API_BASE оставляем пустым — запросы идут на тот же origin.
const API_BASE = '';

export type UserRole = 'user' | 'admin' | 'super_admin';

export type AdminUser = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
};

export type AdminTask = {
  id: string;
  userId: string;
  text: string;
  done: number;
  createdAt: string;
  updatedAt: string;
};

class AuthClient {
  private accessToken: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  // ─── Регистрация ──────────────────────────────────────────────
  async register(username: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? 'Registration failed');
    }

    const data = await res.json();
    this.accessToken = data.accessToken;
    return data.user as { id: string; username: string; role: UserRole };
  }

  // ─── Вход ─────────────────────────────────────────────────────
  async login(username: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? 'Login failed');
    }

    const data = await res.json();
    this.accessToken = data.accessToken;
    return data.user as { id: string; username: string; role: UserRole };
  }

  // ─── Обновление AT через RT ────────────────────────────────────
  async refresh(): Promise<boolean> {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      this.accessToken = null;
      return false;
    }

    const data = await res.json();
    this.accessToken = data.accessToken;
    return true;
  }

  // ─── Получить данные текущего пользователя ────────────────────
  // Используется при перезагрузке страницы для восстановления сессии
  async getMe(): Promise<{ id: string; username: string; role: UserRole } | null> {
    try {
      const res = await this.fetchWithAuth(`${API_BASE}/auth/me`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    } catch {
      return null;
    }
  }

  // ─── Выход ────────────────────────────────────────────────────
  async logout() {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: this.authHeaders(),
      credentials: 'include',
    });
    this.accessToken = null;
  }

  // ─── Fetch с автоматическим обновлением AT ────────────────────
  async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      const ok = await this.refresh();
      if (!ok) throw new Error('Unauthorized');
    }

    let res = await fetch(url, {
      ...options,
      headers: { ...options.headers, ...this.authHeaders() },
      credentials: 'include',
    });

    if (res.status === 401) {
      const body = await res.json().catch(() => ({}));
      if (body.code === 'TOKEN_EXPIRED') {
        const ok = await this.refresh();
        if (!ok) throw new Error('Session expired');

        res = await fetch(url, {
          ...options,
          headers: { ...options.headers, ...this.authHeaders() },
          credentials: 'include',
        });
      }
    }

    return res;
  }

  private authHeaders(): Record<string, string> {
    return this.accessToken
      ? { Authorization: `Bearer ${this.accessToken}` }
      : {};
  }
}

export const authClient = new AuthClient();

// ─── API задач ────────────────────────────────────────────────
export const api = {
  getTasks: () =>
    authClient.fetchWithAuth(`${API_BASE}/tasks`).then(r => r.json()),

  createTask: (text: string) =>
    authClient.fetchWithAuth(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(r => r.json()),

  updateTask: (id: string, data: { text?: string; done?: boolean }) =>
    authClient.fetchWithAuth(`${API_BASE}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteTask: (id: string) =>
    authClient.fetchWithAuth(`${API_BASE}/tasks/${id}`, { method: 'DELETE' }),
};

// ─── Admin API ────────────────────────────────────────────────
export const adminApi = {
  getUsers: (): Promise<AdminUser[]> =>
    authClient.fetchWithAuth(`${API_BASE}/admin/users`).then(r => r.json()),

  getUserTasks: (userId: string): Promise<AdminTask[]> =>
    authClient.fetchWithAuth(`${API_BASE}/admin/users/${userId}/tasks`).then(r => r.json()),

  deleteUser: (userId: string): Promise<Response> =>
    authClient.fetchWithAuth(`${API_BASE}/admin/users/${userId}`, { method: 'DELETE' }),

  changeRole: (userId: string, role: UserRole): Promise<Response> =>
    authClient.fetchWithAuth(`${API_BASE}/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }),

  // Изменить задачу любого пользователя (только super_admin)
  updateTask: (taskId: string, data: { text?: string; done?: boolean }): Promise<AdminTask> =>
    authClient.fetchWithAuth(`${API_BASE}/admin/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // Удалить задачу любого пользователя (только super_admin)
  deleteTask: (taskId: string): Promise<Response> =>
    authClient.fetchWithAuth(`${API_BASE}/admin/tasks/${taskId}`, { method: 'DELETE' }),
};