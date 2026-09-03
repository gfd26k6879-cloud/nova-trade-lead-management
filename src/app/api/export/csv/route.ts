import { NextResponse, type NextRequest } from "next/server";
import {
  requireTenantPermission,
  TenantAuthorizationError,
} from "@/lib/tenancy/authorize";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
} as const;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    await requireTenantPermission(
      {
        tenantId: params.get("tenantId") ?? undefined,
        workspaceId: params.has("workspaceId") ? params.get("workspaceId") : undefined,
      },
      "data:export",
      {
        action: "data:export",
        policyEvaluator: (context) => ({ allowed: false, context }),
      },
    );

    // F-03 must provide a versioned policy, field mask, and redaction decision
    // before any tenant data can be released from this endpoint.
    return privateJsonError("Permission denied", 403);
  } catch (err) {
    if (err instanceof TenantAuthorizationError) {
      return privateJsonError(
        err.status === 401 ? "Authentication required" : "Permission denied",
        err.status,
      );
    }
    return privateJsonError("CSV export failed.", 500);
  }
}

function privateJsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}
