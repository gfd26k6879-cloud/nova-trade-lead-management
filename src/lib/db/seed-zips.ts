import { getDb } from "./index";
import coloradoZips from "@/data/colorado-zips.json";

type ZipSeedRow = {
  zip: string;
  city: string;
  state: string;
  county?: string;
  lat: number | null;
  lng: number | null;
};

const CITY_TO_COUNTY: Record<string, string> = {
  Arvada: "Jefferson",
  Aurora: "Arapahoe",
  Berthoud: "Larimer",
  Basalt: "Eagle",
  Boulder: "Boulder",
  Brighton: "Adams",
  Broomfield: "Broomfield",
  "Castle Rock": "Douglas",
  Carbondale: "Garfield",
  Clifton: "Mesa",
  "Colorado Springs": "El Paso",
  "Commerce City": "Adams",
  Denver: "Denver",
  Eagle: "Eagle",
  Edwards: "Eagle",
  Englewood: "Arapahoe",
  Erie: "Weld",
  Evergreen: "Jefferson",
  Fountain: "El Paso",
  Franktown: "Douglas",
  Frederick: "Weld",
  Fruita: "Mesa",
  "Fort Collins": "Larimer",
  "Fort Morgan": "Morgan",
  "Glenwood Springs": "Garfield",
  Golden: "Jefferson",
  Greeley: "Weld",
  Henderson: "Adams",
  "Highlands Ranch": "Douglas",
  Hudson: "Weld",
  Johnstown: "Weld",
  Lafayette: "Boulder",
  "Lone Tree": "Douglas",
  Longmont: "Boulder",
  Louisville: "Boulder",
  Loveland: "Larimer",
  Monument: "El Paso",
  Morrison: "Jefferson",
  "Palmer Lake": "El Paso",
  Parker: "Douglas",
  Peyton: "El Paso",
  Pueblo: "Pueblo",
  Sedalia: "Douglas",
  Sterling: "Logan",
  Thornton: "Adams",
  Timnath: "Larimer",
  Vail: "Eagle",
  Avon: "Eagle",
  Aspen: "Pitkin",
  "USAF Academy": "El Paso",
  Westminster: "Adams",
  Windsor: "Weld",
  "Wheat Ridge": "Jefferson",
  "Woodland Park": "Teller",
  "Grand Junction": "Mesa",
  Littleton: "Arapahoe",
};

const ZIP_TO_COUNTY_OVERRIDES: Record<string, string> = {
  "80011": "Adams",
  "80018": "Adams",
  "80019": "Adams",
  "80045": "Adams",
  "80123": "Jefferson",
  "80125": "Jefferson",
  "80127": "Jefferson",
  "80128": "Jefferson",
  "80504": "Weld",
  "80603": "Weld",
};

function resolveCounty(z: ZipSeedRow): string {
  if (z.county && z.county.trim().length > 0) return z.county.trim();
  const byZip = ZIP_TO_COUNTY_OVERRIDES[z.zip];
  if (byZip) return byZip;
  const byCity = CITY_TO_COUNTY[z.city];
  if (byCity) return byCity;
  return "Unknown";
}

export async function seedZipCodes(): Promise<{ inserted: number; total: number }> {
  const db = await getDb();
  const existing = await db.prepare("SELECT COUNT(*) as count FROM zip_codes").get<{ count: number }>() as { count: number };

  const dedupedByZip = new Map<string, ZipSeedRow>();
  for (const row of coloradoZips as ZipSeedRow[]) {
    dedupedByZip.set(row.zip, row);
  }
  const rows = Array.from(dedupedByZip.values());

  const upsert = db.prepare(
    `INSERT INTO zip_codes (zip, city, state, county, lat, lng, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(zip) DO UPDATE SET
       city = excluded.city,
       state = excluded.state,
       county = CASE
         WHEN zip_codes.county IS NULL OR TRIM(zip_codes.county) = '' OR zip_codes.county = 'Unknown'
           THEN excluded.county
         ELSE zip_codes.county
       END,
       lat = COALESCE(excluded.lat, zip_codes.lat),
       lng = COALESCE(excluded.lng, zip_codes.lng)`
  );

  for (const z of rows) {
    await upsert.run(z.zip, z.city, z.state, resolveCounty(z), z.lat, z.lng);
  }

  const total = ((await db.prepare("SELECT COUNT(*) as count FROM zip_codes").get<{ count: number }>()) as { count: number }).count;
  const inserted = Math.max(0, total - existing.count);
  return { inserted, total };
}
