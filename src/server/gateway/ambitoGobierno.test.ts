import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGobiernoBlock } from './ambitoGobierno.js'
import type { AgentContext } from './types.js'

// No hay framework de test instalado en el repo (sin vitest/jest/mocha en
// package.json) — se usa node:test, nativo desde Node 18+, sin añadir
// dependencias nuevas. Se ejecuta con:
//   node --import tsx --test src/server/gateway/ambitoGobierno.test.ts

function ctx(ambito: AgentContext['ambito']): AgentContext {
  return { ambito, modo: 'diseno' }
}

test('clientes -> ambito_activo=clientes, dominios_permitidos=clientes', () => {
  const block = buildGobiernoBlock(ctx('clientes'))
  assert.match(block, /^ambito_activo=clientes$/m)
  assert.match(block, /^dominios_permitidos=clientes$/m)
})

test('proyectos_personales -> dominios_permitidos=viriatech,personal,operativa,decisiones', () => {
  const block = buildGobiernoBlock(ctx('proyectos_personales'))
  assert.match(block, /^ambito_activo=proyectos_personales$/m)
  assert.match(block, /^dominios_permitidos=viriatech,personal,operativa,decisiones$/m)
})

test('ocio -> dominios_permitidos=narrativa', () => {
  const block = buildGobiernoBlock(ctx('ocio'))
  assert.match(block, /^ambito_activo=ocio$/m)
  assert.match(block, /^dominios_permitidos=narrativa$/m)
})

test('el bloque empieza con [BLOQUE: GOBIERNO_CONTEXTO] y termina con [/BLOQUE: GOBIERNO_CONTEXTO]', () => {
  const block = buildGobiernoBlock(ctx('clientes'))
  const lines = block.split('\n')
  assert.equal(lines[0], '[BLOQUE: GOBIERNO_CONTEXTO]')
  assert.equal(lines[lines.length - 1], '[/BLOQUE: GOBIERNO_CONTEXTO]')
})

test('una regla indica --ambito con ambito_activo y --dominios con dominios_permitidos, no un dominio como --ambito', () => {
  const block = buildGobiernoBlock(ctx('proyectos_personales'))
  assert.match(block, /--ambito igual a ambito_activo/)
  assert.match(block, /--dominios igual a dominios_permitidos/)
})
