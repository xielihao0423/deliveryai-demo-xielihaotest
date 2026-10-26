const AUTH_KEY = 'dashboard_auth'
const MOCK_USER = 'admin'
const MOCK_PASSWORD = 'admin123'

export interface AuthUser {
  username: string
  loginAt: string
}

export function login(username: string, password: string): AuthUser | null {
  if (username === MOCK_USER && password === MOCK_PASSWORD) {
    const user: AuthUser = { username, loginAt: new Date().toISOString() }
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    } catch {
      // localStorage 不可用时降级为内存态
    }
    return user
  }
  return null
}

export function logout(): void {
  try {
    localStorage.removeItem(AUTH_KEY)
  } catch {
    // localStorage 不可用时忽略
  }
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  return getAuthUser() !== null
}
