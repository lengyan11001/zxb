const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? 'https://zxbapi.aiyes.vip' : '/zxbaip');
const TOKEN_KEY = 'zxb_auth_token';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'sdr';
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'sdr';
  status: 'active' | 'disabled';
  enterpriseCount?: number;
  createdAt: string;
  updatedAt: string;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('zxb:unauthorized'));
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      message = await res.text();
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type');
  if (ct?.includes('application/json')) return res.json();
  return res.blob();
}

export const api = {
  health: () => apiFetch('/health'),
  login: async (account: string, password: string): Promise<{ token: string; user: AuthUser }> => {
    const result = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) });
    setToken(result.token);
    return result;
  },
  me: (): Promise<AuthUser> => apiFetch('/auth/me'),

  dashboard: () => apiFetch('/dashboard'),

  getProducts: (status?: string) => apiFetch(`/products${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getProduct: (id: string) => apiFetch(`/products/${id}`),
  createProduct: (data: unknown) => apiFetch('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: unknown) => apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: string) => apiFetch(`/products/${id}`, { method: 'DELETE' }),

  getEnterprises: (params?: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => value && qs.set(key, value));
    return apiFetch(`/enterprises${qs.size ? `?${qs}` : ''}`);
  },
  getEnterprise: (id: string) => apiFetch(`/enterprises/${id}`),
  createEnterprise: (data: unknown) => apiFetch('/enterprises', { method: 'POST', body: JSON.stringify(data) }),
  batchCreate: (names: string[]) => apiFetch('/enterprises/batch', { method: 'POST', body: JSON.stringify({ names }) }),
  assignEnterprises: (ids: string[], ownerId: string | null) =>
    apiFetch('/enterprises/assign', { method: 'POST', body: JSON.stringify({ ids, ownerId }) }),
  uploadEnterprises: (file: File) => {
    const form = new FormData();
    form.set('file', file);
    return apiFetch('/enterprises/upload', { method: 'POST', body: form });
  },
  updateEnterprise: (id: string, data: unknown) => apiFetch(`/enterprises/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEnterprise: (id: string) => apiFetch(`/enterprises/${id}`, { method: 'DELETE' }),
  collectEnterprise: (id: string) => apiFetch(`/enterprises/${id}/collect`, { method: 'POST' }),
  generateScript: (enterpriseId: string, productId: string) =>
    apiFetch(`/enterprises/${enterpriseId}/generate-script`, { method: 'POST', body: JSON.stringify({ productId }) }),
  getLatestScript: (enterpriseId: string, productId?: string) =>
    apiFetch(`/enterprises/${enterpriseId}/script${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`),
  getCalls: (enterpriseId: string) => apiFetch(`/enterprises/${enterpriseId}/calls`),
  createCall: (enterpriseId: string, data: { result: string; notes?: string }) =>
    apiFetch(`/enterprises/${enterpriseId}/calls`, { method: 'POST', body: JSON.stringify(data) }),

  getDataSources: () => apiFetch('/settings/data-sources'),
  updateDataSource: (key: string, data: unknown) => apiFetch(`/settings/data-sources/${key}`, { method: 'PUT', body: JSON.stringify(data) }),

  getUsers: (): Promise<User[]> => apiFetch('/users'),
  getAssignableUsers: (): Promise<User[]> => apiFetch('/users/assignable'),
  createUser: (data: unknown): Promise<User> => apiFetch('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: unknown): Promise<User> => apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export async function downloadExport(ids: string[]) {
  const blob = await apiFetch('/export', { method: 'POST', body: JSON.stringify({ ids }) }) as Blob;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `企业外呼名单_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
