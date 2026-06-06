-- Follow-up to 20260606193626_harden_location_access_grants.sql.
-- PostgreSQL default privileges are scoped to the target role. The original
-- migration omitted FOR ROLE, so databases where it already ran need an
-- explicit revoke for the role that creates public tables in this project.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES
  FROM anon, authenticated;
