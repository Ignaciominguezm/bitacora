# Comandos de ejecución — Finanzas #711

`finanzas_user` no tiene DDL, solo DML. Ejecuta estos tres pasos en orden,
con `ignacio_admin`, contra `finanzas_db`.

## 1. Aplicar el esquema

```bash
psql "postgresql://ignacio_admin@<host>/finanzas_db" -f migrations/finanzas/001_finanzas_schema.sql
```

## 2. Seed de ámbitos

```bash
psql "postgresql://ignacio_admin@<host>/finanzas_db" -f migrations/finanzas/002_seed_ambitos.sql
```

## 3. GRANT para finanzas_user

`finanzas_user` necesita `SELECT/INSERT/UPDATE/DELETE` sobre todas las
tablas, `USAGE, SELECT` sobre las sequences (los `SERIAL` las generan
automáticamente por tabla), y `SELECT` sobre la vista
`v_cuentas_saldo_actual` (que no es una tabla — `ALL TABLES IN SCHEMA`
en Postgres SÍ incluye las vistas, pero se deja explícito por claridad).
Ejecutar tras 001 y 002, y de nuevo cada vez que se añada una tabla o
vista nueva en una migración futura:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;
```

Si se prefiere no depender de `ALL TABLES` (más explícito, mismo resultado
sobre el esquema actual):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  schema_migrations, ambitos, cuentas_financieras, revisiones_semanales,
  saldos_semanales, movimientos_previstos, reservas, deudas, saldos_apertura
TO finanzas_user;

GRANT USAGE, SELECT ON
  ambitos_id_seq, cuentas_financieras_id_seq, revisiones_semanales_id_seq,
  saldos_semanales_id_seq, movimientos_previstos_id_seq, reservas_id_seq,
  deudas_id_seq, saldos_apertura_id_seq
TO finanzas_user;

GRANT SELECT ON v_cuentas_saldo_actual TO finanzas_user;
```

Nota: `finanzas_user` no debería tener DELETE/UPDATE sobre `schema_migrations`
en la práctica — la app nunca escribe ahí — pero el GRANT genérico de arriba
se lo concede igualmente al ser `ALL TABLES`. No supone riesgo real (la app
nunca ejecuta ese SQL), pero si prefieres precisión total, usa la segunda
forma explícita y omite `schema_migrations` de la lista.
