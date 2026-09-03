import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UnsafeImpl = (query: string, params: unknown[]) => Promise<unknown[] & { count?: number }>;

const postgresState = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; options: Record<string, unknown> }>,
  clients: [] as Array<{
    unsafeCalls: Array<{ query: string; params: unknown[] }>;
    endCalls: number;
    unsafe: UnsafeImpl;
    end: () => Promise<void>;
  }>,
  nextUnsafe: [] as UnsafeImpl[],
}));

vi.mock("postgres", () => ({
  default: (url: string, options: Record<string, unknown>) => {
    const client = {
      unsafeCalls: [] as Array<{ query: string; params: unknown[] }>,
      endCalls: 0,
      unsafe: async (query: string, params: unknown[]) => {
        client.unsafeCalls.push({ query, params });
        const impl = postgresState.nextUnsafe.shift();
        if (impl) return impl(query, params);
        return [{ id: "default-row" }] as unknown[] & { count?: number };
      },
      end: async () => {
        client.endCalls += 1;
      },
    };
    postgresState.calls.push({ url, options });
    postgresState.clients.push(client);
    return client;
  },
}));

async function loadDb() {
  vi.resetModules();
  const mod = await import("@/lib/db/index");
  return mod.getDb();
}

beforeEach(() => {
  postgresState.calls = [];
  postgresState.clients = [];
  postgresState.nextUnsafe = [];
  process.env.DATABASE_URL = "postgresql://user:pass@example.com:5432/db";
  delete process.env.POSTGRES_MAX_CONNECTIONS;
  delete process.env.VERCEL;
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_MAX_CONNECTIONS;
  delete process.env.VERCEL;
  vi.resetModules();
});

describe("Postgres DbClient stability behavior", () => {
  it("resets the client and retries read queries once after a closed connection", async () => {
    postgresState.nextUnsafe = [
      async () => {
        throw new Error("Connection closed.");
      },
      async () => [{ id: "after-reset" }] as unknown[] & { count?: number },
    ];
    const db = await loadDb();

    await expect(db.prepare("SELECT id FROM leads WHERE id = ?").get("lead-1")).resolves.toEqual({ id: "after-reset" });

    expect(postgresState.clients).toHaveLength(2);
    expect(postgresState.clients[0].unsafeCalls).toHaveLength(1);
    expect(postgresState.clients[0].endCalls).toBe(1);
    expect(postgresState.clients[1].unsafeCalls).toHaveLength(1);
  });

  it("resets but does not retry write queries after a closed connection", async () => {
    postgresState.nextUnsafe = [
      async () => {
        throw new Error("Connection closed.");
      },
    ];
    const db = await loadDb();

    await expect(db.prepare("UPDATE leads SET score = ? WHERE id = ?").run(10, "lead-1")).rejects.toThrow("Connection closed.");

    expect(postgresState.clients).toHaveLength(2);
    expect(postgresState.clients[0].unsafeCalls).toHaveLength(1);
    expect(postgresState.clients[0].endCalls).toBe(1);
    expect(postgresState.clients[1].unsafeCalls).toHaveLength(0);
  });

  it("uses POSTGRES_MAX_CONNECTIONS when configured", async () => {
    process.env.POSTGRES_MAX_CONNECTIONS = "3";

    await loadDb();

    expect(postgresState.calls[0].options.max).toBe(3);
  });

  it("defaults to one Postgres connection per Vercel instance", async () => {
    process.env.VERCEL = "1";

    await loadDb();

    expect(postgresState.calls[0].options.max).toBe(1);
  });

  it("types bare IS NULL workspace parameters so Postgres can bind them", async () => {
    const db = await loadDb();
    await db.prepare(
      "SELECT * FROM crawl_runs WHERE tenant_id = ? AND ((? IS NULL AND workspace_id IS NULL) OR workspace_id = ?)",
    ).get("tenant-a", null, null);

    expect(postgresState.clients[0].unsafeCalls).toHaveLength(1);
    const { query, params } = postgresState.clients[0].unsafeCalls[0];
    expect(query).toBe("SELECT * FROM crawl_runs WHERE tenant_id = $1 AND (($2::uuid IS NULL AND workspace_id IS NULL) OR workspace_id = $3)");
    expect(params).toEqual(["tenant-a", null, null]);
  });
});
