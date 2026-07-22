type AiBookkeepingContext = {
  operation:
    | "usage_event"
    | "completion_audit"
    | "projection_failure_audit"
    | "queue_audit"
    | "queue_failure_audit";
  leadId: string;
  verificationId?: string;
  artifactId?: string;
  artifactType?: string;
};

export async function runAiPostSuccessBookkeeping(
  context: AiBookkeepingContext,
  task: () => Promise<void>,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error("ai_post_success_bookkeeping_failed", {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
