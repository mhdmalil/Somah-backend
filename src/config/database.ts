import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

export const db: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
