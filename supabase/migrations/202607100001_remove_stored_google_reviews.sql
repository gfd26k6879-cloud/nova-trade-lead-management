-- NoSite derives aggregate review insights in memory, but it must not persist
-- Google review bodies or author attribution in raw Place Details payloads.
-- Historical raw payloads are expected to have `reviews` at the top level,
-- but redact the key recursively so nested legacy shapes cannot survive.

CREATE OR REPLACE FUNCTION public.nosite_strip_google_reviews(value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN COALESCE(
      (
        SELECT jsonb_object_agg(entry.key, public.nosite_strip_google_reviews(entry.value))
        FROM jsonb_each(value) AS entry(key, value)
        WHERE lower(entry.key) <> 'reviews'
      ),
      '{}'::jsonb
    )
    WHEN 'array' THEN COALESCE(
      (
        SELECT jsonb_agg(public.nosite_strip_google_reviews(element.value))
        FROM jsonb_array_elements(value) AS element(value)
      ),
      '[]'::jsonb
    )
    ELSE value
  END;
$$;

UPDATE public.place_cache
SET raw_json = public.nosite_strip_google_reviews(raw_json)
WHERE raw_json::text ILIKE '%"reviews"%';

UPDATE public.place_observations
SET raw_json = public.nosite_strip_google_reviews(raw_json)
WHERE raw_json::text ILIKE '%"reviews"%';

DROP FUNCTION public.nosite_strip_google_reviews(jsonb);
