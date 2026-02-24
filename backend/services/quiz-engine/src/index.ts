import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Pool } from 'pg'
import { AzureOpenAI } from 'openai'
import quizRoutes from './routes/quiz.routes'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

export const db = new Pool({ connectionString: process.env.DATABASE_URL })

export const ai = new AzureOpenAI({
  endpoint:   process.env.AZURE_OPENAI_ENDPOINT!,
  apiKey:     process.env.AZURE_OPENAI_API_KEY!,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5-chat',
})

async function bootstrap() {
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ status: 'ok', service: 'quiz-engine' }))

  await app.register(quizRoutes, { prefix: '/quiz' })

  const port = Number(process.env.QUIZ_ENGINE_PORT ?? 3004)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`🚀 Quiz Engine on port ${port}`)
}

bootstrap().catch((err) => { console.error(err); process.exit(1) })
