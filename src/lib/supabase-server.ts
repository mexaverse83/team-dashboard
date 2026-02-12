import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Server-side Supabase client — no realtime, used in Server Components
export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
})
