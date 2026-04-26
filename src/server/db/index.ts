import pg from 'pg'

const { Pool } = pg

const createPool = (url: string | undefined) =>
  url ? new Pool({ connectionString: url }) : null

export const bitacoraDb = createPool(process.env.DATABASE_URL)
export const immDb = createPool(process.env.IMM_DB_URL)
export const immReadonlyDb = createPool(process.env.IMM_READONLY_DB_URL)
export const horarioDb = createPool(process.env.HORARIO_DB_URL)
export const tareasDb = createPool(process.env.TAREAS_DB_URL)
export const vacacionesDb = createPool(process.env.VACACIONES_DB_URL)
export const n8nDb = createPool(process.env.N8N_DB_URL)
