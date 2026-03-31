import { createClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

declare global {
  var _supabaseLegacyClient: any | undefined;
}

export function getSupabaseClient() {
  if (globalThis._supabaseLegacyClient) {
    return globalThis._supabaseLegacyClient;
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  globalThis._supabaseLegacyClient = client;
  return client;
}
