import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

const enabled = process.env.G007SR4_RUN_DISPOSABLE_PG_TESTS === "1";

describe.skipIf(!enabled)("minimum-review PostgreSQL bind regression", () => {
  it("uses the shared integer contract without fractional or overflow binds", async () => {
    const url = process.env.G007SR4_DATABASE_URL;
    if (!url) throw new Error("G007SR4_DATABASE_URL is required");

    const parsedUrl = new URL(url);
    const databaseName = parsedUrl.pathname.slice(1);
    if (
      (parsedUrl.hostname !== "127.0.0.1" && parsedUrl.hostname !== "localhost")
      || !/^g007sr4_min_reviews_rehearsal_[a-z0-9_]+$/.test(databaseName)
    ) {
      throw new Error("G-007SR4 permits only a uniquely named loopback database");
    }

    const admin = postgres(url, { max: 1, ssl: false, onnotice: () => undefined });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = randomUUID();
    const tenantSlug = `sr4-${suffix}`;
    const marker = `g007sr4-${suffix}`;
    const ids = {
      null: `${marker}-null`,
      zero: `${marker}-zero`,
      five: `${marker}-five`,
      ten: `${marker}-ten`,
      max: `${marker}-max`,
    };
    const priorEnv = {
      databaseUrl: process.env.DATABASE_URL,
      databaseSsl: process.env.DATABASE_SSL,
    };
    let resetDbClient: (() => Promise<void>) | undefined;
    let tenantCreated = false;

    try {
      const version = await admin.unsafe<Array<{ version: string }>>(
        "SELECT current_setting('server_version_num') AS version",
      );
      expect(version[0].version.startsWith("16")).toBe(true);
      const catalog = await admin.unsafe<Array<{ leads: string | null; tenants: string | null }>>(
        "SELECT to_regclass('public.leads')::text AS leads, to_regclass('public.tenants')::text AS tenants",
      );
      expect(catalog[0]).toEqual({ leads: "leads", tenants: "tenants" });

      await admin.unsafe(
        "INSERT INTO public.tenants(id,slug,name,status) VALUES ($1::uuid,$2,$3,'active')",
        [tenantId, tenantSlug, `SR4 ${suffix}`],
      );
      tenantCreated = true;
      await admin.unsafe(
        `INSERT INTO public.leads(id,tenant_id,place_id,name,review_count,is_excluded,score)
         VALUES
           ($1,$6::uuid,$1,$7,NULL,0,0),
           ($2,$6::uuid,$2,$7,0,0,0),
           ($3,$6::uuid,$3,$7,5,0,0),
           ($4,$6::uuid,$4,$7,10,0,0),
           ($5,$6::uuid,$5,$7,2147483647,0,0)`,
        [ids.null, ids.zero, ids.five, ids.ten, ids.max, tenantId, marker],
      );

      process.env.DATABASE_URL = url;
      process.env.DATABASE_SSL = "disable";
      vi.resetModules();
      const dbModule = await import("@/lib/db/index");
      resetDbClient = dbModule.resetDbClient;
      const { getLeads } = await import("@/lib/db/queries");
      const read = async (minReviews: unknown) => {
        const result = await getLeads({
          search: marker,
          archived: "all",
          includeExcluded: true,
          minReviews: minReviews as number,
          sortBy: "review_count",
          sortDir: "asc",
          pageSize: 20,
        });
        return result.leads.map((lead) => lead.id).sort();
      };
      const allIds = Object.values(ids).sort();

      await expect(read(0)).resolves.toEqual(allIds);
      await expect(read(4.5)).resolves.toEqual(allIds);
      await expect(read("50reviews")).resolves.toEqual(allIds);
      await expect(read(5)).resolves.toEqual([ids.five, ids.max, ids.ten].sort());
      await expect(read(2_147_483_647)).resolves.toEqual([ids.max]);
      await expect(read(2_147_483_648)).resolves.toEqual([]);
      await expect(read(Number.MAX_SAFE_INTEGER)).resolves.toEqual([]);
    } finally {
      await resetDbClient?.();
      if (priorEnv.databaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = priorEnv.databaseUrl;
      if (priorEnv.databaseSsl === undefined) delete process.env.DATABASE_SSL;
      else process.env.DATABASE_SSL = priorEnv.databaseSsl;
      if (tenantCreated) {
        await admin.unsafe("DELETE FROM public.leads WHERE tenant_id=$1::uuid", [tenantId]).catch(() => undefined);
        await admin.unsafe("DELETE FROM public.tenants WHERE id=$1::uuid", [tenantId]).catch(() => undefined);
      }
      await admin.end({ timeout: 5 });
      vi.resetModules();
    }
  }, 60_000);
});
