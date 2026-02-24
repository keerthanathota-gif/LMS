import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('lms-learner-auth')
  if (raw) {
    try {
      const state = JSON.parse(raw)
      const token = state?.state?.accessToken
      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch { /* ignore */ }
  }
  return config
})

export default api
