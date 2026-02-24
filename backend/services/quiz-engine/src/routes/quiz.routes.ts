import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'crypto'
import { db, ai } from '../index'
import httpx from 'axios'

const USER_SERVICE   = process.env.USER_SERVICE_URL   ?? 'http://localhost:3001'
const BADGE_SERVICE  = process.env.BADGE_SERVICE_URL  ?? 'http://localhost:3005'
const CERT_SERVICE   = process.env.CERT_SERVICE_URL   ?? 'http://localhost:3006'
const NOTIFY_SERVICE = process.env.NOTIFY_SERVICE_URL ?? 'http://localhost:3007'

const GENERATE_PROMPT = (content: string, numQuestions: number) => `
You are an expert instructional designer. Based on the following course content, generate exactly ${numQuestions} multiple-choice quiz questions.

CONTENT:
${content}

Return a JSON array with this exact structure (no other text):
[
  {
    "question_text": "What is...?",
    "options": [
      { "text": "Option A", "is_correct": true },
      { "text": "Option B", "is_correct": false },
      { "text": "Option C", "is_correct": false },
      { "text": "Option D", "is_correct": false }
    ],
    "explanation": "Because...",
    "difficulty": 0.5,
    "skill_tags": ["tag1", "tag2"]
  }
]
`

const quizRoutes: FastifyPluginAsync = async (app) => {

  // POST /quiz/generate — AI generates questions from content
  app.post('/generate', async (req, reply) => {
    const { moduleId, courseId, contentText, numQuestions = 5, difficulty = 0.5 } = req.body as {
      moduleId?: string; courseId: string; contentText: string; numQuestions?: number; difficulty?: number
    }

    if (!contentText || contentText.length < 50) {
      return reply.status(400).send({ error: 'Content text too short to generate questions' })
    }

    try {
      const response = await ai.chat.completions.create({
        model:       process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5-chat',
        messages:    [{ role: 'user', content: GENERATE_PROMPT(contentText.slice(0, 8000), numQuestions) }],
        temperature: 0.3,
        max_tokens:  3000,
      })

      const raw = response.choices[0].message.content ?? '[]'
      const json = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const questions = JSON.parse(json) as Array<{
        question_text: string
        options: Array<{ text: string; is_correct: boolean }>
        explanation: string
        difficulty: number
        skill_tags: string[]
      }>

      const saved = []
      for (const q of questions) {
        const correctAnswer = q.options.find((o) => o.is_correct)?.text ?? ''
        const { rows } = await db.query(
          `INSERT INTO quiz_questions
           (id, course_id, module_id, question_text, question_type, options, correct_answer, explanation, difficulty, skill_tags, ai_generated)
           VALUES ($1,$2,$3,$4,'multiple_choice',$5,$6,$7,$8,$9,true) RETURNING *`,
          [randomUUID(), courseId, moduleId, q.question_text, JSON.stringify(q.options), correctAnswer, q.explanation, q.difficulty ?? difficulty, q.skill_tags ?? []],
        )
        saved.push(rows[0])
      }

      return reply.status(201).send({ data: saved, count: saved.length })
    } catch (err) {
      app.log.error(err, 'Failed to generate quiz questions')
      return reply.status(500).send({ error: 'Failed to generate questions. Check Azure OpenAI config.' })
    }
  })

  // GET /quiz/:moduleId — get questions for a module (answers stripped, randomized)
  app.get('/:moduleId', async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string }
    const { rows } = await db.query(
      'SELECT id, question_text, question_type, options, difficulty FROM quiz_questions WHERE module_id = $1',
      [moduleId],
    )
    // Randomize question order + option order (prevents memorization)
    const shuffled = rows
      .map((q) => ({ ...q, _sort: Math.random() }))
      .sort((a, b) => a._sort - b._sort)

    const sanitized = shuffled.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      difficulty: q.difficulty,
      // Shuffle options too
      options: (q.options as Array<{ text: string; is_correct: boolean }>)
        .map((o) => ({ text: o.text, _sort: Math.random() }))
        .sort((a, b) => a._sort - b._sort)
        .map((o) => ({ text: o.text })),
    }))
    return { data: sanitized }
  })

  // GET /quiz/leaderboard?orgId=...&limit=10 — top learners by XP
  app.get('/leaderboard', async (req) => {
    const { orgId, limit = '10' } = req.query as Record<string, string>
    const { rows } = await db.query(
      orgId
        ? `SELECT user_id, full_name, total_xp, rank FROM leaderboard WHERE org_id = $1 ORDER BY rank LIMIT $2`
        : `SELECT user_id, full_name, total_xp, rank FROM leaderboard ORDER BY total_xp DESC LIMIT $1`,
      orgId ? [orgId, Number(limit)] : [Number(limit)],
    )
    return { data: rows }
  })

  // GET /quiz/xp/:userId — get total XP + recent history
  app.get('/xp/:userId', async (req) => {
    const { userId } = req.params as { userId: string }
    const { rows: total } = await db.query(
      'SELECT COALESCE(SUM(xp), 0) AS total_xp FROM user_xp WHERE user_id = $1',
      [userId],
    )
    const { rows: history } = await db.query(
      'SELECT source, xp, earned_at FROM user_xp WHERE user_id = $1 ORDER BY earned_at DESC LIMIT 20',
      [userId],
    )
    return { data: { totalXp: Number(total[0].total_xp), history } }
  })

  // GET /quiz/course/:courseId — get all questions for a course
  app.get('/course/:courseId', async (req) => {
    const { courseId } = req.params as { courseId: string }
    const { rows } = await db.query(
      'SELECT id, module_id, question_text, question_type, options, difficulty FROM quiz_questions WHERE course_id = $1 ORDER BY created_at',
      [courseId],
    )
    return { data: rows }
  })

  // POST /quiz/:moduleId/attempt — submit answers, get score, trigger completion chain
  app.post('/:moduleId/attempt', async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string }
    const { userId, courseId, answers } = req.body as {
      userId: string
      courseId?: string
      answers: Array<{ questionId: string; selectedAnswer: string }>
    }

    // ── Quiz attempt limits + cooldown ─────────────────────────────────────
    if (courseId) {
      // Get course quiz config
      const { rows: courseConfig } = await db.query(
        'SELECT max_quiz_attempts, quiz_cooldown_mins FROM courses WHERE id = $1',
        [courseId],
      )
      const maxAttempts = courseConfig[0]?.max_quiz_attempts ?? 3
      const cooldownMins = courseConfig[0]?.quiz_cooldown_mins ?? 30

      // Count existing attempts for this user + module
      const { rows: attemptCount } = await db.query(
        'SELECT COUNT(*)::int AS cnt FROM quiz_attempts WHERE user_id = $1 AND module_id = $2',
        [userId, moduleId],
      )
      if (Number(attemptCount[0]?.cnt) >= maxAttempts) {
        return reply.status(429).send({
          error: 'Max attempts reached',
          message: `You've used all ${maxAttempts} attempts for this quiz. Contact your instructor for a reset.`,
          attemptsUsed: Number(attemptCount[0].cnt),
          maxAttempts,
        })
      }

      // Check cooldown since last attempt
      const { rows: lastAttempt } = await db.query(
        'SELECT attempted_at FROM quiz_attempts WHERE user_id = $1 AND module_id = $2 ORDER BY attempted_at DESC LIMIT 1',
        [userId, moduleId],
      )
      if (lastAttempt[0]) {
        const lastTime = new Date(lastAttempt[0].attempted_at).getTime()
        const cooldownMs = cooldownMins * 60 * 1000
        const elapsed = Date.now() - lastTime
        if (elapsed < cooldownMs) {
          const waitMins = Math.ceil((cooldownMs - elapsed) / 60000)
          return reply.status(429).send({
            error: 'Cooldown active',
            message: `Please wait ${waitMins} minute${waitMins > 1 ? 's' : ''} before retrying. Use this time to review the module content.`,
            waitMinutes: waitMins,
          })
        }
      }
    }

    const { rows: questions } = await db.query(
      'SELECT id, correct_answer, explanation FROM quiz_questions WHERE module_id = $1',
      [moduleId],
    )

    let correct = 0
    const results = answers.map((a) => {
      const q = questions.find((q) => q.id === a.questionId)
      const isCorrect = q?.correct_answer === a.selectedAnswer
      if (isCorrect) correct++
      return { questionId: a.questionId, correct: isCorrect, explanation: q?.explanation }
    })

    const scorePct = answers.length > 0 ? (correct / answers.length) * 100 : 0
    const passed = scorePct >= 70

    // Identify weak topics from incorrect answers (for adaptive learning)
    const weakTopics: string[] = []
    const wrongQuestionIds: string[] = []
    for (const r of results) {
      if (!r.correct) {
        const q = questions.find((q) => q.id === r.questionId)
        if (q?.skill_tags) weakTopics.push(...(q.skill_tags as string[]))
        wrongQuestionIds.push(r.questionId)
      }
    }
    const uniqueWeakTopics = [...new Set(weakTopics)]

    // Find recommended modules to review (modules that cover weak topics)
    let recommendedModules: string[] = []
    if (!passed && courseId && uniqueWeakTopics.length > 0) {
      try {
        const { rows: recMods } = await db.query(
          `SELECT DISTINCT m.id FROM modules m
           JOIN quiz_questions qq ON qq.module_id = m.id
           WHERE m.course_id = $1 AND m.id != $2
             AND qq.skill_tags && $3::text[]
           LIMIT 3`,
          [courseId, moduleId, uniqueWeakTopics],
        )
        recommendedModules = recMods.map((r: { id: string }) => r.id)
      } catch { /* ignore */ }
    }

    // Save attempt with adaptive learning data
    const { rows } = await db.query(
      `INSERT INTO quiz_attempts (id, user_id, course_id, module_id, answers, score_pct, passed, weak_topics, recommended_modules, attempted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id`,
      [randomUUID(), userId, courseId ?? null, moduleId, JSON.stringify(results), scorePct, passed,
       uniqueWeakTopics.length > 0 ? uniqueWeakTopics : null,
       recommendedModules.length > 0 ? recommendedModules : null],
    )

    // Award XP for passing (non-blocking)
    if (passed) {
      const xpAmount = Math.round(10 + (scorePct / 100) * 20) // 10-30 XP based on score
      db.query(
        `INSERT INTO user_xp (id, user_id, source, xp, ref_id)
         VALUES ($1, $2, 'quiz_pass', $3, $4)`,
        [randomUUID(), userId, xpAmount, rows[0].id],
      ).catch(() => {})
    }

    // Fire completion chain async (non-blocking)
    if (passed && courseId) {
      triggerCompletionChain(userId, courseId, moduleId, app.log).catch((err) =>
        app.log.error(err, 'Completion chain error'),
      )
    }

    return {
      data: {
        attemptId: rows[0].id,
        scorePct:  Math.round(scorePct),
        passed,
        correct,
        total:     answers.length,
        results,
        // Adaptive learning: help learners improve
        ...((!passed && uniqueWeakTopics.length > 0) && {
          weakTopics: uniqueWeakTopics,
          recommendedModules,
          adaptiveMessage: `You struggled with: ${uniqueWeakTopics.join(', ')}. Review the recommended modules before retrying.`,
        }),
      },
    }
  })
}

// ─── Completion chain ──────────────────────────────────────────────────────────
// Called async after a passing quiz attempt.
// 1. Check if all modules in the course have been passed
// 2. If yes, mark enrollment as complete, issue badge, issue cert, send notification

async function triggerCompletionChain(
  userId: string,
  courseId: string,
  _moduleId: string,
  log: { info: (msg: string) => void; error: (err: unknown, msg: string) => void },
) {
  try {
    // Count modules in course
    const { rows: modulesRows } = await db.query(
      'SELECT id FROM modules WHERE course_id = $1',
      [courseId],
    )
    const moduleIds = modulesRows.map((m: { id: string }) => m.id)
    if (moduleIds.length === 0) return

    // Count distinct modules this user has PASSED
    const { rows: passedRows } = await db.query(
      `SELECT COUNT(DISTINCT module_id) AS cnt
       FROM quiz_attempts
       WHERE user_id = $1 AND course_id = $2 AND passed = true AND module_id = ANY($3::uuid[])`,
      [userId, courseId, moduleIds],
    )
    const passedCount = Number(passedRows[0].cnt)
    const progress = Math.round((passedCount / moduleIds.length) * 100)

    // Update enrollment progress
    const { rows: enrollRows } = await db.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [userId, courseId],
    )
    if (enrollRows[0]) {
      await httpx.patch(`${USER_SERVICE}/enrollments/${enrollRows[0].id}/progress`, { progress })
    }

    // If all modules passed → full course completion flow
    if (passedCount < moduleIds.length) return

    log.info(`[completion] User ${userId} completed course ${courseId} — issuing badge + cert`)

    // Fetch user + course details for notification
    const { rows: userRows } = await db.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [userId],
    )
    const { rows: courseRows } = await db.query(
      'SELECT title, org_id FROM courses WHERE id = $1',
      [courseId],
    )
    if (!userRows[0] || !courseRows[0]) return

    const userEmail = userRows[0].email
    const userName  = userRows[0].full_name
    const courseTitle = courseRows[0].title
    const orgId = courseRows[0].org_id

    // Issue badge (if one is configured for this course)
    try {
      const { data: badgesRes } = await httpx.get(`${BADGE_SERVICE}/badges?orgId=${orgId}`)
      const badges: Array<{ id: string; name: string; assertion_url: string }> = badgesRes?.data ?? []
      if (badges.length > 0) {
        const badge = badges[0]
        const { data: issuedBadge } = await httpx.post(`${BADGE_SERVICE}/badges/${badge.id}/issue`, {
          userId,
          courseId,
        })
        // Notify
        await httpx.post(`${NOTIFY_SERVICE}/notifications/badge-issued`, {
          userEmail,
          userName,
          badgeName: badge.name,
          assertionUrl: issuedBadge?.data?.assertion_url ?? '',
        }).catch(() => {})
      }
    } catch { /* badge not configured — skip */ }

    // Issue certificate (if one is configured for this course)
    try {
      const { data: certsRes } = await httpx.get(`${CERT_SERVICE}/certificates/me?user_id=${userId}`)
      const existingCerts: Array<{ id: string }> = certsRes?.data ?? []
      // Find the certificate template for this course
      const { rows: certTemplateRows } = await db.query(
        'SELECT id FROM certificates WHERE course_id = $1 LIMIT 1',
        [courseId],
      )
      if (certTemplateRows[0] && !existingCerts.find((c) => c.id === certTemplateRows[0].id)) {
        const { data: issuedCert } = await httpx.post(`${CERT_SERVICE}/certificates/issue`, {
          user_id:        userId,
          course_id:      courseId,
          certificate_id: certTemplateRows[0].id,
          user_name:      userName,
          course_title:   courseTitle,
          org_name:       'Learning Academy',
        })
        // Notify
        await httpx.post(`${NOTIFY_SERVICE}/notifications/cert-issued`, {
          userEmail,
          userName,
          courseTitle,
          verifyUrl: issuedCert?.data?.verify_url ?? '',
          pdfUrl:    issuedCert?.data?.pdf_url ?? '',
        }).catch(() => {})
      }
    } catch { /* cert not configured — skip */ }

  } catch (err) {
    log.error(err, 'Completion chain failed')
  }
}

export default quizRoutes
