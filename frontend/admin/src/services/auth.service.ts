import api from './api'
import type { User, AuthTokens } from '@lms-types/index'

interface LoginResponse {
  user: User
  tokens: AuthTokens
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
    return data
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout')
  },

  async getMe(): Promise<User> {
    const { data } = await api.get<{ data: User }>('/auth/me')
    return data.data
  },

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const { data } = await api.post<AuthTokens>('/auth/refresh', { refreshToken })
    return data
  },
}
