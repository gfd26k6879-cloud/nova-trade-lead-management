export class TenantPolicySettingsUnavailableError extends Error {
  readonly code = "TENANT_POLICY_SETTINGS_UNAVAILABLE" as const;

  constructor() {
    super("Tenant policy settings are unavailable.");
    this.name = "TenantPolicySettingsUnavailableError";
  }
}
