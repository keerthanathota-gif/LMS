import type { FastifyPluginAsync } from 'fastify'
import { db } from '../config/db'
import { randomUUID } from 'crypto'

const chatRoutes: FastifyPluginAsync = async (app) => {

  // GET /chats?userId=...&orgId=... — list all chat sessions for a user
  app.get('/', async (req) => {
    const { userId, orgId } = req.query as { userId?: string; orgId?: string }
    if (!userId) return { data: [] }
    const { rows } = await db.query(
      `SELECT id, user_id, redis_session_id, title, course_id, created_at, updated_at,
              jsonb_array_length(messages) AS message_count
       FROM chat_sessions
       WHERE user_id = $1 ${orgId ? 'AND org_id = $2' : ''}
       ORDER BY updated_at DESC`,
      orgId ? [userId, orgId] : [userId],
    )
    return { data: rows }
  })

  // GET /chats/:id — get a single chat session with full messages
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query('SELECT * FROM chat_sessions WHERE id = $1', [id])
    if (!rows[0]) return reply.status(404).send({ error: 'Chat not found' })
    return { data: rows[0] }
  })

  // POST /chats — create a new chat session
  app.post('/', async (req, reply) => {
    const { userId, orgId, title, messages, redisSessionId, courseId } = req.body as {
      userId: string; orgId: string; title?: string; messages?: unknown[]
      redisSessionId?: string; courseId?: string
    }
    if (!userId || !orgId) return reply.status(400).send({ error: 'userId and orgId required' })
    const { rows } = await db.query(
      `INSERT INTO chat_sessions (id, user_id, org_id, redis_session_id, title, messages, course_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [randomUUID(), userId, orgId, redisSessionId ?? null, title ?? 'New conversation',
       JSON.stringify(messages ?? []), courseId ?? null],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // PATCH /chats/:id — update chat session (title, messages, redisSessionId)
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { title, messages, redisSessionId, courseId } = req.body as {
      title?: string; messages?: unknown[]; redisSessionId?: string; courseId?: string
    }
    const sets: string[] = []; const vals: unknown[] = []; let p = 1
    if (title !== undefined)          { sets.push(`title = $${p++}`);            vals.push(title) }
    if (messages !== undefined)       { sets.push(`messages = $${p++}::jsonb`);  vals.push(JSON.stringify(messages)) }
    if (redisSessionId !== undefined) { sets.push(`redis_session_id = $${p++}`); vals.push(redisSessionId) }
    if (courseId !== undefined)        { sets.push(`course_id = $${p++}`);       vals.push(courseId) }
    if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' })
    sets.push('updated_at = NOW()')
    vals.push(id)
    const { rows } = await db.query(
      `UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = $${p} RETURNING id, title, updated_at`,
      vals,
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Chat not found' })
    return { data: rows[0] }
  })

  // DELETE /chats/:id — delete a chat session
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.query('DELETE FROM chat_sessions WHERE id = $1', [id])
    return reply.status(204).send()
  })
}

export default chatRoutes
