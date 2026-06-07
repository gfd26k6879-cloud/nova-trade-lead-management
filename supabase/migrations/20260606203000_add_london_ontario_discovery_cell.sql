INSERT INTO public.location_markets (id, name, country_code, admin_area1, locality, status)
VALUES ('market-london-ca', 'London, Ontario', 'CA', 'ON', 'London', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  country_code = EXCLUDED.country_code,
  admin_area1 = EXCLUDED.admin_area1,
  locality = EXCLUDED.locality,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.location_cells (
  id, market_id, country_code, admin_area1, locality,
  postal_code, postal_code_normalized, cell_type, cell_label,
  lat, lng, radius_meters, is_active
)
VALUES (
  'cell-ca-london-on-n6h', 'market-london-ca', 'CA', 'ON', 'London',
  'N6H', 'N6H', 'postal_fsa', 'London, ON N6H',
  42.984, -81.292, 3000, 1
)
ON CONFLICT (id) DO UPDATE SET
  market_id = EXCLUDED.market_id,
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
