-- F-04 narrow member mutation boundary for durable upload reservation.
-- The action is default-denied; deployment may grant EXECUTE only to its
-- reviewed restricted server runtime role. Raw document tables stay closed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:f04:document-upload-reservation-action'));

CREATE OR REPLACE FUNCTION public.novatrade_reserve_document_upload(
  p_tenant_id pg_catalog.text,
  p_workspace_id pg_catalog.text,
  p_document_id pg_catalog.text,
  p_version_id pg_catalog.text,
  p_idempotency_key pg_catalog.text,
  p_request_fingerprint pg_catalog.text,
  p_file_name pg_catalog.text,
  p_format pg_catalog.text,
  p_media_type pg_catalog.text,
  p_declared_byte_size pg_catalog.text,
  p_max_bytes pg_catalog.text,
  p_scanner_policy_version pg_catalog.text,
  p_source_identity pg_catalog.text,
  p_object_key pg_catalog.text
)
RETURNS TABLE (
  kind pg_catalog.text,
  tenant_id pg_catalog.uuid,
  workspace_id pg_catalog.uuid,
  document_id pg_catalog.uuid,
  version_id pg_catalog.uuid,
  idempotency_key pg_catalog.text,
  source_identity pg_catalog.text,
  request_fingerprint pg_catalog.text,
  file_name pg_catalog.text,
  format pg_catalog.text,
  media_type pg_catalog.text,
  declared_byte_size pg_catalog.int8,
  max_bytes pg_catalog.int8,
  scanner_policy_version pg_catalog.text,
  object_key pg_catalog.text,
  state pg_catalog.text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  tenant_uuid pg_catalog.uuid;
  workspace_uuid pg_catalog.uuid;
  document_uuid pg_catalog.uuid;
  version_uuid pg_catalog.uuid;
  actor_uuid pg_catalog.uuid;
  membership_uuid pg_catalog.uuid;
  binding_uuid pg_catalog.uuid;
  declared_size pg_catalog.int8;
  maximum_size pg_catalog.int8;
  expected_maximum pg_catalog.int8;
  expected_media pg_catalog.text;
  authorized pg_catalog.bool := false;
BEGIN
  -- Text parameters keep malformed identifiers inside this non-enumerating
  -- boundary instead of exposing pre-function cast errors.
  IF p_tenant_id IS NULL OR p_tenant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_workspace_id IS NULL OR p_workspace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_document_id IS NULL OR p_document_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_version_id IS NULL OR p_version_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_file_name IS NULL OR pg_catalog.char_length(p_file_name) NOT BETWEEN 1 AND 1024
     OR p_file_name ~ '[[:cntrl:]]'
     OR p_format IS NULL OR p_format NOT IN ('pdf','docx','xlsx','csv','txt','markdown','jpeg','png')
     OR p_media_type IS NULL OR pg_catalog.char_length(p_media_type) NOT BETWEEN 3 AND 255
     OR p_declared_byte_size IS NULL OR p_declared_byte_size !~ '^[1-9][0-9]{0,15}$'
     OR p_max_bytes IS NULL OR p_max_bytes !~ '^[1-9][0-9]{0,15}$'
     OR p_scanner_policy_version IS NULL OR p_scanner_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  THEN
    RETURN;
  END IF;

  tenant_uuid := p_tenant_id::pg_catalog.uuid;
  workspace_uuid := p_workspace_id::pg_catalog.uuid;
  document_uuid := p_document_id::pg_catalog.uuid;
  version_uuid := p_version_id::pg_catalog.uuid;
  declared_size := p_declared_byte_size::pg_catalog.int8;
  maximum_size := p_max_bytes::pg_catalog.int8;

  expected_media := CASE p_format
    WHEN 'pdf' THEN 'application/pdf'
    WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    WHEN 'csv' THEN 'text/csv'
    WHEN 'txt' THEN 'text/plain'
    WHEN 'markdown' THEN 'text/markdown'
    WHEN 'jpeg' THEN 'image/jpeg'
    WHEN 'png' THEN 'image/png'
  END;
  expected_maximum := CASE WHEN p_format IN ('jpeg','png') THEN 20971520 ELSE 52428800 END;

  IF p_media_type <> expected_media
     OR maximum_size <> expected_maximum
     OR declared_size > maximum_size
     OR (p_format='pdf' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.pdf$')
     OR (p_format='docx' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.docx$')
     OR (p_format='xlsx' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.xlsx$')
     OR (p_format='csv' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.csv$')
     OR (p_format='txt' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.txt$')
     OR (p_format='markdown' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.(md|markdown)$')
     OR (p_format='jpeg' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.(jpg|jpeg)$')
     OR (p_format='png' AND pg_catalog.lower(pg_catalog.btrim(p_file_name)) !~ '\.png$')
     OR p_source_identity IS DISTINCT FROM 'tenant_upload:' || document_uuid::pg_catalog.text
     OR p_object_key IS DISTINCT FROM 'tenants/' || tenant_uuid::pg_catalog.text || '/documents/' ||
        document_uuid::pg_catalog.text || '/versions/' || version_uuid::pg_catalog.text || '/original'
  THEN
    RETURN;
  END IF;

  IF NULLIF(pg_catalog.current_setting('app.tenant_id',true),'') IS DISTINCT FROM tenant_uuid::pg_catalog.text
     OR NULLIF(pg_catalog.current_setting('app.workspace_id',true),'') IS DISTINCT FROM workspace_uuid::pg_catalog.text
     OR NULLIF(pg_catalog.current_setting('app.actor_id',true),'') IS NULL
     OR NULLIF(pg_catalog.current_setting('app.membership_id',true),'') IS NULL
     OR NULLIF(pg_catalog.current_setting('app.role_binding_id',true),'') IS NULL
     OR NULLIF(pg_catalog.current_setting('app.role',true),'') IS NULL
     OR NULLIF(pg_catalog.current_setting('app.correlation_id',true),'') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
  THEN
    RETURN;
  END IF;

  BEGIN
    actor_uuid := pg_catalog.current_setting('app.actor_id',true)::pg_catalog.uuid;
    membership_uuid := pg_catalog.current_setting('app.membership_id',true)::pg_catalog.uuid;
    binding_uuid := pg_catalog.current_setting('app.role_binding_id',true)::pg_catalog.uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;

  -- Hold shared row locks through the mutation so suspension/revocation and
  -- reservation creation have one database serialization order.
  SELECT true INTO authorized
  FROM public.tenants AS tenant
  JOIN public.workspaces AS workspace
    ON workspace.tenant_id=tenant.id AND workspace.id=workspace_uuid AND workspace.status='active'
  JOIN public.tenant_memberships AS membership
    ON membership.tenant_id=tenant.id AND membership.id=membership_uuid
   AND membership.auth_identity_id=actor_uuid AND membership.pending_identity_ref_hash IS NULL
   AND membership.status='active'
   AND (membership.workspace_id IS NULL OR membership.workspace_id=workspace_uuid)
  JOIN public.tenant_role_bindings AS binding
    ON binding.tenant_id=tenant.id AND binding.id=binding_uuid AND binding.membership_id=membership.id
   AND binding.role=pg_catalog.current_setting('app.role',true)
   -- Researcher is conditional for knowledge:upload in D-002. This definer
   -- boundary has no durable conditional-policy proof, so it must deny that
   -- role even if the application evaluated a policy immediately beforehand.
   AND binding.role IN ('owner','admin','strategist_manager')
   AND binding.valid_from<=pg_catalog.statement_timestamp() AND binding.revoked_at IS NULL
  WHERE tenant.id=tenant_uuid AND tenant.status='active'
  FOR SHARE OF tenant,workspace,membership,binding;
  IF authorized IS DISTINCT FROM true THEN RETURN; END IF;

  -- Linearize all first-write and replay decisions for this tenant-local key.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(tenant_uuid::pg_catalog.text || ':' || p_idempotency_key, 0)
  );

  IF EXISTS (SELECT 1 FROM public.document_upload_reservations AS reservation
    WHERE reservation.tenant_id=tenant_uuid AND reservation.idempotency_key=p_idempotency_key) THEN
    RETURN QUERY
    SELECT 'replay'::pg_catalog.text, document.tenant_id, document.workspace_id, document.id, version.id,
      reservation.idempotency_key, document.source_identity, reservation.request_fingerprint,
      version.original_name, version.format, version.media_type, version.declared_byte_size,
      version.max_bytes, version.scanner_policy_version, version.object_key, version.status
    FROM public.document_upload_reservations AS reservation
    JOIN public.documents AS document
      ON document.tenant_id=reservation.tenant_id AND document.workspace_id=reservation.workspace_id
     AND document.id=reservation.document_id
    JOIN public.document_versions AS version
      ON version.tenant_id=reservation.tenant_id AND version.workspace_id=reservation.workspace_id
     AND version.document_id=reservation.document_id AND version.id=reservation.version_id
    WHERE reservation.tenant_id=tenant_uuid AND reservation.idempotency_key=p_idempotency_key
      AND document.workspace_id=workspace_uuid AND document.id=document_uuid AND version.id=version_uuid
      AND reservation.request_fingerprint=p_request_fingerprint
      AND document.source_identity=p_source_identity AND reservation.object_key=p_object_key
      AND version.original_name=p_file_name AND version.format=p_format AND version.media_type=p_media_type
      AND version.declared_byte_size=declared_size AND version.max_bytes=maximum_size
      AND version.scanner_policy_version=p_scanner_policy_version AND version.status='upload_reserved';
    IF FOUND THEN RETURN; END IF;

    RETURN QUERY SELECT 'conflict'::pg_catalog.text, NULL::pg_catalog.uuid, NULL::pg_catalog.uuid,
      NULL::pg_catalog.uuid, NULL::pg_catalog.uuid, NULL::pg_catalog.text, NULL::pg_catalog.text,
      NULL::pg_catalog.text, NULL::pg_catalog.text, NULL::pg_catalog.text, NULL::pg_catalog.text,
      NULL::pg_catalog.int8, NULL::pg_catalog.int8, NULL::pg_catalog.text, NULL::pg_catalog.text,
      NULL::pg_catalog.text;
    RETURN;
  END IF;

  INSERT INTO public.documents(id,tenant_id,workspace_id,source_kind,source_identity)
  VALUES (document_uuid,tenant_uuid,workspace_uuid,'tenant_upload',p_source_identity);
  INSERT INTO public.document_versions(id,tenant_id,workspace_id,document_id,original_name,format,media_type,
    declared_byte_size,max_bytes,scanner_policy_version,object_key)
  VALUES (version_uuid,tenant_uuid,workspace_uuid,document_uuid,p_file_name,p_format,p_media_type,
    declared_size,maximum_size,p_scanner_policy_version,p_object_key);
  INSERT INTO public.document_upload_reservations(
    id,tenant_id,workspace_id,document_id,version_id,idempotency_key,request_fingerprint,object_key)
  VALUES (pg_catalog.gen_random_uuid(),tenant_uuid,workspace_uuid,document_uuid,version_uuid,
    p_idempotency_key,p_request_fingerprint,p_object_key);

  RETURN QUERY SELECT 'created'::pg_catalog.text, document.tenant_id, document.workspace_id, document.id,
    version.id, reservation.idempotency_key, document.source_identity, reservation.request_fingerprint,
    version.original_name, version.format, version.media_type, version.declared_byte_size,
    version.max_bytes, version.scanner_policy_version, version.object_key, version.status
  FROM public.document_upload_reservations AS reservation
  JOIN public.documents AS document
    ON document.tenant_id=reservation.tenant_id AND document.workspace_id=reservation.workspace_id
   AND document.id=reservation.document_id
  JOIN public.document_versions AS version
    ON version.tenant_id=reservation.tenant_id AND version.workspace_id=reservation.workspace_id
   AND version.document_id=reservation.document_id AND version.id=reservation.version_id
  WHERE reservation.tenant_id=tenant_uuid AND reservation.idempotency_key=p_idempotency_key;
END;
$function$;

COMMENT ON FUNCTION public.novatrade_reserve_document_upload(
  pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
  pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
  pg_catalog.text,pg_catalog.text
) IS 'F-04 default-denied atomic member upload reservation action; exact replay returns stored facts and conflicting reuse mutates nothing.';

REVOKE ALL ON FUNCTION public.novatrade_reserve_document_upload(
  pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
  pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
  pg_catalog.text,pg_catalog.text
) FROM PUBLIC;
DO $security$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.novatrade_reserve_document_upload(
      pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
      pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
      pg_catalog.text,pg_catalog.text
    ) FROM anon;
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.novatrade_reserve_document_upload(
      pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
      pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,
      pg_catalog.text,pg_catalog.text
    ) FROM authenticated;
  END IF;
END;
$security$;

COMMIT;
