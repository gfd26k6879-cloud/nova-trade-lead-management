-- Keep location/territory tables private to the server-side app role.
-- These were added after the original broad auth-role revoke migration, so
-- explicitly remove client-role grants as defense in depth.

REVOKE ALL ON TABLE
  public.location_markets,
  public.location_cells,
  public.user_market_access
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM anon, authenticated;
