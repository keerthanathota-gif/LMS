import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../index'
import { randomUUID } from 'crypto'

const createCourseSchema = z.object({
  title:       z.string().min(3).max(500),
  description: z.string().optional(),
  skillTags:   z.array(z.string()).default([]),
  orgId:       z.string().uuid(),
  instructorId: z.string().uuid(),
})

const courseRoutes: FastifyPluginAsync = async (app) => {

  // GET /categories — flat list with parent info
  app.get('/categories', async () => {
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.slug, c.icon, c.parent_id, c.sort_order,
              p.name AS parent_name, p.slug AS parent_slug
       FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
       ORDER BY c.sort_order, c.name`,
    )
    return { data: rows }
  })

  // GET /categories/tree — nested tree (top-level with children)
  app.get('/categories/tree', async () => {
    const { rows } = await db.query(
      'SELECT id, name, slug, icon, parent_id, sort_order FROM categories ORDER BY sort_order, name',
    )
    type CatRow = { id: string; name: string; slug: string; icon: string; parent_id: string | null; sort_order: number }
    const topLevel = (rows as CatRow[]).filter((r) => !r.parent_id)
    const tree = topLevel.map((parent) => ({
      ...parent,
      children: (rows as CatRow[]).filter((r) => r.parent_id === parent.id),
    }))
    return { data: tree }
  })

  // GET /categories/match?name=... — fuzzy match a category name, returns best match
  app.get('/categories/match', async (req) => {
    const { name } = req.query as { name?: string }
    if (!name) return { data: null }
    const { rows } = await db.query(
      `SELECT id, name, slug, parent_id FROM categories
       WHERE LOWER(name) = LOWER($1)
          OR LOWER(slug) = LOWER($1)
          OR LOWER(name) LIKE '%' || LOWER($1) || '%'
       ORDER BY (CASE WHEN LOWER(name) = LOWER($1) THEN 0 ELSE 1 END), sort_order
       LIMIT 1`,
      [name.trim()],
    )
    return { data: rows[0] ?? null }
  })

  // GET /courses
  app.get('/', async (req) => {
    const { orgId, limit = '20', offset = '0' } = req.query as Record<string, string>
    const { rows } = await db.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count,
        (SELECT COALESCE(SUM(m.duration_secs), 0)::int FROM modules m WHERE m.course_id = c.id) AS total_duration_secs,
        (SELECT ROUND(AVG(r.rating), 1) FROM course_reviews r WHERE r.course_id = c.id) AS avg_rating,
        (SELECT COUNT(*)::int FROM course_reviews r WHERE r.course_id = c.id) AS review_count,
        (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status != 'dropped') AS enrollment_count,
        cat.name AS category_name, cat.slug AS category_slug
       FROM courses c
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE c.org_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, Number(limit), Number(offset)],
    )
    return { data: rows }
  })

  // GET /courses/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query('SELECT * FROM courses WHERE id = $1', [id])
    if (!rows[0]) return reply.status(404).send({ error: 'Course not found' })

    const { rows: modules } = await db.query(
      'SELECT * FROM modules WHERE course_id = $1 ORDER BY order_index',
      [id],
    )

    // Normalize and build hierarchy (sections → items)
    type NormalizedModule = {
      id: string; courseId: string; title: string; orderIndex: number
      contentType: string; sourceType: string; contentUrl: string
      durationSecs: number; processingStatus: string; transcript: string
      aiSummary: string; parentModuleId: string | null; itemType: string
      sectionTitle: string | null; items?: NormalizedModule[]
    }

    const normalize = (m: Record<string, unknown>): NormalizedModule => ({
      id:               m.id as string,
      courseId:         m.course_id as string,
      title:            m.title as string,
      orderIndex:       m.order_index as number,
      contentType:      m.content_type as string,
      sourceType:       m.source_type as string,
      contentUrl:       m.content_url as string,
      durationSecs:     m.duration_secs as number,
      processingStatus: m.processing_status as string,
      transcript:       m.transcript as string,
      aiSummary:        m.ai_summary as string,
      parentModuleId:   m.parent_module_id as string | null,
      itemType:         (m.item_type as string) ?? 'content',
      sectionTitle:     m.section_title as string | null,
    })

    const allModules = modules.map(normalize)

    // Separate top-level sections from sub-items
    const topLevel = allModules.filter((m) => !m.parentModuleId)
    const subItems = allModules.filter((m) => m.parentModuleId)

    // Attach sub-items to their parent sections
    const nested = topLevel.map((section) => ({
      ...section,
      items: subItems.filter((item) => item.parentModuleId === section.id)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    }))

    // Also return flat list for backward compatibility
    return { data: { ...rows[0], modules: allModules, sections: nested } }
  })

  // POST /courses
  app.post('/', async (req, reply) => {
    const parsed = createCourseSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { title, description, skillTags, orgId, instructorId } = parsed.data

    // Weekly course creation limit: 1 per org per 7 days
    // Bypass: orchestrator sends ?schedule=true for multi-week / batch workflows
    const isBatchSchedule = (req.query as Record<string, string>).schedule === 'true'
    if (!isBatchSchedule) {
      const { rows: limitRows } = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM courses
         WHERE org_id = $1
           AND status != 'archived'
           AND created_at >= NOW() - INTERVAL '7 days'`,
        [orgId],
      )
      if (parseInt(limitRows[0].count) >= 1) {
        return reply.status(429).send({
          error: 'Weekly course limit reached',
          message:
            'Your organization can create 1 course per week. ' +
            'Come back next week, or ask the assistant to create a weekly schedule.',
        })
      }
    }

    const { rows } = await db.query(
      `INSERT INTO courses (id, org_id, instructor_id, title, description, skill_tags, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING *`,
      [randomUUID(), orgId, instructorId, title, description, skillTags],
    )

    // Publish Kafka event (fire and forget)
    publishEvent('course.events', { event_type: 'course.created', course_id: rows[0].id, org_id: orgId })

    return reply.status(201).send({ data: rows[0] })
  })

  // POST /courses/:id/modules — create a module (section) or sub-item
  app.post('/:id/modules', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { title, contentType, contentUrl, sourceType, durationSecs, sourceMetadata, processingStatus,
            parentModuleId, itemType, sectionTitle } = req.body as {
      title: string; contentType: string; contentUrl?: string; sourceType?: string
      durationSecs?: number; sourceMetadata?: Record<string, unknown>; processingStatus?: string
      parentModuleId?: string; itemType?: string; sectionTitle?: string
    }

    // Count existing items at the same level for order_index
    const countQuery = parentModuleId
      ? 'SELECT COUNT(*) as cnt FROM modules WHERE parent_module_id = $1'
      : 'SELECT COUNT(*) as cnt FROM modules WHERE course_id = $1 AND parent_module_id IS NULL'
    const { rows: existing } = await db.query(countQuery, [parentModuleId ?? id])
    const orderIndex = Number(existing[0].cnt)

    const { rows } = await db.query(
      `INSERT INTO modules
         (id, course_id, title, order_index, content_type, content_url, source_type,
          duration_secs, source_metadata, processing_status, parent_module_id, item_type, section_title)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        randomUUID(), id, title, orderIndex,
        contentType ?? 'text', contentUrl,
        sourceType ?? contentType ?? 'text',
        durationSecs ?? null,
        sourceMetadata ? JSON.stringify(sourceMetadata) : null,
        processingStatus ?? 'ready',
        parentModuleId ?? null,
        itemType ?? 'content',
        sectionTitle ?? null,
      ],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // PATCH /courses/:courseId/modules/:moduleId — update module fields (title, aiSummary, transcript)
  app.patch('/:courseId/modules/:moduleId', async (req, reply) => {
    const { moduleId } = req.params as { courseId: string; moduleId: string }
    const { title, aiSummary, transcript } = req.body as {
      title?: string; aiSummary?: string; transcript?: string
    }
    const sets: string[] = []; const vals: unknown[] = []; let p = 1
    if (title !== undefined)      { sets.push(`title = $${p++}`);      vals.push(title) }
    if (aiSummary !== undefined)   { sets.push(`ai_summary = $${p++}`); vals.push(aiSummary) }
    if (transcript !== undefined)  { sets.push(`transcript = $${p++}`);  vals.push(transcript) }
    if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' })
    vals.push(moduleId)
    const { rows } = await db.query(
      `UPDATE modules SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`, vals,
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Module not found' })
    return { data: rows[0] }
  })

  // DELETE /courses/:courseId/modules/:moduleId — delete a module
  app.delete('/:courseId/modules/:moduleId', async (req, reply) => {
    const { courseId, moduleId } = req.params as { courseId: string; moduleId: string }
    // Delete associated quiz questions first
    await db.query('DELETE FROM quiz_questions WHERE module_id = $1', [moduleId])
    // Delete module progress
    await db.query('DELETE FROM module_progress WHERE module_id = $1', [moduleId])
    // Delete the module
    await db.query('DELETE FROM modules WHERE id = $1 AND course_id = $2', [moduleId, courseId])
    // Re-index remaining modules
    const { rows: remaining } = await db.query(
      'SELECT id FROM modules WHERE course_id = $1 ORDER BY order_index', [courseId],
    )
    for (let i = 0; i < remaining.length; i++) {
      await db.query('UPDATE modules SET order_index = $1 WHERE id = $2', [i, remaining[i].id])
    }
    return reply.status(204).send()
  })

  // POST /courses/:id/schedule — queue a drip auto-publish event
  app.post('/:id/schedule', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { release_days_from_now, org_id } = req.body as { release_days_from_now: number; org_id: string }

    if (!release_days_from_now || release_days_from_now < 1) {
      return reply.status(400).send({ error: 'release_days_from_now must be >= 1' })
    }

    const scheduledAt = new Date()
    scheduledAt.setDate(scheduledAt.getDate() + release_days_from_now)

    const { rows } = await db.query(
      `INSERT INTO course_schedules (id, course_id, org_id, scheduled_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [randomUUID(), id, org_id, scheduledAt.toISOString()],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // POST /courses/:id/prerequisite — store prerequisite in courses.metadata JSONB
  app.post('/:id/prerequisite', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { prerequisite_course_id } = req.body as { prerequisite_course_id: string }

    if (!prerequisite_course_id) {
      return reply.status(400).send({ error: 'prerequisite_course_id is required' })
    }

    await db.query(
      `UPDATE courses
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'),
         '{prerequisite_course_ids}',
         COALESCE(metadata->'prerequisite_course_ids', '[]') || $1::jsonb
       ), updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify([prerequisite_course_id]), id],
    )
    return { data: { course_id: id, prerequisite_course_id } }
  })

  // GET /learning-paths — list learning paths for an org
  app.get('/learning-paths', async (req) => {
    const { orgId } = req.query as Record<string, string>
    const { rows } = await db.query(
      `SELECT lp.*,
         (SELECT COUNT(*) FROM learning_path_courses lpc WHERE lpc.path_id = lp.id) AS course_count
       FROM learning_paths lp
       WHERE lp.org_id = $1
       ORDER BY lp.created_at DESC`,
      [orgId],
    )
    return { data: rows }
  })

  // POST /learning-paths — create a learning path with ordered courses and auto-prerequisite chain
  app.post('/learning-paths', async (req, reply) => {
    const { title, description, courseIds, skillTags, orgId, createdBy } = req.body as {
      title: string; description?: string; courseIds: string[]
      skillTags?: string[]; orgId: string; createdBy?: string
    }

    if (!title || !orgId || !courseIds?.length) {
      return reply.status(400).send({ error: 'title, orgId, and courseIds are required' })
    }

    const pathId = randomUUID()
    await db.query(
      `INSERT INTO learning_paths (id, org_id, title, description, skill_tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [pathId, orgId, title, description ?? '', skillTags ?? [], createdBy ?? null],
    )

    // Link courses with auto-prerequisite chain: each course requires the previous one
    for (let i = 0; i < courseIds.length; i++) {
      const prereqId = i > 0 ? courseIds[i - 1] : null
      await db.query(
        `INSERT INTO learning_path_courses (id, path_id, course_id, order_index, prerequisite_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), pathId, courseIds[i], i, prereqId],
      )
      // Also store prerequisite in the course's metadata for learner-side gating
      if (prereqId) {
        await db.query(
          `UPDATE courses
           SET metadata = jsonb_set(
             COALESCE(metadata, '{}'),
             '{prerequisite_course_ids}',
             COALESCE(metadata->'prerequisite_course_ids', '[]') || $1::jsonb
           ), updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify([prereqId]), courseIds[i]],
        )
      }
    }

    return reply.status(201).send({
      data: { id: pathId, title, course_count: courseIds.length, org_id: orgId },
    })
  })

  // PATCH /courses/:id — update course fields (title, description, skill_tags, thumbnail, metadata)
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { title, description, skillTags, thumbnailUrl, metadata, categoryId } = req.body as {
      title?: string; description?: string; skillTags?: string[]; thumbnailUrl?: string
      metadata?: Record<string, unknown>; categoryId?: string
    }

    const sets: string[] = []
    const values: unknown[] = []
    let p = 1

    if (title !== undefined)        { sets.push(`title = $${p++}`);         values.push(title) }
    if (description !== undefined)   { sets.push(`description = $${p++}`);   values.push(description) }
    if (skillTags !== undefined)     { sets.push(`skill_tags = $${p++}`);    values.push(skillTags) }
    if (thumbnailUrl !== undefined)  { sets.push(`thumbnail_url = $${p++}`); values.push(thumbnailUrl) }
    if (metadata !== undefined)      { sets.push(`metadata = COALESCE(metadata, '{}') || $${p++}::jsonb`); values.push(JSON.stringify(metadata)) }
    if (categoryId !== undefined)    { sets.push(`category_id = $${p++}`);   values.push(categoryId) }

    if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' })

    sets.push('updated_at = NOW()')
    values.push(id)

    const { rows } = await db.query(
      `UPDATE courses SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      values,
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Course not found' })
    return { data: rows[0] }
  })

  // PATCH /courses/:id/publish
  app.patch('/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(
      `UPDATE courses SET status = 'published', updated_at = NOW() WHERE id = $1 RETURNING *`, [id],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Course not found' })
    publishEvent('course.events', { event_type: 'course.published', course_id: id })
    return { data: rows[0] }
  })

  // DELETE /courses/:id
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.query(`UPDATE courses SET status = 'archived', updated_at = NOW() WHERE id = $1`, [id])
    return reply.status(204).send()
  })

  // ── Analytics ───────────────────────────────────────────────────────────

  // GET /analytics/overview?orgId=... — top-level stats
  app.get('/analytics/overview', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return { data: null }
    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM courses WHERE org_id = $1 AND status = 'published') AS total_courses,
         (SELECT COUNT(*)::int FROM enrollments WHERE org_id = $1 AND status != 'dropped') AS total_enrollments,
         (SELECT COUNT(*)::int FROM enrollments WHERE org_id = $1 AND status = 'completed') AS total_completions,
         (SELECT ROUND(COUNT(*) FILTER (WHERE status='completed')::decimal / NULLIF(COUNT(*),0) * 100, 1)
          FROM enrollments WHERE org_id = $1 AND status != 'dropped') AS completion_rate,
         (SELECT COALESCE(SUM(watch_time_secs), 0)::int FROM module_progress mp
          JOIN enrollments e ON e.user_id = mp.user_id AND e.course_id = mp.course_id
          WHERE e.org_id = $1) AS total_watch_time_secs,
         (SELECT COUNT(*)::int FROM module_progress mp
          JOIN modules m ON m.id = mp.module_id
          JOIN enrollments e ON e.user_id = mp.user_id AND e.course_id = mp.course_id
          WHERE e.org_id = $1
            AND (m.content_type = 'youtube_embed' OR m.content_type = 'video')
            AND mp.status != 'completed'
            AND mp.watch_time_secs > 0
            AND mp.watch_time_secs < COALESCE(m.duration_secs, 1) * 0.7) AS skip_count,
         (SELECT COUNT(*)::int FROM module_progress mp
          JOIN enrollments e ON e.user_id = mp.user_id AND e.course_id = mp.course_id
          WHERE e.org_id = $1
            AND (mp.status = 'completed' OR mp.watch_time_secs > 0)) AS total_module_interactions`,
      [orgId],
    )
    return { data: rows[0] }
  })

  // GET /analytics/courses?orgId=... — per-course analytics
  app.get('/analytics/courses', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return { data: [] }
    const { rows } = await db.query(
      `SELECT c.id, c.title, c.thumbnail_url, cat.name AS category_name,
         (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status != 'dropped') AS enrollments,
         (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'completed') AS completions,
         (SELECT ROUND(AVG(e.progress_pct), 1) FROM enrollments e WHERE e.course_id = c.id AND e.status != 'dropped') AS avg_progress,
         (SELECT COALESCE(SUM(mp.watch_time_secs), 0)::int FROM module_progress mp WHERE mp.course_id = c.id) AS total_watch_secs,
         (SELECT ROUND(AVG(r.rating), 1) FROM course_reviews r WHERE r.course_id = c.id) AS avg_rating,
         (SELECT COUNT(*)::int FROM module_progress mp
          JOIN modules m ON m.id = mp.module_id
          WHERE mp.course_id = c.id
            AND (m.content_type = 'youtube_embed' OR m.content_type = 'video')
            AND mp.status != 'completed'
            AND mp.watch_time_secs > 0
            AND mp.watch_time_secs < COALESCE(m.duration_secs, 1) * 0.7) AS skips
       FROM courses c
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE c.org_id = $1 AND c.status = 'published'
       ORDER BY enrollments DESC`,
      [orgId],
    )
    return { data: rows }
  })

  // GET /analytics/learners?orgId=... — per-learner analytics
  app.get('/analytics/learners', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return { data: [] }
    const { rows } = await db.query(
      `SELECT u.id, u.full_name, u.email,
         (SELECT COUNT(*)::int FROM enrollments e WHERE e.user_id = u.id AND e.org_id = $1 AND e.status != 'dropped') AS courses_enrolled,
         (SELECT COUNT(*)::int FROM enrollments e WHERE e.user_id = u.id AND e.org_id = $1 AND e.status = 'completed') AS courses_completed,
         (SELECT COALESCE(SUM(mp.watch_time_secs), 0)::int FROM module_progress mp
          JOIN enrollments e ON e.user_id = mp.user_id AND e.course_id = mp.course_id
          WHERE mp.user_id = u.id AND e.org_id = $1) AS total_watch_secs,
         (SELECT COUNT(*)::int FROM module_progress mp
          JOIN modules m ON m.id = mp.module_id
          JOIN enrollments e ON e.user_id = mp.user_id AND e.course_id = mp.course_id
          WHERE mp.user_id = u.id AND e.org_id = $1
            AND (m.content_type = 'youtube_embed' OR m.content_type = 'video')
            AND mp.status != 'completed'
            AND mp.watch_time_secs > 0
            AND mp.watch_time_secs < COALESCE(m.duration_secs, 1) * 0.7) AS modules_skipped,
         (SELECT MAX(e.last_accessed_at) FROM enrollments e WHERE e.user_id = u.id AND e.org_id = $1) AS last_active
       FROM users u
       WHERE u.org_id = $1 AND u.role IN ('learner', 'org_admin')
       ORDER BY total_watch_secs DESC`,
      [orgId],
    )
    return { data: rows }
  })

  // GET /analytics/categories?orgId=... — category engagement breakdown
  app.get('/analytics/categories', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return { data: [] }
    const { rows } = await db.query(
      `SELECT cat.id, cat.name, cat.icon,
         COUNT(DISTINCT c.id)::int AS course_count,
         COUNT(DISTINCT e.id)::int AS enrollment_count,
         COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END)::int AS completion_count,
         COALESCE(SUM(mp.watch_time_secs), 0)::int AS total_watch_secs
       FROM categories cat
       JOIN courses c ON c.category_id = cat.id AND c.org_id = $1
       LEFT JOIN enrollments e ON e.course_id = c.id AND e.status != 'dropped'
       LEFT JOIN module_progress mp ON mp.course_id = c.id AND mp.user_id = e.user_id
       WHERE cat.parent_id IS NULL
       GROUP BY cat.id, cat.name, cat.icon
       HAVING COUNT(DISTINCT c.id) > 0
       ORDER BY enrollment_count DESC`,
      [orgId],
    )
    return { data: rows }
  })

  // GET /analytics/activity?orgId=... — recent activity timeline
  app.get('/analytics/activity', async (req) => {
    const { orgId, limit = '20' } = req.query as { orgId?: string; limit?: string }
    if (!orgId) return { data: [] }
    const { rows } = await db.query(
      `(SELECT 'enrollment' AS type, e.enrolled_at AS timestamp, u.full_name, c.title AS course_title, NULL AS detail
        FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
        WHERE e.org_id = $1 ORDER BY e.enrolled_at DESC LIMIT $2)
       UNION ALL
       (SELECT 'completion' AS type, e.completed_at AS timestamp, u.full_name, c.title AS course_title, NULL AS detail
        FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
        WHERE e.org_id = $1 AND e.status = 'completed' AND e.completed_at IS NOT NULL
        ORDER BY e.completed_at DESC LIMIT $2)
       UNION ALL
       (SELECT 'review' AS type, r.created_at AS timestamp, u.full_name, c.title AS course_title,
               r.rating::text AS detail
        FROM course_reviews r JOIN users u ON u.id = r.user_id JOIN courses c ON c.id = r.course_id
        WHERE c.org_id = $1 ORDER BY r.created_at DESC LIMIT $2)
       ORDER BY timestamp DESC LIMIT $2`,
      [orgId, Number(limit)],
    )
    return { data: rows }
  })

  // ── Reviews / Ratings ────────────────────────────────────────────────────

  // GET /courses/:id/reviews — list reviews for a course
  app.get('/:id/reviews', async (req) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(
      `SELECT r.*, u.full_name, u.email
       FROM course_reviews r JOIN users u ON u.id = r.user_id
       WHERE r.course_id = $1
       ORDER BY r.created_at DESC`,
      [id],
    )
    // Aggregate stats
    const { rows: stats } = await db.query(
      `SELECT COUNT(*)::int AS total_reviews,
              ROUND(AVG(rating), 1) AS avg_rating,
              COUNT(*) FILTER (WHERE rating = 5)::int AS five,
              COUNT(*) FILTER (WHERE rating = 4)::int AS four,
              COUNT(*) FILTER (WHERE rating = 3)::int AS three,
              COUNT(*) FILTER (WHERE rating = 2)::int AS two,
              COUNT(*) FILTER (WHERE rating = 1)::int AS one
       FROM course_reviews WHERE course_id = $1`,
      [id],
    )
    return { data: { reviews: rows, stats: stats[0] } }
  })

  // POST /courses/:id/reviews — submit or update a review
  app.post('/:id/reviews', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { userId, rating, reviewText } = req.body as {
      userId: string; rating: number; reviewText?: string
    }
    if (!rating || rating < 1 || rating > 5) {
      return reply.status(400).send({ error: 'Rating must be 1-5' })
    }
    const { rows } = await db.query(
      `INSERT INTO course_reviews (course_id, user_id, rating, review_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (course_id, user_id)
       DO UPDATE SET rating = $3, review_text = $4, updated_at = NOW()
       RETURNING *`,
      [id, userId, rating, reviewText ?? null],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // GET /courses/:id/stats — quick stats for course cards (rating, enrollment count, total duration)
  app.get('/:id/stats', async (req) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(
      `SELECT
         (SELECT ROUND(AVG(rating), 1) FROM course_reviews WHERE course_id = $1) AS avg_rating,
         (SELECT COUNT(*)::int FROM course_reviews WHERE course_id = $1) AS review_count,
         (SELECT COUNT(*)::int FROM enrollments WHERE course_id = $1 AND status != 'dropped') AS enrollment_count,
         (SELECT COALESCE(SUM(duration_secs), 0)::int FROM modules WHERE course_id = $1) AS total_duration_secs`,
      [id],
    )
    return { data: rows[0] }
  })

  // ── Full-Text Search ────────────────────────────────────────────────────

  // GET /search?q=...&orgId=... — search courses + modules + transcripts
  app.get('/search', async (req) => {
    const { q, orgId, limit = '20' } = req.query as { q?: string; orgId?: string; limit?: string }
    if (!q || !orgId) return { data: { courses: [], modules: [] } }

    const tsQuery = q.trim().split(/\s+/).map((w) => w + ':*').join(' & ')

    // Search courses
    const { rows: courseResults } = await db.query(
      `SELECT c.id, c.title, c.description, c.thumbnail_url, c.status,
              ts_rank(c.search_vector, to_tsquery('english', $1)) AS rank,
              cat.name AS category_name
       FROM courses c
       LEFT JOIN categories cat ON cat.id = c.category_id
       WHERE c.org_id = $2 AND c.search_vector @@ to_tsquery('english', $1)
       ORDER BY rank DESC LIMIT $3`,
      [tsQuery, orgId, Number(limit)],
    )

    // Search modules (including transcripts)
    const { rows: moduleResults } = await db.query(
      `SELECT m.id, m.title, m.course_id, m.content_type,
              c.title AS course_title, c.thumbnail_url AS course_thumbnail,
              ts_rank(m.search_vector, to_tsquery('english', $1)) AS rank,
              ts_headline('english', COALESCE(m.transcript, m.title), to_tsquery('english', $1),
                'MaxWords=30, MinWords=10, StartSel=<mark>, StopSel=</mark>') AS snippet
       FROM modules m
       JOIN courses c ON c.id = m.course_id
       WHERE c.org_id = $2 AND m.search_vector @@ to_tsquery('english', $1)
       ORDER BY rank DESC LIMIT $3`,
      [tsQuery, orgId, Number(limit)],
    )

    return { data: { courses: courseResults, modules: moduleResults } }
  })

  // ── Discussion Forums ───────────────────────────────────────────────────

  // GET /courses/:id/discussions — list threads for a course
  app.get('/:id/discussions', async (req) => {
    const { id } = req.params as { id: string }
    const { moduleId } = req.query as { moduleId?: string }
    let query = `SELECT d.*, u.full_name, u.email
       FROM discussions d JOIN users u ON u.id = d.user_id
       WHERE d.course_id = $1`
    const params: unknown[] = [id]
    if (moduleId) { query += ' AND d.module_id = $2'; params.push(moduleId) }
    query += ' ORDER BY d.is_pinned DESC, d.created_at DESC'
    const { rows } = await db.query(query, params)
    return { data: rows }
  })

  // POST /courses/:id/discussions — create a discussion thread
  app.post('/:id/discussions', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { userId, moduleId, title, body } = req.body as {
      userId: string; moduleId?: string; title: string; body: string
    }
    if (!title || !body) return reply.status(400).send({ error: 'title and body required' })
    const { rows } = await db.query(
      `INSERT INTO discussions (course_id, module_id, user_id, title, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, moduleId ?? null, userId, title, body],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // GET /discussions/:discussionId/replies — list replies
  app.get('/discussions/:discussionId/replies', async (req) => {
    const { discussionId } = req.params as { discussionId: string }
    const { rows } = await db.query(
      `SELECT r.*, u.full_name, u.email
       FROM discussion_replies r JOIN users u ON u.id = r.user_id
       WHERE r.discussion_id = $1 ORDER BY r.created_at ASC`,
      [discussionId],
    )
    return { data: rows }
  })

  // POST /discussions/:discussionId/replies — add a reply
  app.post('/discussions/:discussionId/replies', async (req, reply) => {
    const { discussionId } = req.params as { discussionId: string }
    const { userId, body, isInstructor } = req.body as {
      userId: string; body: string; isInstructor?: boolean
    }
    if (!body) return reply.status(400).send({ error: 'body required' })
    const { rows } = await db.query(
      `INSERT INTO discussion_replies (discussion_id, user_id, body, is_instructor)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [discussionId, userId, body, isInstructor ?? false],
    )
    // Update reply count
    await db.query(
      'UPDATE discussions SET reply_count = reply_count + 1, updated_at = NOW() WHERE id = $1',
      [discussionId],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // ── Assignments ─────────────────────────────────────────────────────────

  // GET /courses/:id/assignments — list assignments for a course
  app.get('/:id/assignments', async (req) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(
      'SELECT * FROM assignments WHERE course_id = $1 ORDER BY created_at DESC',
      [id],
    )
    return { data: rows }
  })

  // POST /courses/:id/assignments — create an assignment (admin/instructor)
  app.post('/:id/assignments', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { moduleId, title, description, maxScore, dueDate } = req.body as {
      moduleId?: string; title: string; description?: string; maxScore?: number; dueDate?: string
    }
    if (!title) return reply.status(400).send({ error: 'title required' })
    const { rows } = await db.query(
      `INSERT INTO assignments (course_id, module_id, title, description, max_score, due_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, moduleId ?? null, title, description ?? '', maxScore ?? 100, dueDate ?? null],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // POST /assignments/:assignmentId/submit — learner submits work
  app.post('/assignments/:assignmentId/submit', async (req, reply) => {
    const { assignmentId } = req.params as { assignmentId: string }
    const { userId, fileUrl, textContent } = req.body as {
      userId: string; fileUrl?: string; textContent?: string
    }
    if (!fileUrl && !textContent) return reply.status(400).send({ error: 'fileUrl or textContent required' })
    const { rows } = await db.query(
      `INSERT INTO assignment_submissions (assignment_id, user_id, file_url, text_content, status)
       VALUES ($1, $2, $3, $4, 'submitted')
       ON CONFLICT (assignment_id, user_id)
       DO UPDATE SET file_url = COALESCE($3, assignment_submissions.file_url),
                     text_content = COALESCE($4, assignment_submissions.text_content),
                     status = 'submitted', submitted_at = NOW()
       RETURNING *`,
      [assignmentId, userId, fileUrl ?? null, textContent ?? null],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // POST /assignments/:assignmentId/grade — instructor grades submission
  app.post('/assignments/:assignmentId/grade', async (req, reply) => {
    const { assignmentId } = req.params as { assignmentId: string }
    const { userId, score, feedback, gradedBy } = req.body as {
      userId: string; score: number; feedback?: string; gradedBy: string
    }
    const { rows } = await db.query(
      `UPDATE assignment_submissions
       SET score = $1, feedback = $2, graded_by = $3, status = 'graded', graded_at = NOW()
       WHERE assignment_id = $4 AND user_id = $5 RETURNING *`,
      [score, feedback ?? '', gradedBy, assignmentId, userId],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Submission not found' })
    return { data: rows[0] }
  })

  // GET /assignments/:assignmentId/submissions — list all submissions (instructor view)
  app.get('/assignments/:assignmentId/submissions', async (req) => {
    const { assignmentId } = req.params as { assignmentId: string }
    const { rows } = await db.query(
      `SELECT s.*, u.full_name, u.email
       FROM assignment_submissions s JOIN users u ON u.id = s.user_id
       WHERE s.assignment_id = $1 ORDER BY s.submitted_at DESC`,
      [assignmentId],
    )
    return { data: rows }
  })

  // ── Live Cohort Sessions ────────────────────────────────────────────────

  // GET /courses/:id/sessions — list live sessions
  app.get('/:id/sessions', async (req) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(
      `SELECT s.*, u.full_name AS host_name,
        (SELECT COUNT(*)::int FROM live_session_attendees a WHERE a.session_id = s.id) AS attendee_count
       FROM live_sessions s LEFT JOIN users u ON u.id = s.host_user_id
       WHERE s.course_id = $1 ORDER BY s.scheduled_at ASC`,
      [id],
    )
    return { data: rows }
  })

  // POST /courses/:id/sessions — schedule a live session
  app.post('/:id/sessions', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { title, description, meetingUrl, meetingProvider, scheduledAt, durationMins, hostUserId } = req.body as {
      title: string; description?: string; meetingUrl: string; meetingProvider?: string
      scheduledAt: string; durationMins?: number; hostUserId?: string
    }
    const { rows } = await db.query(
      `INSERT INTO live_sessions (course_id, title, description, meeting_url, meeting_provider, scheduled_at, duration_mins, host_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, title, description ?? '', meetingUrl, meetingProvider ?? 'zoom', scheduledAt, durationMins ?? 60, hostUserId ?? null],
    )
    return reply.status(201).send({ data: rows[0] })
  })

  // POST /sessions/:sessionId/rsvp — register for a live session
  app.post('/sessions/:sessionId/rsvp', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const { userId } = req.body as { userId: string }
    const { rows } = await db.query(
      `INSERT INTO live_session_attendees (session_id, user_id, rsvp_status)
       VALUES ($1, $2, 'registered')
       ON CONFLICT (session_id, user_id) DO NOTHING RETURNING *`,
      [sessionId, userId],
    )
    return reply.status(201).send({ data: rows[0] ?? { already_registered: true } })
  })

  // ── Peer Review ─────────────────────────────────────────────────────────

  // GET /assignments/:assignmentId/peer-reviews?userId=... — get peer reviews assigned to me
  app.get('/assignments/:assignmentId/peer-reviews', async (req) => {
    const { assignmentId } = req.params as { assignmentId: string }
    const { userId } = req.query as { userId?: string }
    let query = `SELECT pr.*, u.full_name AS author_name, sub.text_content, sub.file_url
       FROM peer_reviews pr
       JOIN assignment_submissions sub ON sub.id = pr.submission_id
       JOIN users u ON u.id = sub.user_id
       WHERE sub.assignment_id = $1`
    const params: unknown[] = [assignmentId]
    if (userId) { query += ' AND pr.reviewer_id = $2'; params.push(userId) }
    query += ' ORDER BY pr.created_at DESC'
    const { rows } = await db.query(query, params)
    return { data: rows }
  })

  // POST /assignments/:assignmentId/assign-reviews — auto-assign peer reviews
  app.post('/assignments/:assignmentId/assign-reviews', async (req, reply) => {
    const { assignmentId } = req.params as { assignmentId: string }
    const { reviewsPerSubmission } = req.body as { reviewsPerSubmission?: number }
    const count = reviewsPerSubmission ?? 3

    // Get all submissions
    const { rows: subs } = await db.query(
      'SELECT id, user_id FROM assignment_submissions WHERE assignment_id = $1',
      [assignmentId],
    )
    if (subs.length < 2) return reply.status(400).send({ error: 'Need at least 2 submissions for peer review' })

    let assigned = 0
    for (const sub of subs) {
      // Assign reviewers (other students, not self)
      const others = subs.filter((s: { user_id: string }) => s.user_id !== sub.user_id)
      const reviewers = others.slice(0, count)
      for (const reviewer of reviewers) {
        await db.query(
          `INSERT INTO peer_reviews (submission_id, reviewer_id, status)
           VALUES ($1, $2, 'pending')
           ON CONFLICT (submission_id, reviewer_id) DO NOTHING`,
          [sub.id, reviewer.user_id],
        )
        assigned++
      }
    }
    return { data: { assigned } }
  })

  // POST /peer-reviews/:reviewId/complete — submit a peer review
  app.post('/peer-reviews/:reviewId/complete', async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string }
    const { score, feedback, rubricScores } = req.body as {
      score: number; feedback?: string; rubricScores?: Record<string, number>
    }
    const { rows } = await db.query(
      `UPDATE peer_reviews SET score = $1, feedback = $2, rubric_scores = $3,
              status = 'completed', completed_at = NOW()
       WHERE id = $4 RETURNING *`,
      [score, feedback ?? '', JSON.stringify(rubricScores ?? {}), reviewId],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Review not found' })
    return { data: rows[0] }
  })

  // ── AI Analytics Insights ───────────────────────────────────────────────

  // POST /analytics/generate-insights?orgId=... — generate AI insights from data
  app.post('/analytics/generate-insights', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return { data: [] }

    // Gather key metrics
    const { rows: metrics } = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM enrollments WHERE org_id = $1 AND status = 'active') AS active_learners,
        (SELECT COUNT(*)::int FROM enrollments WHERE org_id = $1 AND status = 'completed') AS completions,
        (SELECT ROUND(AVG(progress_pct), 1) FROM enrollments WHERE org_id = $1 AND status = 'active') AS avg_progress,
        (SELECT COUNT(*)::int FROM module_progress mp
         JOIN enrollments e ON e.user_id = mp.user_id AND e.course_id = mp.course_id
         JOIN modules m ON m.id = mp.module_id
         WHERE e.org_id = $1 AND mp.status != 'completed'
           AND (m.content_type = 'youtube_embed' OR m.content_type = 'video')
           AND mp.watch_time_secs > 0
           AND mp.watch_time_secs < COALESCE(m.duration_secs, 1) * 0.7) AS skip_count,
        (SELECT c.title FROM courses c
         JOIN enrollments e ON e.course_id = c.id
         WHERE c.org_id = $1 AND e.status = 'active'
         GROUP BY c.id, c.title ORDER BY AVG(e.progress_pct) ASC LIMIT 1) AS lowest_progress_course,
        (SELECT ROUND(AVG(qa.score_pct), 1) FROM quiz_attempts qa
         JOIN courses c ON c.id = qa.course_id WHERE c.org_id = $1) AS avg_quiz_score
    `, [orgId])

    const m = metrics[0] ?? {}
    const insights: Array<{ type: string; title: string; body: string; severity: string }> = []

    // Generate insights based on data
    if (m.skip_count > 0) {
      insights.push({
        type: 'skip_alert',
        title: `${m.skip_count} modules skipped`,
        body: `${m.skip_count} video modules have been partially watched but not completed. Learners may be skipping content. Consider shorter modules or more engaging content.`,
        severity: m.skip_count > 10 ? 'warning' : 'info',
      })
    }

    if (m.avg_progress && Number(m.avg_progress) < 50) {
      insights.push({
        type: 'low_engagement',
        title: 'Low average progress',
        body: `Active learners are only ${m.avg_progress}% through their courses on average. Consider sending reminder notifications or breaking courses into smaller chunks.`,
        severity: 'warning',
      })
    }

    if (m.lowest_progress_course) {
      insights.push({
        type: 'struggling_course',
        title: `"${m.lowest_progress_course}" has the lowest completion`,
        body: `This course has the lowest average progress among active learners. Review module difficulty, length, and quiz pass rates.`,
        severity: 'info',
      })
    }

    if (m.avg_quiz_score && Number(m.avg_quiz_score) < 60) {
      insights.push({
        type: 'quiz_difficulty',
        title: `Average quiz score is ${m.avg_quiz_score}%`,
        body: `Quiz scores are below 60% average. Questions may be too difficult or content isn't preparing learners well enough. Consider reviewing quiz alignment with module content.`,
        severity: 'warning',
      })
    }

    if (m.completions > 0) {
      insights.push({
        type: 'positive',
        title: `${m.completions} course completions!`,
        body: `${m.completions} learners have completed their courses. Great progress! Consider sending congratulations and recommending next courses.`,
        severity: 'success',
      })
    }

    // Store insights in DB
    for (const insight of insights) {
      await db.query(
        `INSERT INTO ai_insights (org_id, insight_type, title, body, severity, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
         ON CONFLICT DO NOTHING`,
        [orgId, insight.type, insight.title, insight.body, insight.severity],
      ).catch(() => {})
    }

    return { data: insights }
  })

  // GET /analytics/insights?orgId=... — get stored AI insights
  app.get('/analytics/insights', async (req) => {
    const { orgId } = req.query as { orgId?: string }
    if (!orgId) return { data: [] }
    const { rows } = await db.query(
      `SELECT * FROM ai_insights WHERE org_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 10`,
      [orgId],
    )
    return { data: rows }
  })
}

// Simple fire-and-forget Kafka publish (full KafkaJS setup in production)
function publishEvent(topic: string, payload: Record<string, unknown>) {
  console.log(`[KAFKA] ${topic}:`, JSON.stringify(payload))
  // TODO: Replace with actual KafkaJS producer in Phase 1.4
}

export default courseRoutes
