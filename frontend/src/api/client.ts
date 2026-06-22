import axios from 'axios'

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8000',
  // LLM calls can take up to ~60s on Groq free tier; abort and show error after that
  timeout: 60000,
})
