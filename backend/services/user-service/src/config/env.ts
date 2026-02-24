import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('development'),
  USER_SERVICE_PORT:     z.coerce.number().default(3001),
  DATABASE_URL:          z.string().min(1),
  REDIS_URL:             z.string().default('redis://localhost:6379'),
  KAFKA_BROKERS:         z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID:       z.string().default('user-service'),
  KAFKA_GROUP_ID:        z.string().default('user-service-group'),
  JWT_ISSUER:            z.string().min(1),
  KEYCLOAK_URL:          z.string().min(1),
  KEYCLOAK_REALM:        z.string().default('lms'),
  AUDIT_SIGNING_SECRET:  z.string().min(32),
  LOG_LEVEL:             z.enum(['fatal','error','warn','info','debug','trace']).default('info'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
