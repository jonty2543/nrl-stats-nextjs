import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    db: { schema: "nrl" },
  });
}

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "nrl" },
  });
}
