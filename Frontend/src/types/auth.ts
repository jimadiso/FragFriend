export type AuthUser = {
  id: number
  email: string
  display_name: string
  created_at: string
}

export type AuthResponse = {
  access_token: string
  token_type: 'bearer'
  user: AuthUser
}

export type AuthMode = 'login' | 'register'