#!/bin/bash
# Creates the least-privilege runtime role used by the backend (backend/src/utils/db.ts).
#
# Runs only on a fresh db-data volume, and only AFTER schema.sql / seed*.sql — the `zz-`
# prefix guarantees the alphabetical ordering that GRANT ... ON ALL TABLES depends on.
# For existing volumes, run the equivalent SQL by hand (see backend/db/README.md).
#
# Deliberately NOT granted: TRUNCATE, any DDL, CREATE on schema, superuser.
set -euo pipefail

: "${APP_DB_USER:?APP_DB_USER must be set}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"

# Values are passed as psql variables, never string-interpolated by the shell, so a
# password containing a quote can't break out into the surrounding SQL. format() applies
# %I identifier quoting and %L literal quoting.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" \
  -v app_password="$APP_DB_PASSWORD" \
  -v db_name="$POSTGRES_DB" <<-'EOSQL'
	SELECT format('CREATE ROLE %I LOGIN', :'app_user')
	WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
	\gexec

	SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
	\gexec

	REVOKE CREATE ON SCHEMA public FROM PUBLIC;

	GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
	GRANT USAGE ON SCHEMA public TO :"app_user";
	GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
	GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

	-- Tables/sequences created later by migrate.js (which connects as this same admin
	-- role) inherit these grants automatically.
	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
EOSQL

echo "Least-privilege role '$APP_DB_USER' created and granted on database '$POSTGRES_DB'."
