import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Pool } from 'pg'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

const db = new Pool({ connectionString: process.env.DATABASE_URL })

app.get('/health', async () => ({ status: 'ok', service: 'audit-service' }))

// ---------------------------------------------------------------------------
// POST /audit/log — write an audit event
// ---------------------------------------------------------------------------
app.post('/audit/log', async (req, reply) => {
  const {
    userId, orgId, action, resourceType, resourceId,
    metadata, ipAddress, userAgent,
  } = req.body as {
    userId?: string
    orgId?: string
    action: string
    resourceType: string
    resourceId?: string
    metadata?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
  }

  if (!action || !resourceType) {
    return reply.status(400).send({ error: 'action and resourceType are required' })
  }

  const { rows } = await db.query(
    `INSERT INTO audit_log (user_id, org_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
    [userId, orgId, action, resourceType, resourceId, JSON.stringify(metadata ?? {}), ipAddress, userAgent],
  )

  return reply.status(201).send({ data: rows[0] })
})

// ---------------------------------------------------------------------------
// GET /audit/logs — query audit logs
// ---------------------------------------------------------------------------
app.get('/audit/logs', async (req) => {
  const {
    userId, orgId, resourceType, action,
    limit = '50', offset = '0',
  } = req.query as Record<string, string>

  const conditions: string[] = []
  const params: (string | number)[] = []
  let i = 1

  if (userId)       { conditions.push(`user_id = $${i++}`);       params.push(userId) }
  if (orgId)        { conditions.push(`org_id = $${i++}`);        params.push(orgId) }
  if (resourceType) { conditions.push(`resource_type = $${i++}`); params.push(resourceType) }
  if (action)       { conditions.push(`action = $${i++}`);        params.push(action) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  params.push(Number(limit), Number(offset))
  const { rows } = await db.query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    params,
  )

  return { data: rows }
})

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function start() {
  await app.register(cors, { origin: true })
  const port = Number(process.env.AUDIT_SERVICE_PORT ?? 3010)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`Audit Service on port ${port}`)
}

start().catch((err) => { console.error(err); process.exit(1) })
