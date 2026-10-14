#!/bin/bash
# Premier démarrage de Postgres (base vide) : rôles et extensions. Aucune fonction applicative.
#   - app        : propriétaire du schéma de l'application (utilisé par l'API et les migrations)
#   - replicator : réplication vers le standby
set -euo pipefail
APP_PASSWORD=$(cat /run/secrets/pg_app)
REPL_PASSWORD=$(cat /run/secrets/pg_replicator)
psql -v ON_ERROR_STOP=1 --username postgres --dbname presidente <<SQL
CREATE ROLE app LOGIN PASSWORD '${APP_PASSWORD}';
ALTER DATABASE presidente OWNER TO app;
ALTER SCHEMA public OWNER TO app;
CREATE ROLE replicator LOGIN REPLICATION PASSWORD '${REPL_PASSWORD}';
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT pg_create_physical_replication_slot('standby');
SQL
