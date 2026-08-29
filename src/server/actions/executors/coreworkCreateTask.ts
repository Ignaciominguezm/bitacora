import { ACTION_REGISTRY } from '../registry.js'

export interface ExecutorResult {
  ok: boolean
  executionMode: 'dry_run' | 'real'
  result?: unknown
  error?: string
}

// DRY-RUN (Encargo 1 / #723-MVP): nunca escribe en CoreWork ni en ninguna
// BD — ni siquiera en cabina_approvals (eso lo hace quien llama, no este
// módulo). Solo valida el payload contra el registry y devuelve una
// simulación explícita de lo que haría.
//
// TODO (Encargo 2): sustituir el bloque marcado abajo por la llamada real a
// CoreWork. Hoy Bitácora no tiene ningún cliente de escritura hacia
// CoreWork — solo lectura vía tareasDb (ver src/server/routes/tasks.ts,
// GET /tasks/urgent) — así que esa puerta queda por decidir (¿INSERT
// directo contra tareasDb, o HTTP a un servicio de CoreWork que hoy no
// existe en este repo?) en el propio Encargo 2, no aquí.
export async function run(payload: Record<string, unknown>): Promise<ExecutorResult> {
  const entry = ACTION_REGISTRY['corework.create_task']
  const validation = entry.validatePayload(payload)
  if (!validation.ok) {
    return { ok: false, executionMode: 'dry_run', error: validation.errors.join('; ') }
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : payload.title

  // --- inicio bloque a sustituir en Encargo 2 por la llamada/INSERT real ---
  return {
    ok: true,
    executionMode: 'dry_run',
    result: { dryRun: true, wouldDo: { ...payload, title } }
  }
  // --- fin bloque dry-run ---
}
