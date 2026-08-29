import { run as coreworkCreateTask } from './coreworkCreateTask.js'
import type { ExecutorResult } from './coreworkCreateTask.js'

export type { ExecutorResult }

// Despacho por nombre (ACTION_REGISTRY[type].executor) — así cabina.ts
// (EXECUTE_DIRECT) y approvals.ts (POST .../approve) comparten el mismo
// punto de resolución en vez de duplicar un switch en cada sitio.
export const EXECUTORS: Record<string, (payload: Record<string, unknown>) => Promise<ExecutorResult>> = {
  coreworkCreateTask
}
