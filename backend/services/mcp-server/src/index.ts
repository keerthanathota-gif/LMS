import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import axios from 'axios'
import http from 'http'

const COURSE_SVC  = process.env.COURSE_SERVICE_URL  ?? 'http://localhost:3002'
const USER_SVC    = process.env.USER_SERVICE_URL    ?? 'http://localhost:3001'
const QUIZ_SVC    = process.env.QUIZ_SERVICE_URL    ?? 'http://localhost:3004'
const BADGE_SVC   = process.env.BADGE_SERVICE_URL   ?? 'http://localhost:3005'
const CERT_SVC    = process.env.CERTIFICATE_SERVICE_URL ?? 'http://localhost:3006'
const PORT        = parseInt(process.env.MCP_PORT   ?? '3100')

// ─── Create MCP Server ────────────────────────────────────────────────────────
const server = new McpServer({
  name:    'lms-mcp-server',
  version: '1.0.0',
})

// ─── Tool: list_courses ───────────────────────────────────────────────────────
server.tool(
  'list_courses',
  'List all courses in the LMS, optionally filtered by org or status',
  {
    orgId:  z.string().optional().describe('Organization UUID to filter by'),
    status: z.enum(['draft', 'published', 'archived']).optional().describe('Filter by course status'),
    limit:  z.number().int().min(1).max(100).optional().default(20).describe('Max results to return'),
  },
  async ({ orgId, status, limit }) => {
    const params: Record<string, string | number> = { limit: limit ?? 20 }
    if (orgId)  params.orgId  = orgId
    if (status) params.status = status

    const res = await axios.get(`${COURSE_SVC}/courses`, { params })
    const courses = res.data?.data ?? res.data ?? []

    const lines = courses.map((c: Record<string, unknown>) =>
      `• [${c.id}] ${c.title} — ${c.status ?? 'unknown'} | ${c.module_count ?? 0} modules`
    )

    return {
      content: [{
        type:  'text',
        text:  lines.length ? lines.join('\n') : 'No courses found.',
      }],
    }
  },
)

// ─── Tool: get_course ─────────────────────────────────────────────────────────
server.tool(
  'get_course',
  'Get full details of a course including its modules',
  {
    courseId: z.string().uuid().describe('The course UUID'),
  },
  async ({ courseId }) => {
    const res = await axios.get(`${COURSE_SVC}/courses/${courseId}`)
    const course = res.data?.data ?? res.data

    if (!course) {
      return { content: [{ type: 'text', text: `Course ${courseId} not found.` }] }
    }

    const modules = (course.modules ?? []).map((m: Record<string, unknown>, i: number) =>
      `  ${i + 1}. [${m.id}] ${m.title} (${m.content_type})`
    ).join('\n')

    const text = [
      `**${course.title}**`,
      `ID: ${course.id}`,
      `Status: ${course.status}`,
      `Description: ${course.description ?? 'N/A'}`,
      `Modules (${course.modules?.length ?? 0}):`,
      modules || '  (none)',
    ].join('\n')

    return { content: [{ type: 'text', text }] }
  },
)

// ─── Tool: create_course ──────────────────────────────────────────────────────
server.tool(
  'create_course',
  'Create a new course in the LMS',
  {
    title:       z.string().min(3).describe('Course title'),
    description: z.string().optional().describe('Course description'),
    orgId:       z.string().uuid().describe('Organization UUID this course belongs to'),
    createdBy:   z.string().uuid().describe('User UUID of the instructor/admin creating this course'),
  },
  async ({ title, description, orgId, createdBy }) => {
    const res = await axios.post(`${COURSE_SVC}/courses`, {
      title,
      description: description ?? '',
      org_id: orgId,
      created_by: createdBy,
    })
    const course = res.data?.data ?? res.data

    return {
      content: [{
        type: 'text',
        text: `Course created successfully!\nID: ${course.id}\nTitle: ${course.title}\nStatus: ${course.status}`,
      }],
    }
  },
)

// ─── Tool: list_users ─────────────────────────────────────────────────────────
server.tool(
  'list_users',
  'List all users in the LMS, optionally filtered by org or role',
  {
    orgId: z.string().optional().describe('Organization UUID to filter by'),
    role:  z.enum(['admin', 'instructor', 'learner']).optional().describe('Filter by role'),
    limit: z.number().int().min(1).max(200).optional().default(50),
  },
  async ({ orgId, role, limit }) => {
    const params: Record<string, string | number> = { limit: limit ?? 50 }
    if (orgId) params.orgId = orgId
    if (role)  params.role  = role

    const res = await axios.get(`${USER_SVC}/users`, { params })
    const users = res.data?.data ?? res.data ?? []

    const lines = users.map((u: Record<string, unknown>) =>
      `• [${u.id}] ${u.full_name ?? u.fullName} <${u.email}> — ${u.role}`
    )

    return {
      content: [{
        type: 'text',
        text: lines.length ? lines.join('\n') : 'No users found.',
      }],
    }
  },
)

// ─── Tool: enroll_learners ────────────────────────────────────────────────────
server.tool(
  'enroll_learners',
  'Enroll one or more learners into a course',
  {
    courseId: z.string().uuid().describe('Course UUID to enroll learners in'),
    userIds:  z.array(z.string().uuid()).min(1).max(200).describe('Array of learner user UUIDs'),
    orgId:    z.string().uuid().describe('Organization UUID'),
  },
  async ({ courseId, userIds, orgId }) => {
    const res = await axios.post(`${USER_SVC}/enrollments`, { courseId, userIds, orgId })
    const { enrolled = 0, skipped = 0 } = res.data?.data ?? res.data ?? {}

    return {
      content: [{
        type: 'text',
        text: `Enrollment complete.\nEnrolled: ${enrolled} learner(s)\nSkipped (already enrolled): ${skipped}`,
      }],
    }
  },
)

// ─── Tool: get_enrollments ────────────────────────────────────────────────────
server.tool(
  'get_enrollments',
  'Get enrollment list for a course or a specific learner',
  {
    courseId: z.string().uuid().optional().describe('Filter by course'),
    userId:   z.string().uuid().optional().describe('Filter by learner'),
    orgId:    z.string().uuid().optional().describe('Filter by org'),
  },
  async ({ courseId, userId, orgId }) => {
    const params: Record<string, string> = {}
    if (courseId) params.courseId = courseId
    if (userId)   params.userId   = userId
    if (orgId)    params.orgId    = orgId

    const res = await axios.get(`${USER_SVC}/enrollments`, { params })
    const enrollments = res.data?.data ?? res.data ?? []

    if (!enrollments.length) {
      return { content: [{ type: 'text', text: 'No enrollments found.' }] }
    }

    const lines = enrollments.map((e: Record<string, unknown>) =>
      `• ${e.full_name ?? e.userId} → ${e.course_id ?? e.courseId} | ${e.status} | ${e.progress_pct ?? 0}%`
    )

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// ─── Tool: get_learner_xp ─────────────────────────────────────────────────────
server.tool(
  'get_learner_xp',
  'Get total XP and XP history for a learner',
  {
    userId: z.string().uuid().describe('Learner user UUID'),
  },
  async ({ userId }) => {
    const res = await axios.get(`${QUIZ_SVC}/quiz/xp/${userId}`)
    const data = res.data?.data ?? res.data ?? {}
    const total   = data.totalXp ?? 0
    const history = (data.history ?? []).slice(0, 10)

    const histLines = history.map((h: Record<string, unknown>) =>
      `  +${h.xp} XP — ${h.source} (${new Date(h.earned_at as string).toLocaleDateString()})`
    )

    return {
      content: [{
        type: 'text',
        text: [`Total XP: ${total}`, 'Recent activity:', ...histLines].join('\n'),
      }],
    }
  },
)

// ─── Tool: get_leaderboard ────────────────────────────────────────────────────
server.tool(
  'get_leaderboard',
  'Get the XP leaderboard for an organization',
  {
    orgId: z.string().uuid().describe('Organization UUID'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async ({ orgId, limit }) => {
    const res = await axios.get(`${QUIZ_SVC}/quiz/leaderboard`, {
      params: { orgId, limit: limit ?? 10 },
    })
    const rows = res.data?.data ?? res.data ?? []

    if (!rows.length) {
      return { content: [{ type: 'text', text: 'No leaderboard data yet.' }] }
    }

    const lines = rows.map((r: Record<string, unknown>) =>
      `  #${r.rank} ${r.full_name} — ${r.total_xp} XP`
    )

    return { content: [{ type: 'text', text: ['Leaderboard:', ...lines].join('\n') }] }
  },
)

// ─── Tool: issue_certificate ──────────────────────────────────────────────────
server.tool(
  'issue_certificate',
  'Manually issue a certificate to a learner for a course',
  {
    userId:    z.string().uuid().describe('Learner user UUID'),
    courseId:  z.string().uuid().describe('Course UUID'),
    orgId:     z.string().uuid().describe('Organization UUID'),
  },
  async ({ userId, courseId, orgId }) => {
    const res = await axios.post(`${CERT_SVC}/certificates/issue`, {
      user_id:   userId,
      course_id: courseId,
      org_id:    orgId,
    })
    const cert = res.data?.data ?? res.data

    return {
      content: [{
        type: 'text',
        text: [
          'Certificate issued successfully!',
          `Certificate ID: ${cert?.id ?? 'N/A'}`,
          `Verify URL: ${cert?.verify_url ?? 'N/A'}`,
          `PDF URL: ${cert?.pdf_url ?? 'N/A'}`,
        ].join('\n'),
      }],
    }
  },
)

// ─── Tool: get_badges ─────────────────────────────────────────────────────────
server.tool(
  'get_badges',
  'List badges available in an org or earned by a learner',
  {
    orgId:  z.string().optional().describe('Filter by org to see all badges'),
    userId: z.string().uuid().optional().describe('Filter by learner to see earned badges'),
  },
  async ({ orgId, userId }) => {
    const url    = userId ? `${BADGE_SVC}/badges/me` : `${BADGE_SVC}/badges`
    const params: Record<string, string> = {}
    if (orgId)  params.orgId  = orgId
    if (userId) params.userId = userId

    const res = await axios.get(url, { params })
    const badges = res.data?.data ?? res.data ?? []

    if (!badges.length) {
      return { content: [{ type: 'text', text: 'No badges found.' }] }
    }

    const lines = badges.map((b: Record<string, unknown>) =>
      `• [${b.id}] ${b.name}${b.description ? ` — ${b.description}` : ''}`
    )

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// ─── Transport: HTTP (Streamable) + STDIO ────────────────────────────────────
async function main() {
  const mode = process.argv[2] ?? 'http'

  if (mode === 'stdio') {
    // STDIO transport: for Claude Desktop / local MCP clients
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('[MCP] Running on stdio')
    return
  }

  // HTTP transport: for remote clients / API gateway integration
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', service: 'lms-mcp-server' }))
      return
    }

    if (req.url === '/mcp') {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,  // stateless mode
      })
      res.on('close', () => transport.close())
      await server.connect(transport)
      await transport.handleRequest(req, res)
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  httpServer.listen(PORT, () => {
    console.log(`[MCP] LMS MCP Server running on http://localhost:${PORT}/mcp`)
    console.log(`[MCP] Health: http://localhost:${PORT}/health`)
    console.log('[MCP] Tools exposed:')
    console.log('  • list_courses     — list / filter courses')
    console.log('  • get_course       — full course details with modules')
    console.log('  • create_course    — create a new course')
    console.log('  • list_users       — list / filter users')
    console.log('  • enroll_learners  — bulk enroll into a course')
    console.log('  • get_enrollments  — enrollment list with progress')
    console.log('  • get_learner_xp   — XP total + history')
    console.log('  • get_leaderboard  — org XP leaderboard')
    console.log('  • issue_certificate — manually issue a cert')
    console.log('  • get_badges       — list org badges or learner earned badges')
  })
}

main().catch(console.error)
