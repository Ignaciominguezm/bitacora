-- Bitácora — bootstrap.sql (#753)
--
-- Crea los dos roles dedicados que usa el runner de migraciones
-- (src/server/migrate.ts / servicio "migrator" en docker-compose.yml):
--   bitacora_migrator  -> DDL + GRANT sobre bitacora_db
--   finanzas_migrator  -> DDL + GRANT sobre finanzas_db
--
-- Los runtime de la app (bitacora_user, finanzas_user) siguen siendo
-- solo-DML: nunca corren con permisos de crear/alterar tablas. Este
-- script NO los toca.
--
-- CÓMO EJECUTARLO (una sola vez, ambas bases están en el mismo
-- postgres-master así que basta una conexión inicial):
--
--   psql "postgresql://ignacio_admin@<host-postgres-master>/bitacora_db" \
--        -v ON_ERROR_STOP=1 -f migrations/bootstrap.sql
--
-- Requiere un rol con privilegios de superusuario, o al menos dueño de
-- ambas bases (ignacio_admin, el mismo que ya se usa a mano según
-- migrations/finanzas/GRANTS.md). Es idempotente: se puede re-ejecutar
-- sin duplicar roles ni romper nada si ya se corrió antes.
--
-- PASSWORDS: este script NO fija contraseña para los roles nuevos (no se
-- versiona un secreto en el repo). Tras ejecutarlo, Ignacio la pone a mano,
-- por rol, interactivamente o con:
--   ALTER ROLE bitacora_migrator WITH PASSWORD '...';
--   ALTER ROLE finanzas_migrator WITH PASSWORD '...';
-- y con esas credenciales arma BITACORA_MIGRATION_DATABASE_URL /
-- FINANZAS_MIGRATION_DATABASE_URL en el .env del VPS (nunca en el compose).

-- ─── bitacora_db ────────────────────────────────────────────────────────
\c bitacora_db

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bitacora_migrator') THEN
    CREATE ROLE bitacora_migrator LOGIN;
  END IF;
END $$;

GRANT bitacora_migrator TO CURRENT_USER;
GRANT ALL PRIVILEGES ON DATABASE bitacora_db TO bitacora_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO bitacora_migrator;

-- Las tablas creadas a mano hasta ahora (chat_history, server_reports, etc.)
-- pasan a ser propiedad de bitacora_migrator, para que pueda hacer GRANT
-- sobre ellas al usuario runtime igual que sobre las que cree en adelante.
REASSIGN OWNED BY CURRENT_USER TO bitacora_migrator;

-- ─── finanzas_db ────────────────────────────────────────────────────────
\c finanzas_db

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'finanzas_migrator') THEN
    CREATE ROLE finanzas_migrator LOGIN;
  END IF;
END $$;

GRANT finanzas_migrator TO CURRENT_USER;
GRANT ALL PRIVILEGES ON DATABASE finanzas_db TO finanzas_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO finanzas_migrator;

REASSIGN OWNED BY CURRENT_USER TO finanzas_migrator;
