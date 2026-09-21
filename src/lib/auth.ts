import { createClient, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const authConfigured = Boolean(url && publicKey)

export const authClient = authConfigured ? createClient(url!, publicKey!, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
}) : null

export type AuthUser = User
