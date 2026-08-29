import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseActionProposal, stripActionProposal } from './parseActionProposal.js'

test('sin bloque -> null', () => {
  const result = parseActionProposal('Solo texto normal, sin propuesta de ningún tipo.')
  assert.equal(result, null)
})

test('bloque válido -> objeto con los campos del JSON', () => {
  const text =
    'Antes.\n' +
    '[ACCION_PROPUESTA]\n' +
    '{"action_type":"corework.create_task","summary":"crear tarea","origen":"iniciativa","completo":true,"payload":{"title":"x"}}\n' +
    '[/ACCION_PROPUESTA]\n' +
    'Después.'
  const result = parseActionProposal(text)
  assert.ok(result && !('error' in result))
  assert.equal(result!.action_type, 'corework.create_task')
  assert.equal(result!.summary, 'crear tarea')
  assert.equal(result!.origen, 'iniciativa')
  assert.equal(result!.completo, true)
})

test('JSON roto dentro del bloque -> {error: "malformed"}', () => {
  const text = '[ACCION_PROPUESTA]{ esto no es json }[/ACCION_PROPUESTA]'
  const result = parseActionProposal(text)
  assert.deepEqual(result, { error: 'malformed' })
})

test('JSON válido pero sin action_type -> malformed (forma inservible)', () => {
  const text = '[ACCION_PROPUESTA]{"summary":"sin tipo"}[/ACCION_PROPUESTA]'
  const result = parseActionProposal(text)
  assert.deepEqual(result, { error: 'malformed' })
})

test('varios bloques -> se usa el primero, se ignora el resto', () => {
  const text =
    '[ACCION_PROPUESTA]{"action_type":"corework.create_task","payload":{}}[/ACCION_PROPUESTA]' +
    ' texto intermedio ' +
    '[ACCION_PROPUESTA]{"action_type":"otro.tipo","payload":{}}[/ACCION_PROPUESTA]'
  const result = parseActionProposal(text)
  assert.ok(result && !('error' in result))
  assert.equal(result!.action_type, 'corework.create_task')
})

test('el texto fuera del bloque se preserva (stripActionProposal)', () => {
  const text = 'Antes del bloque.\n[ACCION_PROPUESTA]{"action_type":"corework.create_task","payload":{}}[/ACCION_PROPUESTA]\nDespués del bloque.'
  const stripped = stripActionProposal(text)
  assert.equal(stripped, 'Antes del bloque.\n\nDespués del bloque.')
  assert.ok(!stripped.includes('ACCION_PROPUESTA'))
})

test('stripActionProposal sin bloque devuelve el texto igual (recortado)', () => {
  const text = '  Sin ningún bloque aquí.  '
  assert.equal(stripActionProposal(text), 'Sin ningún bloque aquí.')
})

test('stripActionProposal también quita un bloque malformado', () => {
  const text = 'Antes.[ACCION_PROPUESTA]{ roto [/ACCION_PROPUESTA]Después.'
  const stripped = stripActionProposal(text)
  assert.equal(stripped, 'Antes.Después.')
})
