import { createClient } from "@supabase/supabase-js";

const SUPABASE_REQUEST_TIMEOUT_MS = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS ?? 10000);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  const signal = init?.signal;

  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", () => controller.abort(), { once: true });

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

export function createServerSupabaseClient(schema = "nrl") {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    db: { schema },
    global: { fetch: fetchWithTimeout },
  });
}

export function createBrowserSupabaseClient(schema = "nrl") {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    db: { schema },
    global: { fetch: fetchWithTimeout },
  });
}
