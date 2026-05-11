import { getDb } from "@/lib/db/index";

export type DensityLabel = "Low" | "Medium" | "High" | "Very High";

export interface DensityResult {
  count: number;
  label: DensityLabel;
}

export async function computeDensity(zip: string, primaryType: string | null): Promise<DensityResult> {
  if (!primaryType) return { count: 0, label: "Low" };

  const db = await getDb();
  const row = await db.prepare(
    `SELECT COUNT(*) as count FROM leads
     WHERE address LIKE ? AND primary_type = ?`
  ).get(`%${zip}%`, primaryType) as { count: number };

  return { count: row.count, label: densityLabel(row.count) };
}

export async function computeDensityByAddress(address: string | null, primaryType: string | null): Promise<DensityResult> {
  if (!address || !primaryType) return { count: 0, label: "Low" };

  const zip = extractZip(address);
  if (!zip) return { count: 0, label: "Low" };

  return computeDensity(zip, primaryType);
}

function densityLabel(count: number): DensityLabel {
  if (count > 15) return "Very High";
  if (count > 8) return "High";
  if (count > 3) return "Medium";
  return "Low";
}

function extractZip(address: string): string | null {
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

export async function getDensityStats(): Promise<Array<{ zip: string; primary_type: string; count: number; label: DensityLabel }>> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT SUBSTR(address, -10) as addr_tail, primary_type, COUNT(*) as count
     FROM leads
     WHERE primary_type IS NOT NULL AND address IS NOT NULL
     GROUP BY primary_type, addr_tail
     HAVING COUNT(*) > 1
     ORDER BY count DESC
     LIMIT 100`
  ).all() as Array<{ addr_tail: string; primary_type: string; count: number }>;

  return rows.map((r) => {
    const zipMatch = r.addr_tail.match(/\b(\d{5})\b/);
    return {
      zip: zipMatch ? zipMatch[1] : r.addr_tail,
      primary_type: r.primary_type,
      count: r.count,
      label: densityLabel(r.count),
    };
  });
}
