import { spawn } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentContext, AgentGateway, AgentSessionRef } from './types.js'
import { buildPrompt } from './prompt.js'

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw'
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main'
const OPENCLAW_TIMEOUT_SECONDS = Number.parseInt(process.env.OPENCLAW_TIMEOUT_SECONDS || '60', 10)
// Margen sobre el --timeout que ya le pedimos al propio CLI, por si su
// mecanismo de timeout interno falla y el proceso se queda colgado.
const KILL_GRACE_SECONDS = 5

interface OpenClawPayload {
  text?: string
}

interface OpenClawResult {
  payloads?: OpenClawPayload[]
  finalAssistantVisibleText?: string
}

function extractText(result: OpenClawResult): string {
  const fromPayload = result.payloads?.[0]?.text
  if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload

  const fromFinal = result.finalAssistantVisibleText
  if (typeof fromFinal === 'string' && fromFinal.trim()) return fromFinal

  throw new Error('Respuesta de OpenClaw sin texto reconocible (ni payloads[0].text ni finalAssistantVisibleText)')
}

// Invoca el CLI `openclaw agent` como subproceso — sin pasar por shell (spawn
// con argv en array, sin shell:true), así que el texto del usuario nunca se
// interpola en un comando: ni por diseño (arriba) ni aunque contuviera
// metacaracteres de shell. El mensaje viaja en un fichero temporal
// (--message-file), no como argumento de línea de comandos.
export class OpenClawCliAdapter implements AgentGateway {
  async *send(message: string, context: AgentContext, session: AgentSessionRef): AsyncIterable<string> {
    const prompt = buildPrompt(message, context, session)
    const tmpFile = join(tmpdir(), `cabina-openclaw-${randomUUID()}.txt`)
    await writeFile(tmpFile, prompt, { encoding: 'utf-8', mode: 0o600 })

    try {
      const result = await this.runCli(tmpFile, session.sessionId)
      yield extractText(result)
    } finally {
      await unlink(tmpFile).catch(() => {})
    }
  }

  private runCli(messageFile: string, sessionKey: string): Promise<OpenClawResult> {
    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
      const args = [
        'agent',
        '--agent', OPENCLAW_AGENT_ID,
        '--session-key', sessionKey,
        '--message-file', messageFile,
        '--json',
        '--timeout', String(OPENCLAW_TIMEOUT_SECONDS)
      ]

      const child = spawn(OPENCLAW_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''
      let settled = false

      const killTimer = setTimeout(() => {
        child.kill('SIGKILL')
      }, (OPENCLAW_TIMEOUT_SECONDS + KILL_GRACE_SECONDS) * 1000)

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(killTimer)
        fn()
      }

      child.stdout.on('data', (d: Buffer) => { stdout += d })
      child.stderr.on('data', (d: Buffer) => { stderr += d })

      child.on('error', (err) => {
        // No se pudo ni lanzar el proceso (binario ausente, permisos, etc.)
        finish(() => reject(err))
      })

      child.on('close', (code) => {
        const durationMs = Date.now() - startedAt
        finish(() => {
          if (code !== 0) {
            // Log mínimo: sesión (uuid, no sensible), código, duración y un
            // recorte corto de stderr — nunca el prompt ni tokens.
            console.error(
              `[openclaw] fallo sessionKey=${sessionKey} exitCode=${code} durationMs=${durationMs} ` +
                `stderr="${stderr.slice(0, 200)}"`
            )
            reject(new Error(`OpenClaw CLI salió con código ${code}`))
            return
          }
          try {
            resolve(JSON.parse(stdout.trim()) as OpenClawResult)
          } catch {
            console.error(`[openclaw] JSON inválido sessionKey=${sessionKey} durationMs=${durationMs}`)
            reject(new Error('No se pudo parsear la respuesta JSON de OpenClaw'))
          }
        })
      })
    })
  }
}
