import { describe, expect, it } from "vitest";
import { csvEscape } from "@/lib/csv";

describe("CSV export escaping", () => {
  it("escapes spreadsheet formulas", () => {
    expect(csvEscape("=IMPORTXML(\"https://example.com\")")).toBe("\"'=IMPORTXML(\"\"https://example.com\"\")\"");
    expect(csvEscape("+123")).toBe("'+123");
    expect(csvEscape("-123")).toBe("'-123");
    expect(csvEscape("@handle")).toBe("'@handle");
  });

  it("keeps normal CSV escaping behavior", () => {
    expect(csvEscape("Acme, Inc.")).toBe("\"Acme, Inc.\"");
    expect(csvEscape("Acme")).toBe("Acme");
  });
});
