// Cliente Axios - HU-001/002/003
// Interceptor retry para cold start Render 15s Tabla16:27
import axios from 'axios'
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 8000,
})
api.interceptors.response.use(null, async (err) => {
  const cfg = err.config
  if (!cfg || cfg.__retried) throw err
  cfg.__retried = true
  await new Promise(r => setTimeout(r, 2000))
  return api(cfg)
})
