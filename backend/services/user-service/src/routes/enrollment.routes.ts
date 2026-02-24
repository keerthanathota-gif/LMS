import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../config/db'
import { randomUUID } from 'crypto'

const CERT_SERVICE  = process.env.CERT_SERVICE_URL  ?? 'http://certificate-engine:3006'
const BADGE_SERVICE = process.env.BADGE_SERVICE_URL ?? 'http://badge-engine:3005'

/** Issue milestone badges after each module completion */
async function issueMilestoneBadges(userId: string, courseId: string, done: number, total: number): Promise<void> {
  // Get all badges for the org
  const { rows: courseRows } = await db.query('SELECT org_id FROM courses WHERE id = $1', [courseId])
  if (!courseRows[0]) return
  const orgId = courseRows[0].org_id

  try {
    const res = await fetch(`${BADGE_SERVICE}/badges?orgId=${orgId}`)
    const body = await res.json() as { data?: Array<{ id: string; name: string; skill_tags: string[] }> }
    const badges = body.data ?? []

    // Issue the course completion badge for each module milestone
    // Strategy: find badges tagged with 'completion' and issue them progressively
    for (const badge of badges) {
      // Skip if already issued to this user
      const { rows: existing } = await db.query(
        'SELECT id FROM issued_badges WHERE badge_id = $1 AND user_id = $2',
        [badge.id, userId],
      )
      if (existing.length > 0) continue

      // Issue badge if this is the course's badge (criteria-based)
      // For now: issue any completion badge from this org when ANY module is done
      const tags = badge.skill_tags ?? []
      if (tags.includes('completion') || tags.includes('milestone')) {
        await fetch(`${BADGE_SERVICE}/badges/${badge.id}/issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        }).catch(() => {})
        break // Only issue one badge per module completion
      }
    }
  } catch { /* non-critical */ }
}

async function issueCertOnCompletion(userId: string, courseId: string): Promise<void> {
  const { rows: certRows } = await db.query(
    'SELECT id FROM certificates WHERE course_id = $1 LIMIT 1',
    [courseId],
  )
  if (!certRows[0]) return

  const { rows: userRows } = await db.query(
    'SELECT full_name FROM users WHERE id = $1',
    [userId],
  )
  const { rows: courseRows } = await db.query(
    `SELECT c.title, o.name AS org_name
     FROM courses c JOIN organizations o ON o.id = c.org_id
     WHERE c.id = $1`,
    [courseId],
  )
  if (!userRows[0] || !courseRows[0]) return

  await fetch(`${CERT_SERVICE}/certificates/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id:        userId,
      course_id:      courseId,
      certificate_id: certRows[0].id,
      user_name:      userRows[0].full_name || 'Learner',
      course_title:   courseRows[0].title,
      org_name:       courseRows[0].org_name || 'Learning Academy',
    }),
  })
}

const enrollSchema = z.object({
  courseId: z.string().uuid(),
  userIds:  z.array(z.string().uuid()).min(1),
  orgId:    z.string().uuid().optional(),
})

const enrollmentRoutes: FastifyPluginAsync = async (app) => {

  // POST /enrollments — enroll one or more users in a course
  app.post('/', async (req, reply) => {
    const parsed = enrollSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { courseId, userIds, orgId } = parsed.data
    const enrolled: string[] = []
    const skipped: string[] = []

    for (const userId of userIds) {
      try {
        await db.query(
          `INSERT INTO enrollments (id, user_id, course_id, org_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, course_id) DO NOTHING`,
          [randomUUID(), userId, courseId, orgId ?? null],
        )
        enrolled.push(userId)
      } catch {
        skipped.push(userId)
      }
    }

    return reply.status(201).send({
      data: { enrolled: enrolled.length, skipped: skipped.length, courseId },
    })
  })

  // GET /enrollments?courseId=...&userId=...&orgId=...
  app.get('/', async (req) => {
    const { courseId, userId, orgId, limit = '50', offset = '0' } =
      req.query as Record<string, string>

    let query = `
      SELECT e.*, u.email, u.full_name, u.role
      FROM enrollments e
      JOIN users u ON u.id = e.user_id
      WHERE 1=1`
    const params: unknown[] = []
    let i = 1

    if (courseId) { query += ` AND e.course_id = $${i++}`; params.push(courseId) }
    if (userId)   { query += ` AND e.user_id   = $${i++}`; params.push(userId) }
    if (orgId)    { query += ` AND e.org_id    = $${i++}`; params.push(orgId) }

    query += ` ORDER BY e.enrolled_at DESC LIMIT $${i++} OFFSET $${i++}`
    params.push(Number(limit), Number(offset))

    const { rows } = await db.query(query, params)
    return { data: rows }
  })

  // GET /enrollments/count?orgId=...
  app.get('/count', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    const { rows } = await db.query(
      orgId
        ? `SELECT COUNT(*) AS total FROM enrollments WHERE org_id = $1 AND status = 'active'`
        : `SELECT COUNT(*) AS total FROM enrollments WHERE status = 'active'`,
      orgId ? [orgId] : [],
    )
    return { data: { total: Number(rows[0].total) } }
  })

  // PATCH /enrollments/:id/progress — update learner progress (0-100)
  app.patch('/:id/progress', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { progress } = req.body as { progress: number }

    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return reply.status(400).send({ error: 'progress must be 0-100' })
    }

    const newStatus = progress >= 100 ? 'completed' : 'active'
    const completedAt = progress >= 100 ? 'NOW()' : 'NULL'

    const { rows } = await db.query(
      `UPDATE enrollments
       SET progress_pct = $1, status = $2, completed_at = ${completedAt}
       WHERE id = $3
       RETURNING *`,
      [progress, newStatus, id],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Enrollment not found' })

    // Trigger certificate issuance async when course completes (non-blocking)
    if (progress >= 100) {
      issueCertOnCompletion(rows[0].user_id, rows[0].course_id).catch(() => {})
    }

    return { data: rows[0] }
  })

  // GET /enrollments/:userId/:courseId — get specific enrollment
  app.get('/:userId/:courseId', async (req, reply) => {
    const { userId, courseId } = req.params as { userId: string; courseId: string }
    const { rows } = await db.query(
      'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [userId, courseId],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Enrollment not found' })
    return { data: rows[0] }
  })

  // DELETE /enrollments/:userId/:courseId — unenroll (soft delete via status)
  app.delete('/:userId/:courseId', async (req, reply) => {
    const { userId, courseId } = req.params as { userId: string; courseId: string }
    await db.query(
      `UPDATE enrollments SET status = 'dropped' WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId],
    )
    return reply.status(204).send()
  })

  // ── Resume / Checkpoint ─────────────────────────────────────────────────

  // POST /enrollments/:id/checkpoint — save resume position (called every ~10s)
  app.post('/:id/checkpoint', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { moduleId, positionSecs, watchTimeSecs } = req.body as {
      moduleId: string; positionSecs: number; watchTimeSecs?: number
    }

    // Update enrollment checkpoint
    await db.query(
      `UPDATE enrollments
       SET last_module_id = $1, last_position_secs = $2, last_accessed_at = NOW()
       WHERE id = $3`,
      [moduleId, positionSecs ?? 0, id],
    )

    // Upsert module_progress row
    const { rows: enrollRows } = await db.query('SELECT user_id, course_id FROM enrollments WHERE id = $1', [id])
    if (enrollRows[0]) {
      await db.query(
        `INSERT INTO module_progress (user_id, module_id, course_id, position_secs, watch_time_secs, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, module_id)
         DO UPDATE SET position_secs = GREATEST(module_progress.position_secs, $4),
                       watch_time_secs = GREATEST(module_progress.watch_time_secs, COALESCE($5, module_progress.watch_time_secs)),
                       updated_at = NOW()`,
        [enrollRows[0].user_id, moduleId, enrollRows[0].course_id, positionSecs ?? 0, watchTimeSecs ?? 0],
      )
    }

    return { data: { saved: true } }
  })

  // GET /enrollments/:userId/:courseId/progress — per-module progress for sidebar
  app.get('/:userId/:courseId/progress', async (req) => {
    const { userId, courseId } = req.params as { userId: string; courseId: string }
    const { rows } = await db.query(
      `SELECT mp.module_id, mp.status, mp.watch_time_secs, mp.position_secs, mp.completed_at
       FROM module_progress mp
       WHERE mp.user_id = $1 AND mp.course_id = $2
       ORDER BY mp.updated_at DESC`,
      [userId, courseId],
    )
    return { data: rows }
  })

  // POST /enrollments/:id/module-complete — mark module complete (with skip detection)
  app.post('/:id/module-complete', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { moduleId, watchTimeSecs } = req.body as { moduleId: string; watchTimeSecs?: number }

    // Get enrollment info
    const { rows: enrollRows } = await db.query('SELECT user_id, course_id FROM enrollments WHERE id = $1', [id])
    if (!enrollRows[0]) return reply.status(404).send({ error: 'Enrollment not found' })
    const { user_id: userId, course_id: courseId } = enrollRows[0]

    // Skip detection: check if watch_time meets threshold for video modules
    const { rows: modRows } = await db.query(
      'SELECT duration_secs, content_type FROM modules WHERE id = $1',
      [moduleId],
    )
    const mod = modRows[0]
    if (mod?.duration_secs && (mod.content_type === 'youtube_embed' || mod.content_type === 'video')) {
      const required = Math.floor(mod.duration_secs * 0.7) // 70% actual watch time required
      const actual = watchTimeSecs ?? 0
      if (actual < required && actual > 0) {
        return reply.status(400).send({
          error: 'Insufficient watch time',
          message: `You need to watch at least ${Math.ceil(required / 60)} minutes. You've watched ${Math.ceil(actual / 60)} minutes so far.`,
          required,
          actual,
        })
      }
    }

    // Mark module complete
    await db.query(
      `INSERT INTO module_progress (user_id, module_id, course_id, status, watch_time_secs, completed_at, updated_at)
       VALUES ($1, $2, $3, 'completed', $4, NOW(), NOW())
       ON CONFLICT (user_id, module_id)
       DO UPDATE SET status = 'completed', watch_time_secs = GREATEST(module_progress.watch_time_secs, $4),
                     completed_at = COALESCE(module_progress.completed_at, NOW()), updated_at = NOW()`,
      [userId, moduleId, courseId, watchTimeSecs ?? 0],
    )

    // Recalculate course progress
    const { rows: totalRows } = await db.query(
      'SELECT COUNT(*)::int AS total FROM modules WHERE course_id = $1',
      [courseId],
    )
    const { rows: doneRows } = await db.query(
      "SELECT COUNT(*)::int AS done FROM module_progress WHERE user_id = $1 AND course_id = $2 AND status = 'completed'",
      [userId, courseId],
    )
    const total = totalRows[0]?.total ?? 1
    const done = doneRows[0]?.done ?? 0
    const progress = Math.min(100, Math.round((done / total) * 100))

    // Update enrollment progress
    const newStatus = progress >= 100 ? 'completed' : 'active'
    const completedAt = progress >= 100 ? 'NOW()' : 'NULL'
    await db.query(
      `UPDATE enrollments SET progress_pct = $1, status = $2, completed_at = ${completedAt} WHERE id = $3`,
      [progress, newStatus, id],
    )

    // Issue milestone badge after each module completion (non-blocking)
    issueMilestoneBadges(userId, courseId, done, total).catch(() => {})

    // Trigger cert ONLY when ALL modules are complete
    if (progress >= 100) {
      issueCertOnCompletion(userId, courseId).catch(() => {})
    }

    return { data: { moduleId, status: 'completed', progress } }
  })
}

export default enrollmentRoutes
