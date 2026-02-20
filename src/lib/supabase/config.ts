const supabaseUrlFallback = "https://placeholder.supabase.co";
const supabaseAnonKeyFallback = "placeholder-anon-key";

export const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? supabaseUrlFallback;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? supabaseAnonKeyFallback;
