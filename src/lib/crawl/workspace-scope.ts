import "server-only";

import { randomUUID } from "node:crypto";

import type { TenantSession } from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { createTenantQueryRepository } from "@/lib/tenancy/queries";

export interface CrawlWorkspaceOption {
  tenantId: string;
  workspaceId: string;
  name: string;
}

export async function listCrawlWorkspaceOptions(
  session: TenantSession,
): Promise<CrawlWorkspaceOption[]> {
  return runWithTenantContext(session, `crawl-workspaces:${randomUUID()}`, () =>
    withTenantDbContext(async (db) => {
      const workspaces = await createTenantQueryRepository(db).listWorkspaces(session.tenantId);
      return workspaces
        .filter((workspace) => workspace.status === "active")
        .map((workspace) => ({
          tenantId: session.tenantId,
          workspaceId: workspace.id,
          name: workspace.name,
        }));
    }));
}
