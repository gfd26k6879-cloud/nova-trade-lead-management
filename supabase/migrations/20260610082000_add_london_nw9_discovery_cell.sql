INSERT INTO public.location_cells (
  id, market_id, country_code, admin_area1, locality,
  postal_code, postal_code_normalized, cell_type, cell_label,
  lat, lng, radius_meters, is_active
) VALUES (
  'cell-gb-london-nw9',
  'market-london-gb',
  'GB',
  'England',
  'London',
  'NW9',
  'NW9',
  'postcode_outward',
  'London NW9',
  51.586,
  -0.257,
  2500,
  1
)
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
