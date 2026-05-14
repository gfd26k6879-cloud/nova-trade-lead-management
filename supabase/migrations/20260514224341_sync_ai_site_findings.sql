UPDATE leads
SET
  website_uri = ai_found_website_url,
  website_status = 'custom',
  qualification_status = 'disqualified',
  disqualification_reason = COALESCE(disqualification_reason, 'AI found existing usable website'),
  score = 0,
  updated_at = now()
WHERE ai_verification_status = 'site_found'
  AND ai_website_viability_status = 'usable'
  AND COALESCE(ai_found_website_url, '') != ''
  AND (
    website_status != 'custom'
    OR website_uri IS DISTINCT FROM ai_found_website_url
    OR qualification_status != 'disqualified'
  );

UPDATE leads
SET
  website_uri = ai_found_website_url,
  website_status = 'basic',
  updated_at = now()
WHERE ai_verification_status = 'weak_site_found'
  AND ai_website_viability_status IN ('broken', 'parked', 'placeholder')
  AND COALESCE(ai_found_website_url, '') != ''
  AND website_status != 'custom'
  AND (
    website_status != 'basic'
    OR website_uri IS DISTINCT FROM ai_found_website_url
  );
