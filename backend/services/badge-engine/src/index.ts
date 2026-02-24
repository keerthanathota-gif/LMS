import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Pool } from 'pg'
import { randomUUID } from 'crypto'

const app = Fastify({
  logger: { level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } },
})
const db = new Pool({ connectionString: process.env.DATABASE_URL })

// ── SVG Badge Generator ────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Generate a beautiful SVG badge image.
 * Tier is inferred from skillTags: completion | excellence | series | milestone
 */
function generateBadgeSVG(name: string, skillTags: string[]): string {
  const tier =
    skillTags.includes('excellence') ? 'excellence'
    : skillTags.includes('series')   ? 'series'
    : skillTags.includes('milestone') ? 'milestone'
    : 'completion'

  type TierCfg = {
    inner: string; outer: string; ring: string; icon: string; label: string
  }

  const cfgs: Record<string, TierCfg> = {
    // Gold — completion — checkmark
    completion: {
      inner: '#fbbf24', outer: '#b45309', ring: 'rgba(251,191,36,0.45)',
      label: 'COMPLETION',
      icon: `<path d="M70,88 L90,108 L132,66" stroke="rgba(255,255,255,0.95)" stroke-width="9"
               fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    // Purple — excellence — 5-pointed star
    excellence: {
      inner: '#c084fc', outer: '#6b21a8', ring: 'rgba(192,132,252,0.45)',
      label: 'EXCELLENCE',
      icon: `<polygon points="100,42 109,67 136,67 115,83 123,108 100,93 77,108 85,83 64,67 91,67"
               fill="rgba(255,255,255,0.95)"/>`,
    },
    // Emerald — series — trophy
    series: {
      inner: '#34d399', outer: '#065f46', ring: 'rgba(52,211,153,0.45)',
      label: 'SERIES',
      icon: `<path d="M74,62 L74,94 Q74,112 100,112 Q126,112 126,94 L126,62 Z"
               fill="rgba(255,255,255,0.92)"/>
             <path d="M74,72 Q55,72 55,89 Q55,106 74,101"
               stroke="rgba(255,255,255,0.92)" stroke-width="5" fill="none" stroke-linecap="round"/>
             <path d="M126,72 Q145,72 145,89 Q145,106 126,101"
               stroke="rgba(255,255,255,0.92)" stroke-width="5" fill="none" stroke-linecap="round"/>
             <rect x="88" y="112" width="24" height="6" rx="2" fill="rgba(255,255,255,0.92)"/>
             <rect x="82" y="118" width="36" height="5" rx="2" fill="rgba(255,255,255,0.92)"/>`,
    },
    // Blue — milestone — bullseye
    milestone: {
      inner: '#60a5fa', outer: '#1e3a8a', ring: 'rgba(96,165,250,0.45)',
      label: 'MILESTONE',
      icon: `<circle cx="100" cy="88" r="36" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="4.5"/>
             <circle cx="100" cy="88" r="23" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="4.5"/>
             <circle cx="100" cy="88" r="10" fill="rgba(255,255,255,0.95)"/>`,
    },
  }

  const c = cfgs[tier] ?? cfgs.completion
  const displayName = name.length > 18 ? name.substring(0, 16) + '\u2026' : name

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <radialGradient id="bg" cx="38%" cy="32%" r="72%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${c.inner}"/>
      <stop offset="100%" stop-color="${c.outer}"/>
    </radialGradient>
    <filter id="shadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="rgba(0,0,0,0.40)"/>
    </filter>
  </defs>
  <!-- Background circle with gradient -->
  <circle cx="100" cy="100" r="93" fill="url(#bg)" filter="url(#shadow)"/>
  <!-- Outer glow ring -->
  <circle cx="100" cy="100" r="89" fill="none" stroke="${c.ring}" stroke-width="5"/>
  <!-- Inner accent ring -->
  <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
  <!-- Sheen overlay -->
  <ellipse cx="80" cy="65" rx="38" ry="22" fill="rgba(255,255,255,0.10)" transform="rotate(-20,80,65)"/>
  <!-- Tier icon -->
  ${c.icon}
  <!-- Badge name -->
  <text x="100" y="152" font-family="system-ui,-apple-system,Arial,sans-serif"
        font-size="13" font-weight="700" text-anchor="middle"
        fill="rgba(255,255,255,0.97)" letter-spacing="0.4">${escapeXml(displayName)}</text>
  <!-- Tier label -->
  <text x="100" y="170" font-family="system-ui,-apple-system,Arial,sans-serif"
        font-size="7.5" text-anchor="middle"
        fill="rgba(255,255,255,0.52)" letter-spacing="3">${c.label}</text>
</svg>`

  return svg
}

/** Convert SVG string → base64 data URL (for storage in image_url column) */
function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// ── Pre-defined badge catalog ──────────────────────────────────────────────

const BADGE_CATALOG = [
  {
    name:        'First Steps',
    description: 'Completed your very first course. The journey of a thousand miles begins with a single step!',
    skillTags:   ['completion', 'milestone'],
    criteria:    'Complete your first course',
  },
  {
    name:        'Perfect Score',
    description: 'Achieved a flawless 100% on a quiz. You really know your stuff!',
    skillTags:   ['excellence'],
    criteria:    'Score 100% on any quiz',
  },
  {
    name:        'Fast Learner',
    description: 'Blazed through a course in record time. Speed and precision combined!',
    skillTags:   ['milestone'],
    criteria:    'Complete a course within 24 hours of enrollment',
  },
  {
    name:        'Code Alchemist',
    description: 'Transformed raw knowledge into coding gold. Master of the programming arts!',
    skillTags:   ['excellence'],
    criteria:    'Score 90%+ across all modules in a coding course',
  },
  {
    name:        'Python Graduate',
    description: 'Mastered the fundamentals of Python programming. Slithering towards excellence!',
    skillTags:   ['completion'],
    criteria:    'Complete a Python course with 70%+ average',
  },
  {
    name:        'JavaScript Wizard',
    description: 'Conjured web magic with JavaScript. DOM manipulation, async/await — you handle it all!',
    skillTags:   ['completion'],
    criteria:    'Complete a JavaScript course with 70%+ average',
  },
  {
    name:        'Data Science Explorer',
    description: 'Charted unknown territories in data. From raw numbers to meaningful insights!',
    skillTags:   ['completion'],
    criteria:    'Complete a data science or analytics course',
  },
  {
    name:        'Full Stack Champion',
    description: 'Conquered both the front and back end. The complete developer package!',
    skillTags:   ['series'],
    criteria:    'Complete front-end and back-end courses in the same learning path',
  },
  {
    name:        'Dedicated Student',
    description: 'Showed up every day without fail. Consistency is the key to mastery!',
    skillTags:   ['milestone'],
    criteria:    'Log in and complete lessons 7 days in a row',
  },
  {
    name:        'Summit Achiever',
    description: 'Reached the peak — completed every course in a learning path. Nothing can stop you!',
    skillTags:   ['series'],
    criteria:    'Complete an entire learning path from start to finish',
  },
  {
    name:        'Quiz Champion',
    description: 'Dominated every quiz in sight. Knowledge is power — and you have plenty of it!',
    skillTags:   ['excellence'],
    criteria:    'Score 90%+ on 5 or more quizzes',
  },
  {
    name:        'Rising Star',
    description: 'You are on fire! Top 10% of learners in your organization this month.',
    skillTags:   ['milestone'],
    criteria:    'Rank in the top 10% on the monthly leaderboard',
  },
  {
    name:        'Early Adopter',
    description: 'Awarded to the first learners of this LMS platform. Welcome aboard!',
    skillTags:   ['milestone'],
    criteria:    'Join the platform during its first month',
  },
  {
    name:        'Cloud Practitioner',
    description: 'Floated to the top with cloud computing know-how. Infrastructure as a breeze!',
    skillTags:   ['completion'],
    criteria:    'Complete a cloud or DevOps course',
  },
  {
    name:        'AI Pioneer',
    description: 'Ventured into the world of AI and machine learning. Welcome to the future!',
    skillTags:   ['excellence'],
    criteria:    'Complete an AI or machine learning course with 85%+ score',
  },
]

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', service: 'badge-engine' }))

// GET /badges — list badges for an org
app.get('/badges', async (req) => {
  const { orgId } = req.query as { orgId: string }
  const { rows } = await db.query(
    'SELECT * FROM badges WHERE org_id = $1 ORDER BY created_at DESC',
    [orgId],
  )
  return { data: rows }
})

// POST /badges — create a badge (auto-generates SVG image if imageUrl not supplied)
app.post('/badges', async (req, reply) => {
  const body        = req.body as Record<string, unknown>
  const orgId       = body.orgId as string
  const name        = body.name as string
  const description = (body.description as string | undefined) ?? null
  const skillTags   = (body.skillTags as string[] | undefined) ?? []

  // Auto-generate a beautiful SVG badge image (unless caller provides one)
  const providedUrl = body.imageUrl as string | undefined
  const imageUrl    = providedUrl && !providedUrl.includes('placeholder')
    ? providedUrl
    : svgToDataUrl(generateBadgeSVG(name, skillTags))

  const rawCriteria = body.criteria
  const criteria    = typeof rawCriteria === 'string'
    ? { description: rawCriteria }
    : ((rawCriteria as Record<string, unknown>) ?? {})

  const { rows } = await db.query(
    `INSERT INTO badges (id, org_id, name, description, image_url, criteria, skill_tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [randomUUID(), orgId, name, description, imageUrl, JSON.stringify(criteria), skillTags],
  )
  return reply.status(201).send({ data: rows[0] })
})

// GET /badges/:id/image — download badge SVG
app.get('/badges/:id/image', async (req, reply) => {
  const { id } = req.params as { id: string }
  const { rows } = await db.query('SELECT image_url, name, skill_tags FROM badges WHERE id=$1', [id])
  if (!rows.length) return reply.status(404).send({ error: 'Badge not found' })

  const badge = rows[0]
  let svgContent: string

  if (badge.image_url?.startsWith('data:image/svg+xml;base64,')) {
    // Decode stored base64
    svgContent = Buffer.from(badge.image_url.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8')
  } else {
    // Re-generate (fallback for old placeholder badges)
    svgContent = generateBadgeSVG(badge.name, badge.skill_tags ?? [])
  }

  return reply
    .status(200)
    .header('Content-Type', 'image/svg+xml')
    .header('Content-Disposition', `inline; filename="${encodeURIComponent(badge.name)}.svg"`)
    .header('Cache-Control', 'public, max-age=86400')
    .send(svgContent)
})

// POST /badges/:id/issue — issue a badge to a learner
app.post('/badges/:id/issue', async (req, reply) => {
  const { id } = req.params as { id: string }
  const { userId, courseId } = req.body as { userId: string; courseId?: string }

  const { rows: existing } = await db.query(
    'SELECT id FROM issued_badges WHERE badge_id=$1 AND user_id=$2',
    [id, userId],
  )
  if (existing.length > 0) return reply.status(409).send({ error: 'Badge already issued to this user' })

  const assertionUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/badges/assertion/${randomUUID()}`

  const { rows } = await db.query(
    `INSERT INTO issued_badges (id, badge_id, user_id, course_id, assertion_url, issued_at)
     VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
    [randomUUID(), id, userId, courseId ?? null, assertionUrl],
  )

  console.log(`[KAFKA] badge.events: badge.issued for user ${userId}`)
  return reply.status(201).send({ data: rows[0] })
})

// GET /badges/me — get my badges
app.get('/badges/me', async (req) => {
  const { userId } = req.query as { userId: string }
  const { rows } = await db.query(
    `SELECT ib.*, b.name, b.description, b.image_url, b.skill_tags
     FROM issued_badges ib JOIN badges b ON b.id = ib.badge_id
     WHERE ib.user_id = $1 ORDER BY ib.issued_at DESC`,
    [userId],
  )
  return { data: rows }
})

// POST /badges/seed — seed the catalog of pre-defined badges for an org
// Skips badges whose name already exists for that org.
app.post('/badges/seed', async (req, reply) => {
  const { orgId } = req.body as { orgId: string }
  if (!orgId) return reply.status(400).send({ error: 'orgId required' })

  const inserted: string[] = []
  const skipped:  string[] = []

  for (const badge of BADGE_CATALOG) {
    // Skip if already exists
    const { rows: existing } = await db.query(
      'SELECT id FROM badges WHERE org_id=$1 AND LOWER(name)=LOWER($2)',
      [orgId, badge.name],
    )
    if (existing.length > 0) {
      skipped.push(badge.name)
      continue
    }

    const imageUrl  = svgToDataUrl(generateBadgeSVG(badge.name, badge.skillTags))
    const criteria  = { description: badge.criteria }

    await db.query(
      `INSERT INTO badges (id, org_id, name, description, image_url, criteria, skill_tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), orgId, badge.name, badge.description, imageUrl, JSON.stringify(criteria), badge.skillTags],
    )
    inserted.push(badge.name)
  }

  return reply.status(200).send({
    inserted: inserted.length,
    skipped:  skipped.length,
    badges:   inserted,
  })
})

// ── Start ──────────────────────────────────────────────────────────────────

async function start() {
  await app.register(cors, { origin: true })
  const port = Number(process.env.BADGE_ENGINE_PORT ?? 3005)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`🚀 Badge Engine on port ${port}`)
}

start().catch((err) => { console.error(err); process.exit(1) })
