import { createClient } from '@supabase/supabase-js'

// Production fallback keeps the live app connected even when Vercel env vars are absent.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  'https://drsatwounoiqrenkhcze.supabase.co'

const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  'sb_publishable_HZnlzAaWdNlOpARiJql6Uw_4W5QErAX'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
