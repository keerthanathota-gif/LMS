import type { FastifyPluginAsync } from 'fastify'
import { db } from '../config/db'

const settingsRoutes: FastifyPluginAsync = async (app) => {

  // GET /settings?orgId=... — get all settings for an org
  app.get('/', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return { data: [] }
    const { rows } = await db.query(
      `SELECT key, CASE WHEN is_secret THEN '••••••••' ELSE value END AS value, is_secret, updated_at
       FROM org_settings WHERE org_id = $1 ORDER BY key`,
      [orgId],
    )
    return { data: rows }
  })

  // GET /settings/:key?orgId=... — get a single setting (unmasked, for backend use)
  app.get('/:key', async (req, reply) => {
    const { key } = req.params as { key: string }
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const { rows } = await db.query(
      'SELECT key, value, is_secret FROM org_settings WHERE org_id = $1 AND key = $2',
      [orgId, key],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Setting not found' })
    return { data: rows[0] }
  })

  // PUT /settings — upsert one or more settings
  app.put('/', async (req, reply) => {
    const { orgId, settings } = req.body as {
      orgId: string
      settings: Array<{ key: string; value: string; isSecret?: boolean }>
    }
    if (!orgId || !settings?.length) {
      return reply.status(400).send({ error: 'orgId and settings[] required' })
    }

    const saved = []
    for (const s of settings) {
      // Don't overwrite secret with masked value
      if (s.value === '••••••••') continue

      const { rows } = await db.query(
        `INSERT INTO org_settings (org_id, key, value, is_secret, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (org_id, key)
         DO UPDATE SET value = $3, is_secret = $4, updated_at = NOW()
         RETURNING key, CASE WHEN is_secret THEN '••••••••' ELSE value END AS value, is_secret`,
        [orgId, s.key, s.value, s.isSecret ?? false],
      )
      if (rows[0]) saved.push(rows[0])
    }

    return { data: saved }
  })

  // DELETE /settings/:key?orgId=... — remove a setting
  app.delete('/:key', async (req, reply) => {
    const { key } = req.params as { key: string }
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    await db.query('DELETE FROM org_settings WHERE org_id = $1 AND key = $2', [orgId, key])
    return reply.status(204).send()
  })
}

export default settingsRoutes
