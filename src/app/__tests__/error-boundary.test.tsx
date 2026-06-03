import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/app/error";

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (typeof node === "object" && "props" in node) {
    return collectText((node as { props?: { children?: unknown } }).props?.children);
  }
  return "";
}

describe("global error boundary", () => {
  it("does not render raw backend error messages", () => {
    const error = Object.assign(new Error("Connection closed."), { digest: "digest-123" });
    const element = ErrorBoundary({ error, reset: vi.fn() });
    const text = collectText(element);

    expect(text).toContain("We hit a temporary issue loading this page. Try again in a moment.");
    expect(text).toContain("Error ID:");
    expect(text).toContain("digest-123");
    expect(text).not.toContain("Connection closed.");
  });
});
