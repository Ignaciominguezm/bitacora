# Bitácora — IMM CORE SYSTEM SL

Panel de control privado del ecosistema digital de Ignacio Mínguez Montes.
PWA instalable, solo para uso personal.

**URL:** https://bitacora.ignaciominguez.com

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| Backend | Hono (Node.js) |
| Base de datos | PostgreSQL 16 |
| Auth | JWT en httpOnly cookie |
| Infraestructura | Docker + Nginx Proxy Manager |
| CI/CD | GitHub Actions → GHCR → SSH |
| Paquetes | pnpm |

---

## Funcionalidades

- **Dashboard** — panel informacional con widgets en tiempo real
- **Ecosistema** — estado de servicios y monitorización de 4 VPS (CPU, RAM, disco, contenedores)
- **Equipo hoy** — fichajes y tipo de jornada del equipo (iframe horario34)
- **Tareas urgentes** — tareas pendientes de CoreWorks con prioridad
- **CRM rápido** — búsqueda de contactos y sala de espera de UnrIA
- **Chat Unriar** — Claude Sonnet vía n8n, razonamiento general
- **Chat Kinnareth** — Ollama llama3.1:8b local, datos sensibles internos
- **WhatsApp / UnrIA** — bandeja de conversaciones gestionadas por el agente
- **Sistema** — monitorización detallada de infraestructura
- **Equipo** — iframe completo de horario34

---

## Bases de datos conectadas

| Base de datos | Uso |
|---|---|
| `bitacora_db` | Historial de conversaciones con agentes |
| `imm_db` | CRM — contactos, servicios, interacciones |
| `horario_db` | Fichajes y horarios del equipo |
| `tareas_db` | Tareas y clientes (CoreWorks) |
| `vacaciones_db` | Ausencias y solicitudes |
| `n8n_db` | Memoria de UnrIA y buffer de mensajes |

---

## Agentes IA

**Unriar** — Claude Sonnet 4.6 vía Anthropic API, orquestado por n8n.
Para razonamiento general, redacción y búsqueda web.
Webhook activo: `n8n.ignaciominguez.com/webhook/unriar`

**Kinnareth** — Ollama llama3.1:8b corriendo en el propio VPS.
Para consultas sobre datos internos sensibles (equipo, tareas, clientes).
Los datos nunca salen del servidor.

---

## Infraestructura VPS monitorizados

| Servidor | IP | Uso |
|---|---|---|
| Ecosistema Ignacio | 51.75.23.146 | Servidor principal |
| IMM CORE SYSTEM SL | 51.77.223.83 | Servidor de clientes |
| Dipinsur | 51.77.150.95 | Camping Playa La Bota |
| Nati Paladini | 152.228.216.197 | Estudio Floral Paladini |

---

## Despliegue

### Variables de entorno

Copiar `.env.example` a `.env` en el VPS y rellenar credenciales:

```bash
nano ~/infraestructura/bitacora/.env
```

### Base de datos

Ejecutar en `postgres-master` con usuario `ignacio_admin`:

```bash
docker exec postgres-master psql -U ignacio_admin -d postgres -c \
  "CREATE USER bitacora_user WITH PASSWORD 'PASSWORD';"
docker exec postgres-master psql -U ignacio_admin -d postgres -c \
  "CREATE DATABASE bitacora_db OWNER bitacora_user;"
docker exec postgres-master psql -U ignacio_admin -d bitacora_db -c \
  "GRANT ALL ON SCHEMA public TO bitacora_user;"
```

Schema en `src/server/db/schema.sql`.

### GitHub Secrets necesarios

| Secret | Valor |
|---|---|
| `VPS_HOST` | `51.75.23.146` |
| `VPS_USER` | `ignacio` |
| `VPS_SSH_KEY` | Contenido de `~/.ssh/id_ed25519` |

### Nginx Proxy Manager

Nuevo proxy host:
- Domain: `bitacora.ignaciominguez.com`
- Forward: `bitacora:3006`
- Network: `ignacio-net`
- SSL: Let's Encrypt automático

### Primer deploy

```bash
git push origin main
# GitHub Actions construye la imagen y despliega automáticamente
```

### Redespliegue manual

```bash
cd ~/infraestructura/bitacora
docker compose up -d --force-recreate
```

---

## Desarrollo local

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Frontend en `http://localhost:5173`, backend en `http://localhost:3006`.

---

## Notas técnicas

- `timeEntries` en `horario_db` usa camelCase y timestamps Unix en milisegundos
- El agente local en el mismo VPS se accede via `172.17.0.1:9100`, no por IP pública
- `unria_memory` en `n8n_db` tiene una fila por mensaje (no array)
- El superusuario de PostgreSQL es `ignacio_admin`, no `postgres`
- Los permisos de tablas nuevas requieren `GRANT ALL ON SCHEMA public TO usuario`
