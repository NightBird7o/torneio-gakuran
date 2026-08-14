import { SITE_CONFIG, isApiConfigured } from './site-config.js';

const cleanBase = () => SITE_CONFIG.apiBaseUrl.replace(/\/+$/, '');

export function getToken() {
  return sessionStorage.getItem(SITE_CONFIG.tokenStorageKey) || '';
}

export function setToken(token) {
  if (token) sessionStorage.setItem(SITE_CONFIG.tokenStorageKey, token);
  else sessionStorage.removeItem(SITE_CONFIG.tokenStorageKey);
}

export function consumeTokenFromHash() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = hash.get('session');
  if (!token) return false;
  setToken(token);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return true;
}

export function startDiscordLogin() {
  if (!isApiConfigured()) throw new Error('A API do Amateru ainda não foi configurada no site-config.js.');
  const returnTo = `${location.origin}${location.pathname}`;
  location.href = `${cleanBase()}/auth/discord?return_to=${encodeURIComponent(returnTo)}`;
}

export async function api(path, options = {}) {
  if (!isApiConfigured()) throw new Error('API não configurada.');
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body != null) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${cleanBase()}${path}`, {
    ...options,
    headers,
    body: options.body != null && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });

  let data = null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) data = await response.json().catch(() => null);
  else data = await response.text().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `Erro HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.code;
    error.data = data;
    throw error;
  }
  return data;
}

export const Api = Object.freeze({
  me: () => api('/api/me'),
  home: () => api('/api/home'),
  profile: () => api('/api/profile'),
  saveProfile: (profile) => api('/api/profile', { method: 'PUT', body: profile }),
  tournaments: () => api('/api/tournaments'),
  tournament: (id) => api(`/api/tournaments/${encodeURIComponent(id)}`),
  createTournament: (payload) => api('/api/tournaments', { method: 'POST', body: payload }),
  updateTournament: (id, payload) => api(`/api/tournaments/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  joinTournament: (id) => api(`/api/tournaments/${encodeURIComponent(id)}/join`, { method: 'POST' }),
  leaveTournament: (id) => api(`/api/tournaments/${encodeURIComponent(id)}/join`, { method: 'DELETE' }),
  saveBracket: (id, state) => api(`/api/tournaments/${encodeURIComponent(id)}/bracket`, { method: 'PUT', body: { state } }),
  division: () => api('/api/division/me'),
  divisionTournaments: () => api('/api/division/me/tournaments'),
  admins: () => api('/api/admin/access'),
  addAdmin: (payload) => api('/api/admin/access', { method: 'POST', body: payload }),
  removeAdmin: (userId) => api(`/api/admin/access/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
});
