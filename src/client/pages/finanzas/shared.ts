export interface Ambito {
  id: number
  nombre: string
  tipo: string
  orden: number
  color: string
  lleva_contabilidad: boolean
  lleva_fiscalidad: boolean
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return `rgba(200,168,64,${alpha})`
  return `rgba(${r},${g},${b},${alpha})`
}

export function formatSaldo(saldo: string | number | null): string {
  if (saldo === null) return '—'
  const n = typeof saldo === 'number' ? saldo : Number(saldo)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// La semana canónica es siempre el lunes ISO. Mismo criterio que el backend
// (src/server/routes/finanzas.ts normalizeToMonday) — se recalcula aquí solo
// para uso de UI (rango de fechas, navegación); el backend vuelve a
// normalizar cualquier valor recibido, así que un desajuste de reloj local
// nunca corrompe datos, como mucho desalinea la fecha mostrada.
export function mondayOf(date: Date): string {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setDate(date.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatDateEs(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}
