CREATE TABLE IF NOT EXISTS public.location_markets (
  id text PRIMARY KEY,
  name text NOT NULL,
  country_code text NOT NULL,
  admin_area1 text,
  admin_area2 text,
  locality text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.location_cells (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES public.location_markets(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  admin_area1 text,
  admin_area2 text,
  locality text,
  postal_code text,
  postal_code_normalized text,
  cell_type text NOT NULL,
  cell_label text NOT NULL,
  lat double precision,
  lng double precision,
  radius_meters integer,
  is_active integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_market_access (
  user_id text NOT NULL,
  market_id text NOT NULL REFERENCES public.location_markets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id text,
  PRIMARY KEY (user_id, market_id)
);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS market_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS location_cell_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS admin_area1 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS admin_area2 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS locality text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS postal_code text;

ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS market_id text;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS location_cell_id text;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS query_location_label text;

ALTER TABLE public.crawl_runs ADD COLUMN IF NOT EXISTS market_id text;
ALTER TABLE public.crawl_runs ADD COLUMN IF NOT EXISTS selection_json jsonb;

CREATE INDEX IF NOT EXISTS idx_location_markets_country_status ON public.location_markets(country_code, status, name);
CREATE INDEX IF NOT EXISTS idx_location_cells_market_active ON public.location_cells(market_id, is_active, cell_type);
CREATE INDEX IF NOT EXISTS idx_location_cells_country_postal ON public.location_cells(country_code, postal_code_normalized);
CREATE INDEX IF NOT EXISTS idx_user_market_access_user ON public.user_market_access(user_id, market_id);
CREATE INDEX IF NOT EXISTS idx_user_market_access_market ON public.user_market_access(market_id, user_id);
CREATE INDEX IF NOT EXISTS idx_leads_market_active ON public.leads(market_id, archived_at, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_location_cell ON public.leads(location_cell_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_country_admin ON public.leads(country_code, admin_area1, locality);
CREATE INDEX IF NOT EXISTS idx_crawl_units_market_status ON public.crawl_units(market_id, status, category);
CREATE INDEX IF NOT EXISTS idx_crawl_units_cell_status ON public.crawl_units(location_cell_id, status, category);

INSERT INTO public.location_markets (id, name, country_code, admin_area1, status)
VALUES ('market-colorado', 'Colorado', 'US', 'CO', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  country_code = EXCLUDED.country_code,
  admin_area1 = EXCLUDED.admin_area1,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.location_markets (id, name, country_code, admin_area1, locality, status)
VALUES
  ('market-toronto', 'Toronto', 'CA', 'ON', 'Toronto', 'active'),
  ('market-vancouver', 'Vancouver', 'CA', 'BC', 'Vancouver', 'active'),
  ('market-london-gb', 'London', 'GB', 'England', 'London', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  country_code = EXCLUDED.country_code,
  admin_area1 = EXCLUDED.admin_area1,
  locality = EXCLUDED.locality,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.location_cells (
  id, market_id, country_code, admin_area1, locality,
  postal_code, postal_code_normalized, cell_type, cell_label, lat, lng, radius_meters, is_active
)
VALUES
  ('cell-ca-toronto-m5v', 'market-toronto', 'CA', 'ON', 'Toronto', 'M5V', 'M5V', 'postal_fsa', 'Toronto, ON M5V', 43.644, -79.389, 3000, 1),
  ('cell-ca-toronto-m4w', 'market-toronto', 'CA', 'ON', 'Toronto', 'M4W', 'M4W', 'postal_fsa', 'Toronto, ON M4W', 43.679, -79.384, 3000, 1),
  ('cell-ca-toronto-m6j', 'market-toronto', 'CA', 'ON', 'Toronto', 'M6J', 'M6J', 'postal_fsa', 'Toronto, ON M6J', 43.647, -79.419, 3000, 1),
  ('cell-ca-vancouver-v6b', 'market-vancouver', 'CA', 'BC', 'Vancouver', 'V6B', 'V6B', 'postal_fsa', 'Vancouver, BC V6B', 49.279, -123.114, 3000, 1),
  ('cell-ca-vancouver-v5k', 'market-vancouver', 'CA', 'BC', 'Vancouver', 'V5K', 'V5K', 'postal_fsa', 'Vancouver, BC V5K', 49.281, -123.041, 3000, 1),
  ('cell-ca-vancouver-v6e', 'market-vancouver', 'CA', 'BC', 'Vancouver', 'V6E', 'V6E', 'postal_fsa', 'Vancouver, BC V6E', 49.287, -123.126, 3000, 1),
  ('cell-gb-london-sw1a', 'market-london-gb', 'GB', 'England', 'London', 'SW1A', 'SW1A', 'postcode_outward', 'London SW1A', 51.501, -0.142, 2500, 1),
  ('cell-gb-london-ec1', 'market-london-gb', 'GB', 'England', 'London', 'EC1', 'EC1', 'postcode_outward', 'London EC1', 51.523, -0.101, 2500, 1),
  ('cell-gb-london-w1', 'market-london-gb', 'GB', 'England', 'London', 'W1', 'W1', 'postcode_outward', 'London W1', 51.514, -0.143, 2500, 1)
ON CONFLICT (id) DO UPDATE SET
  country_code = EXCLUDED.country_code,
  admin_area1 = EXCLUDED.admin_area1,
  locality = EXCLUDED.locality,
  postal_code = EXCLUDED.postal_code,
  postal_code_normalized = EXCLUDED.postal_code_normalized,
  cell_type = EXCLUDED.cell_type,
  cell_label = EXCLUDED.cell_label,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  radius_meters = EXCLUDED.radius_meters,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.location_cells (
  id, market_id, country_code, admin_area1, admin_area2, locality,
  postal_code, postal_code_normalized, cell_type, cell_label, lat, lng, is_active
)
SELECT
  'cell-us-co-' || z.zip,
  'market-colorado',
  'US',
  z.state,
  z.county,
  z.city,
  z.zip,
  z.zip,
  'zip',
  trim(concat(z.city, ' ', z.state, ' ', z.zip)),
  z.lat,
  z.lng,
  z.is_active
FROM public.zip_codes z
WHERE z.is_active = 1
ON CONFLICT (id) DO UPDATE SET
  admin_area2 = EXCLUDED.admin_area2,
  locality = EXCLUDED.locality,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  is_active = EXCLUDED.is_active,
  updated_at = now();

UPDATE public.leads l
SET country_code = COALESCE(l.country_code, 'US'),
    admin_area1 = COALESCE(l.admin_area1, 'CO'),
    market_id = COALESCE(l.market_id, 'market-colorado'),
    postal_code = COALESCE(l.postal_code, z.zip),
    location_cell_id = COALESCE(l.location_cell_id, lc.id),
    locality = COALESCE(l.locality, z.city),
    admin_area2 = COALESCE(l.admin_area2, z.county)
FROM public.zip_codes z
LEFT JOIN public.location_cells lc ON lc.id = 'cell-us-co-' || z.zip
WHERE (l.address ILIKE '%' || z.zip || '%' OR l.postal_code = z.zip)
  AND (l.market_id IS NULL OR l.location_cell_id IS NULL OR l.country_code IS NULL);

UPDATE public.leads
SET country_code = COALESCE(country_code, 'US'),
    admin_area1 = COALESCE(admin_area1, 'CO'),
    market_id = COALESCE(market_id, 'market-colorado')
WHERE market_id IS NULL OR country_code IS NULL;

UPDATE public.crawl_units cu
SET market_id = COALESCE(cu.market_id, 'market-colorado'),
    location_cell_id = COALESCE(cu.location_cell_id, 'cell-us-co-' || cu.zip),
    country_code = COALESCE(cu.country_code, 'US'),
    query_location_label = COALESCE(cu.query_location_label, trim(concat(z.city, ', ', z.state, ' ', z.zip, ', United States')))
FROM public.zip_codes z
WHERE cu.zip = z.zip
  AND (cu.market_id IS NULL OR cu.location_cell_id IS NULL OR cu.country_code IS NULL OR cu.query_location_label IS NULL);

UPDATE public.crawl_runs
SET market_id = COALESCE(market_id, 'market-colorado'),
    selection_json = COALESCE(selection_json, jsonb_build_object('countryCode', 'US', 'marketId', 'market-colorado', 'source', 'legacy_colorado'))
WHERE market_id IS NULL;

INSERT INTO public.user_market_access (user_id, market_id, created_by_user_id)
SELECT au.user_id, 'market-colorado', NULL
FROM public.app_users au
WHERE au.role = 'researcher' AND au.status = 'active'
ON CONFLICT (user_id, market_id) DO NOTHING;

ALTER TABLE public.location_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_market_access ENABLE ROW LEVEL SECURITY;
