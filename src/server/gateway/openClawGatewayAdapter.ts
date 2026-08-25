import type { AgentContext, AgentGateway, AgentSessionRef } from './types.js'
import { buildPrompt } from './prompt.js'

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'https://imm-guarida.tailf37d92.ts.net'
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN
const OPENCLAW_TIMEOUT_SECONDS = Number.parseInt(process.env.OPENCLAW_TIMEOUT_SECONDS || '60', 10)

// Formato Responses de OpenAI — confirmado con curl real contra el gateway.
interface ResponsesContentItem {
  type?: string
  text?: string
}
interface ResponsesOutputItem {
  type?: string
  content?: ResponsesContentItem[]
}
interface ResponsesResult {
  output?: ResponsesOutputItem[]
  phase?: string
}

function extractText(result: ResponsesResult): string {
  const message = result.output?.find((item) => item.type === 'message') ?? result.output?.[0]
  const textItem = message?.content?.find((c) => c.type === 'output_text') ?? message?.content?.[0]
  const text = textItem?.text
  if (typeof text === 'string' && text.trim()) return text
  throw new Error('Respuesta de OpenClaw (gateway) sin output[].content[].text reconocible')
}

// Habla con el gateway HTTP de OpenClaw en la sobremesa, vía Tailscale.
// Formato Responses de OpenAI: POST /v1/responses, body {model, input}.
// Nunca se llama desde el navegador — vive en el backend, el token nunca
// sale de aquí (no viaja al cliente en ninguna respuesta).
export class OpenClawGatewayAdapter implements AgentGateway {
  async *send(message: string, context: AgentContext, session: AgentSessionRef): AsyncIterable<string> {
    if (!OPENCLAW_GATEWAY_TOKEN) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN no configurado')
    }

    const prompt = buildPrompt(message, context, session)
    const startedAt = Date.now()

    let res: Response
    try {
      res = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}`
        },
        body: JSON.stringify({ model: 'openclaw', input: prompt }),
        signal: AbortSignal.timeout(OPENCLAW_TIMEOUT_SECONDS * 1000)
      })
    } catch (err) {
      console.error(
        `[openclaw-gateway] fallo de red sessionId=${session.sessionId} durationMs=${Date.now() - startedAt}: ` +
          `${err instanceof Error ? err.message : 'error desconocido'}`
      )
      throw new Error('No se pudo contactar con el gateway de OpenClaw')
    }

    const durationMs = Date.now() - startedAt

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(
        `[openclaw-gateway] HTTP ${res.status} sessionId=${session.sessionId} durationMs=${durationMs} ` +
          `body="${errBody.slice(0, 300)}"`
      )
      throw new Error(`OpenClaw gateway respondió ${res.status}`)
    }

    let data: ResponsesResult
    try {
      data = (await res.json()) as ResponsesResult
    } catch {
      console.error(`[openclaw-gateway] JSON inválido sessionId=${session.sessionId} durationMs=${durationMs}`)
      throw new Error('No se pudo parsear la respuesta JSON del gateway de OpenClaw')
    }

    console.log(`[openclaw-gateway] session=${session.sessionId} ok durationMs=${durationMs} phase=${data.phase ?? '?'}`)
    yield extractText(data)
  }
}
