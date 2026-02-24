import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { Pool } from 'pg'
import courseRoutes from './routes/course.routes'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

export const db = new Pool({ connectionString: process.env.DATABASE_URL })

// ---------------------------------------------------------------------------
// Drip scheduler — runs hourly, auto-publishes courses whose scheduled_at has passed
// ---------------------------------------------------------------------------
async function runDripScheduler() {
  try {
    const { rows } = await db.query(
      `SELECT cs.course_id
       FROM course_schedules cs
       WHERE cs.scheduled_at <= NOW()
         AND cs.executed_at IS NULL`,
    )
    for (const row of rows) {
      await db.query(
        `UPDATE courses SET status = 'published', updated_at = NOW()
         WHERE id = $1 AND status = 'draft'`,
        [row.course_id],
      )
      await db.query(
        `UPDATE course_schedules SET executed_at = NOW()
         WHERE course_id = $1 AND executed_at IS NULL`,
        [row.course_id],
      )
      console.log(`[drip-scheduler] Published course ${row.course_id}`)
    }
  } catch (err) {
    console.error('[drip-scheduler] Error:', err)
  }
}

async function bootstrap() {
  await app.register(cors, { origin: true })
  await app.register(helmet, { contentSecurityPolicy: false })

  app.get('/health', async () => ({ status: 'ok', service: 'course-service' }))
  app.get('/ready', async () => {
    await db.query('SELECT 1')
    return { status: 'ready' }
  })

  await app.register(courseRoutes, { prefix: '/courses' })

  const port = Number(process.env.COURSE_SERVICE_PORT ?? 3002)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`🚀 Course Service on port ${port}`)

  // Start drip scheduler: check every hour for courses to auto-publish
  setInterval(runDripScheduler, 60 * 60 * 1000)
  // Also run immediately on startup to catch any missed schedules
  runDripScheduler()
}

bootstrap().catch((err) => { console.error(err); process.exit(1) })
