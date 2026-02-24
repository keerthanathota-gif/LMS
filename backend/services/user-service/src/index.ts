import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env'
import { checkDbConnection } from './config/db'
import userRoutes from './routes/user.routes'
import authRoutes from './routes/auth.routes'
import enrollmentRoutes from './routes/enrollment.routes'
import settingsRoutes from './routes/settings.routes'
import chatRoutes from './routes/chat.routes'

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

async function bootstrap() {
  // Plugins
  await app.register(cors, { origin: true, credentials: true })
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'user-service', ts: new Date().toISOString() }))
  app.get('/ready', async () => {
    await checkDbConnection()
    return { status: 'ready' }
  })

  // Routes
  await app.register(authRoutes,       { prefix: '/auth' })
  await app.register(userRoutes,       { prefix: '/users' })
  await app.register(enrollmentRoutes, { prefix: '/enrollments' })
  await app.register(settingsRoutes,   { prefix: '/settings' })
  await app.register(chatRoutes,       { prefix: '/chats' })

  // Check DB on startup
  await checkDbConnection()
  app.log.info('✅ Database connected')

  // Start
  await app.listen({ port: env.USER_SERVICE_PORT, host: '0.0.0.0' })
  app.log.info(`🚀 User Service running on port ${env.USER_SERVICE_PORT}`)
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
