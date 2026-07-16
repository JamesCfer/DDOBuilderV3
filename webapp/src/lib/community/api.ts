// Client for the community platform API (accounts, saved builds, star/publish,
// votes, sortable community listing). Token persisted in localStorage and sent
// as a Bearer header.

const TOKEN_KEY = 'ddo-community-token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

export interface CommunityUser {
  id: string
  username: string
}

export interface BuildSnapshot {
  race: string
  classes: string[]
  classesLabel: string
  totalLevel: number
  hp: number
  ac: number
  prr: number
  mrr: number
  meleePower: number
  rangedPower: number
}

export interface CommunityListing {
  id: string
  name: string
  author: string
  publishedAt: string
  snapshot?: BuildSnapshot
  score: number
  myVote: 1 | -1 | 0
}

export interface MyBuildSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  published: boolean
  score: number
}

export type CommunitySort =
  | 'votes' | 'newest' | 'hp' | 'ac' | 'prr' | 'mrr'
  | 'meleePower' | 'rangedPower' | 'totalLevel'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...init, headers })
  let body: unknown = null
  try { body = await res.json() } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `Request failed (${res.status})`
    throw new Error(msg)
  }
  return body as T
}

export const communityApi = {
  register: (username: string, email: string, password: string) =>
    req<{ token: string; user: CommunityUser }>('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ username, email, password }),
    }),

  login: (username: string, password: string) =>
    req<{ token: string; user: CommunityUser }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),

  /** Google client id when the server has Google sign-in configured. */
  googleConfig: () => req<{ clientId: string | null }>('/api/auth/google/config'),

  /** Exchange a Google Identity Services ID-token credential for a session. */
  googleLogin: (credential: string) =>
    req<{ token: string; user: CommunityUser }>('/api/auth/google', {
      method: 'POST', body: JSON.stringify({ credential }),
    }),

  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => req<{ user: CommunityUser }>('/api/auth/me'),

  myBuilds: () => req<MyBuildSummary[]>('/api/my/builds'),

  saveBuild: (payload: { id?: string; name: string; document: unknown }) =>
    req<{ id: string; name: string; updatedAt: string; published: boolean }>('/api/my/builds', {
      method: 'POST', body: JSON.stringify(payload),
    }),

  getMyBuild: (id: string) =>
    req<{ id: string; name: string; document: unknown }>(`/api/my/builds/${id}`),

  deleteBuild: (id: string) =>
    req<{ ok: boolean }>(`/api/my/builds/${id}`, { method: 'DELETE' }),

  star: (id: string) =>
    req<{ ok: boolean; snapshot: BuildSnapshot }>(`/api/my/builds/${id}/star`, { method: 'POST' }),

  unstar: (id: string) =>
    req<{ ok: boolean }>(`/api/my/builds/${id}/star`, { method: 'DELETE' }),

  list: (params: { cls?: string; race?: string; sort?: CommunitySort; order?: 'asc' | 'desc' } = {}) => {
    const q = new URLSearchParams()
    if (params.cls) q.set('class', params.cls)
    if (params.race) q.set('race', params.race)
    if (params.sort) q.set('sort', params.sort)
    if (params.order) q.set('order', params.order)
    const qs = q.toString()
    return req<CommunityListing[]>(`/api/community${qs ? `?${qs}` : ''}`)
  },

  getPublished: (id: string) =>
    req<{ id: string; name: string; author: string; document: unknown; snapshot?: BuildSnapshot; score: number }>(`/api/community/${id}`),

  vote: (id: string, value: 1 | -1 | 0) =>
    req<{ score: number; myVote: 1 | -1 | 0 }>(`/api/community/${id}/vote`, {
      method: 'POST', body: JSON.stringify({ value }),
    }),
}
