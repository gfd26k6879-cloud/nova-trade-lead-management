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

/**
 * Runs work with an actor without changing the actor visible to the caller or
 * to concurrent async work. `setAuditActor` remains the compatibility API for
 * the legacy request setup path; new composition boundaries should use this
 * callback-scoped form.
 */
export function runWithAuditActor<T>(actor: AuditActor, callback: () => T): T {
  return auditActorStorage.run(actor, callback);
}

export function getAuditActor(): AuditActor | null {
  return auditActorStorage.getStore() ?? null;
}
