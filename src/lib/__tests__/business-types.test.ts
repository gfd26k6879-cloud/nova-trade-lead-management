import { describe, expect, it } from "vitest";
import { classifyBusinessType } from "@/lib/business-types";
import { backfillLeadBusinessTypes, type DbClient } from "@/lib/db/index";
import { createTestDb } from "./test-helpers";

describe("business type classifier", () => {
  it("maps specific Google types into canonical business types", async () => {
    expect(classifyBusinessType({ primaryType: "dentist", categories: ["health", "service"] })).toBe("dental");
    expect(classifyBusinessType({ primaryType: "plumber", categories: ["service"] })).toBe("plumbing");
    expect(classifyBusinessType({ primaryType: "hvac_contractor", categories: ["general_contractor"] })).toBe("hvac");
    expect(classifyBusinessType({ primaryType: "roofing_contractor", categories: ["contractor"] })).toBe("roofing");
    expect(classifyBusinessType({ primaryType: "service", categories: ["point_of_interest"] })).toBe("local_services");
  });

  it("backfills missing and generic business types without overwriting specific values", async () => {
    const db = createTestDb();
    try {
      db.prepare(
        `INSERT INTO leads (id, place_id, primary_type, categories, business_type)
         VALUES (?, ?, ?, ?, ?)`
      ).run("lead-1", "place-1", "plumber", JSON.stringify(["service"]), null);
      db.prepare(
        `INSERT INTO leads (id, place_id, primary_type, categories, business_type)
         VALUES (?, ?, ?, ?, ?)`
      ).run("lead-2", "place-2", "dentist", JSON.stringify(["health"]), "local_services");
      db.prepare(
        `INSERT INTO leads (id, place_id, primary_type, categories, business_type)
         VALUES (?, ?, ?, ?, ?)`
      ).run("lead-3", "place-3", "dentist", JSON.stringify(["health"]), "legal");

      await backfillLeadBusinessTypes(db as unknown as DbClient);

      const rows = db.prepare("SELECT id, business_type FROM leads ORDER BY id").all() as Array<{ id: string; business_type: string }>;
      expect(rows).toEqual([
        { id: "lead-1", business_type: "plumbing" },
        { id: "lead-2", business_type: "dental" },
        { id: "lead-3", business_type: "legal" },
      ]);
    } finally {
      db.close();
    }
  });
});
