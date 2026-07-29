import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join("supabase", "migrations", "202607290003_add_ai_tenant_scope_worker_envelope.sql"), "utf8");

describe("G-004A AI tenant scope worker envelope", () => {
  it("declares receipt-gated, lead-authoritative structural scope without granting worker_runs authority", () => {
    expect(sql).toContain("G004A_MATCHING_T028_RECEIPT_REQUIRED");
    expect(sql).toContain("G004A_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED");
    expect(sql).toContain("G004A_USAGE_RUNTIME_CORRELATION_REQUIRED");
    expect(sql).toContain("FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id)");
    expect(sql).toContain("FOREIGN KEY(tenant_id,verification_id) REFERENCES public.ai_lead_verifications(tenant_id,id)");
    expect(sql).toContain("SET search_path=pg_catalog,public");
    expect(sql).toContain("G004A_WRITER_LOCKS_ACQUIRED");
    expect(sql).not.toMatch(/(?:FROM|JOIN|UPDATE|INSERT INTO)\s+public\.worker_runs/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.worker_runs/i);
  });

  it("records the intentionally deferred G-004B boundary", () => {
    expect(sql).toMatch(/G-004B.*runtime correlation.*redaction/i);
    expect(sql).toMatch(/worker_runs.*platform-global/i);
  });
});
