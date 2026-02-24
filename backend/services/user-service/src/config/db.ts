import { Pool } from 'pg'
import { env } from './env'

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  min: 2,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

db.on('error', (err) => {
  console.error('Unexpected DB pool error', err)
})

export async function checkDbConnection() {
  const client = await db.connect()
  await client.query('SELECT 1')
  client.release()
}
