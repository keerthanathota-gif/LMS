import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authService } from '@services/auth.service'
import { useAuthStore } from '@store/auth.store'

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false)
  const { setAuth, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const { user, tokens } = await authService.login(email, password)
      setAuth(user, tokens.accessToken)
      navigate(user.role === 'learner' ? '/learn' : '/chat')
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`)
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } finally {
      clearAuth()
      navigate('/login')
    }
  }

  return { login, logout, isLoading }
}
