import 'dotenv/config'
import pg from 'pg'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg

// #753 — Runner de migraciones. Antes se aplicaban a mano (ver
// migrations/finanzas/GRANTS.md); el 500 de #723 fue justo esa ausencia
// mordiendo (código desplegado esperando una tabla que nadie creó a mano).

export interface QueryResult {
  rows: Array<Record<string, unknown>>
}

export interface QueryableClient {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>
}

export interface MigratorPool extends QueryableClient {
  connect: () => Promise<QueryableClient & { release: () => void }>
}

export interface MigrationTarget {
  label: string
  folder: string
  envVar: string
  runtimeUser: string
  grants: string[]
}

export const TARGETS: MigrationTarget[] = [
  {
    label: 'cabina (bitacora_db)',
    folder: 'cabina',
    envVar: 'BITACORA_MIGRATION_DATABASE_URL',
    runtimeUser: 'bitacora_user',
    grants: [
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bitacora_user',
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bitacora_user'
    ]
  },
  {
    label: 'finanzas (finanzas_db)',
    folder: 'finanzas',
    envVar: 'FINANZAS_MIGRATION_DATABASE_URL',
    runtimeUser: 'finanzas_user',
    grants: [
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_user',
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_user'
    ]
  }
]

function log(label: string, msg: string): void {
  console.log(`[migrate] ${label}: ${msg}`)
}

// Los .sql de cabina ya terminan con su propio INSERT INTO schema_migrations
// ... ON CONFLICT DO NOTHING (se respeta, no se tocan). Los de finanzas
// actuales también lo hacen, pero el runner igualmente registra la version
// él mismo tras aplicar el archivo -- idempotente (ON CONFLICT DO NOTHING),
// así que es un no-op si el .sql ya se registró, y la red de seguridad real
// para cualquier futuro .sql (de cualquiera de las dos carpetas) que no lo
// haga.
export async function applyMigrationsForTarget(
  pool: MigratorPool,
  dir: string,
  target: Pick<MigrationTarget, 'label' | 'grants'>
): Promise<{ appliedVersions: string[] }> {
  const { label, grants } = target

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version     TEXT PRIMARY KEY,
       applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  )

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const { rows } = await pool.query('SELECT version FROM schema_migrations')
  const applied = new Set(rows.map((r) => String(r.version)))

  const appliedVersions: string[] = []

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (applied.has(version)) continue

    const sql = await readFile(path.join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
        [version]
      )
      await client.query('COMMIT')
      appliedVersions.push(version)
      log(label, `aplicada ${version}`)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`${label}: fallo aplicando ${file} -- ${reason}`)
    } finally {
      client.release()
    }
  }

  if (appliedVersions.length === 0) {
    log(label, 'sin pendientes')
  }

  // Idempotentes: arreglan la clase de 500 por permiso denegado (tipo
  // cabina_approvals en #723) tanto si hubo migraciones nuevas como si no --
  // una tabla creada a mano fuera del runner, sin GRANT, también queda cubierta.
  for (const grant of grants) {
    await pool.query(grant)
  }
  log(label, 'permisos runtime verificados')

  return { appliedVersions }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MAX_CONNECT_ATTEMPTS = 10

async function connectWithRetry(url: string, label: string): Promise<InstanceType<typeof Pool>> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    const pool = new Pool({ connectionString: url })
    try {
      await pool.query('SELECT 1')
      log(label, `conectado (intento ${attempt}/${MAX_CONNECT_ATTEMPTS})`)
      return pool
    } catch (err) {
      await pool.end().catch(() => {})
      lastErr = err
      const reason = err instanceof Error ? err.message : String(err)
      if (attempt < MAX_CONNECT_ATTEMPTS) {
        const delayMs = Math.min(500 * 2 ** (attempt - 1), 8000)
        log(label, `intento de conexión ${attempt}/${MAX_CONNECT_ATTEMPTS} fallido (${reason}), reintentando en ${delayMs}ms`)
        await sleep(delayMs)
      }
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`${label}: no se pudo conectar tras ${MAX_CONNECT_ATTEMPTS} intentos -- ${reason}`)
}

function migrationsRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, '..', 'migrations')
}

async function main(): Promise<void> {
  const missing = TARGETS.filter((t) => !process.env[t.envVar])
  if (missing.length > 0) {
    console.error(`[migrate] faltan variables de entorno: ${missing.map((t) => t.envVar).join(', ')}`)
    process.exit(1)
  }

  const root = migrationsRoot()

  try {
    for (const target of TARGETS) {
      const url = process.env[target.envVar]!
      const pool = await connectWithRetry(url, target.label)
      try {
        await applyMigrationsForTarget(pool, path.join(root, target.folder), target)
      } finally {
        await pool.end().catch(() => {})
      }
    }
  } catch (err) {
    console.error(`[migrate] ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  console.log('[migrate] completado -- todas las bases al día')
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
}
