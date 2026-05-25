ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS google_maps_browser_api_key_encrypted text;
