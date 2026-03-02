// src/api/authClient.ts
// Клиент хранит Access Token в памяти — НЕ в localStorage.
// При перезагрузке страницы автоматически вызывается /auth/refresh
// (Refresh Token приходит из HttpOnly cookie браузера автоматически).

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

class AuthClient {
  private accessToken: string | null = null;

  // ─── Получить текущий AT (только для чтения) ──────────────────
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // ─── Регистрация ──────────────────────────────────────────────
  async register(username: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',   // получаем cookie от сервера
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? 'Registration failed');
    }

    const data = await res.json();
    this.accessToken = data.accessToken;   // храним AT в памяти
    return data.user;
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
    return data.user;
  }

  // ─── Обновление AT через RT (cookie отправляется автоматически) ─
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
    // Если AT нет — пробуем обновить через RT
    if (!this.accessToken) {
      const ok = await this.refresh();
      if (!ok) throw new Error('Unauthorized');
    }

    let res = await fetch(url, {
      ...options,
      headers: { ...options.headers, ...this.authHeaders() },
      credentials: 'include',
    });

    // AT истёк → обновляем и повторяем запрос один раз
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

// Синглтон — один экземпляр на всё приложение
export const authClient = new AuthClient();

// ─── Удобные функции для API задач ────────────────────────────
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
    authClient.fetchWithAuth(`${API_BASE}/tasks/${id}`, {
      method: 'DELETE',
    }),
};