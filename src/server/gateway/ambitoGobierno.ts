import type { AgentContext, Ambito } from './types.js'

// No existe ninguna fuente canónica de este mapa en el repo (sin
// taxonomia.yml/registro.yml — búsqueda completa sin resultados). Mapa
// estático mínimo viable: son solo 3 ámbitos, fijos en Ambito (types.ts), y
// cualquier cambio real de taxonomía ya requiere tocar código en varios
// sitios (AMBITOS en cabina.ts, AMBITO_LABEL en labels.ts). Si en el futuro
// aparece un registro real, este mapa debería leer de ahí en vez de estar
// fijo aquí.
const DOMINIOS_POR_AMBITO: Record<Ambito, string[]> = {
  clientes: ['clientes'],
  proyectos_personales: ['viriatech', 'personal', 'operativa', 'decisiones'],
  ocio: ['narrativa']
}

// Bloque de gobierno de contexto — primer bloque del context pack (ver
// contextPack.ts). Dice qué dominios de conocimiento son válidos para el
// ámbito activo de esta sesión de Cabina, y cómo debe recuperarlos Unria
// (recuperador determinista vía recuperar.sh, no búsqueda semántica cruda).
export function buildGobiernoBlock(context: AgentContext): string {
  const dominios = DOMINIOS_POR_AMBITO[context.ambito]
  if (!dominios?.length) {
    throw new Error(`Ambito sin dominios permitidos: ${context.ambito}`)
  }
  return [
    '[BLOQUE: GOBIERNO_CONTEXTO]',
    `ambito_activo=${context.ambito}`,
    `dominios_permitidos=${dominios.join(',')}`,
    'regla=Para recuperar fichas de conocimiento, usa la skill "conocimiento" y el recuperador determinista.',
    'regla=Invoca recuperar.sh con --ambito igual a ambito_activo y --dominios igual a dominios_permitidos; no uses busqueda semantica cruda para fichas de conocimiento soberano.',
    'regla=No incluyas fichas fuera de dominios_permitidos ni marcadas no_incorporar.',
    '[/BLOQUE: GOBIERNO_CONTEXTO]'
  ].join('\n')
}
