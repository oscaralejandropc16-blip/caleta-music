import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        if (!_supabase) {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
            if (!url || !key) {
                console.warn('[Supabase] Missing env vars, returning dummy');
                // Return no-op for build time
                return () => Promise.resolve({ data: null, error: null });
            }
            _supabase = createClient(url, key);
        }
        return (_supabase as any)[prop];
    }
});
