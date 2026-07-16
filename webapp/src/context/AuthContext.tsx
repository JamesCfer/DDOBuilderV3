// Community account state: current signed-in user (or null), with
// login / register / logout actions. Token lives in localStorage via
// lib/community/api; on mount we validate it against /api/auth/me.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { communityApi, getToken, setToken } from '../lib/community/api'
import type { CommunityUser } from '../lib/community/api'

interface AuthState {
  user: CommunityUser | null
  /** True while the stored token is being validated on startup. */
  checking: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  /** Sign in with a Google Identity Services ID-token credential. */
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CommunityUser | null>(null)
  const [checking, setChecking] = useState<boolean>(() => getToken() !== null)

  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    communityApi.me()
      .then(({ user: u }) => { if (!cancelled) setUser(u) })
      .catch(() => { if (!cancelled) setToken(null) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const { token, user: u } = await communityApi.login(username, password)
    setToken(token)
    setUser(u)
  }, [])

  const register = useCallback(async (username: string, email: string, password: string) => {
    const { token, user: u } = await communityApi.register(username, email, password)
    setToken(token)
    setUser(u)
  }, [])

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { token, user: u } = await communityApi.googleLogin(credential)
    setToken(token)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    communityApi.logout().catch(() => { /* token may already be dead */ })
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, checking, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
