import { AsyncLocalStorage } from "async_hooks";
import type { AppRole } from "@/lib/permissions";

export interface AuditActor {
  userId: string;
  email: string;
  role: AppRole;
}

const auditActorStorage = new AsyncLocalStorage<AuditActor>();

export function setAuditActor(actor: AuditActor): void {
  auditActorStorage.enterWith(actor);
}

export function getAuditActor(): AuditActor | null {
  return auditActorStorage.getStore() ?? null;
}
