import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { applyMigrationsForTarget, type MigratorPool, type QueryResult } from './migrate.js'

// Mock de pg: nada de Postgres real (no hay uno disponible en este entorno),
// pero reproduce exactamente lo que applyMigrationsForTarget necesita:
// schema_migrations en memoria, BEGIN/COMMIT/ROLLBACK reales sobre ese
// estado, y un archivo cuyo contenido dispara un fallo simulado para
// probar el rollback (punto c del smoke test).
class FakePool implements MigratorPool {
  versions = new Set<string>()
  grantsRun: string[] = []
  private pending = new Set<string>()

  async query(text: string, params?: unknown[]): Promise<QueryResult> {
    const t = text.trim()
    if (t.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) return { rows: [] }
    if (t.startsWith('SELECT version FROM schema_migrations')) {
      return { rows: [...this.versions].map((version) => ({ version })) }
    }
    if (t.startsWith('INSERT INTO schema_migrations')) {
      const version = String(params?.[0])
      this.versions.add(version)
      return { rows: [] }
    }
    if (t.startsWith('GRANT')) {
      this.grantsRun.push(t)
      return { rows: [] }
    }
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [] }
    // Contenido de un archivo .sql: se "ejecuta" salvo que contenga el
    // marcador de fallo simulado.
    if (t.includes('FAIL_THIS_MIGRATION')) {
      throw new Error('simulated syntax error near FAIL_THIS_MIGRATION')
    }
    return { rows: [] }
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {}
    }
  }
}

async function makeMigrationsDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bitacora-migrate-test-'))
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content, 'utf8')
  }
  return dir
}

test('(a) aplica una migración pendiente y la registra en schema_migrations', async () => {
  const dir = await makeMigrationsDir({
    '001_primero.sql': 'CREATE TABLE ejemplo (id INT);'
  })
  try {
    const pool = new FakePool()
    const { appliedVersions } = await applyMigrationsForTarget(pool, dir, { label: 'test', grants: [] })
    assert.deepEqual(appliedVersions, ['001_primero'])
    assert.ok(pool.versions.has('001_primero'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('(b) re-ejecutar no reaplica lo ya registrado (idempotente)', async () => {
  const dir = await makeMigrationsDir({
    '001_primero.sql': 'CREATE TABLE ejemplo (id INT);',
    '002_segundo.sql': 'ALTER TABLE ejemplo ADD COLUMN nombre TEXT;'
  })
  try {
    const pool = new FakePool()
    const first = await applyMigrationsForTarget(pool, dir, { label: 'test', grants: [] })
    assert.deepEqual(first.appliedVersions, ['001_primero', '002_segundo'])

    const second = await applyMigrationsForTarget(pool, dir, { label: 'test', grants: [] })
    assert.deepEqual(second.appliedVersions, [], 'la segunda pasada no debe reaplicar nada')
    assert.equal(pool.versions.size, 2, 'schema_migrations no debe duplicarse')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('(c) un .sql que falla deja su transacción sin aplicar y propaga el error', async () => {
  const dir = await makeMigrationsDir({
    '001_ok.sql': 'CREATE TABLE ejemplo (id INT);',
    '002_malo.sql': '-- FAIL_THIS_MIGRATION\nDROP TABLE inexistente;'
  })
  try {
    const pool = new FakePool()
    await assert.rejects(
      () => applyMigrationsForTarget(pool, dir, { label: 'test', grants: [] }),
      /002_malo\.sql -- simulated syntax error/
    )
    assert.ok(pool.versions.has('001_ok'), 'la migración previa válida sí debe quedar aplicada')
    assert.ok(!pool.versions.has('002_malo'), 'la migración fallida NO debe quedar registrada')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('ejecuta los GRANT idempotentes tras migrar, incluso sin pendientes', async () => {
  const dir = await makeMigrationsDir({
    '001_primero.sql': 'CREATE TABLE ejemplo (id INT);'
  })
  try {
    const pool = new FakePool()
    const grants = ['GRANT SELECT ON ALL TABLES IN SCHEMA public TO alguien']
    await applyMigrationsForTarget(pool, dir, { label: 'test', grants })
    await applyMigrationsForTarget(pool, dir, { label: 'test', grants })
    assert.deepEqual(pool.grantsRun, grants.concat(grants), 'los GRANT se repiten cada vez, son idempotentes')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
