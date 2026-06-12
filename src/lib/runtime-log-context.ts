export interface RuntimeLogContext {
  vercelEnv: string | null;
  vercelUrl: string | null;
  gitRef: string | null;
  gitSha: string | null;
}

export function getRuntimeLogContext(): RuntimeLogContext {
  return {
    vercelEnv: process.env.VERCEL_ENV?.trim() || process.env.VERCEL_TARGET_ENV?.trim() || null,
    vercelUrl: process.env.VERCEL_URL?.trim() || null,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 12) || null,
  };
}
