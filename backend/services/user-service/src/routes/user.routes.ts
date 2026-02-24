import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { UserModel } from '../models/user.model'

const createUserSchema = z.object({
  orgId:    z.string().uuid(),
  email:    z.string().email(),
  fullName: z.string().min(2).max(255),
  role:     z.enum(['super_admin', 'org_admin', 'instructor', 'ta', 'learner']),
})

const updateUserSchema = z.object({
  fullName:   z.string().min(2).max(255).optional(),
  avatarUrl:  z.string().url().optional(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
})

const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /users — list users in org (admin/instructor only)
  app.get('/', async (req, reply) => {
    const orgId = (req.query as { orgId?: string }).orgId
    if (!orgId) return reply.status(400).send({ error: 'orgId is required' })

    const limit  = Number((req.query as { limit?: string }).limit  ?? 50)
    const offset = Number((req.query as { offset?: string }).offset ?? 0)

    const users = await UserModel.listByOrg(orgId, limit, offset)
    return { data: users }
  })

  // GET /users/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await UserModel.findById(id)
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return { data: user }
  })

  // POST /users — create user (admin only)
  app.post('/', async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    }

    const existing = await UserModel.findByEmail(parsed.data.email)
    if (existing) {
      return reply.status(409).send({ error: 'Email already exists' })
    }

    const user = await UserModel.create(parsed.data)
    return reply.status(201).send({ data: user })
  })

  // PATCH /users/:id — update profile
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    }

    const user = await UserModel.update(id, parsed.data)
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return { data: user }
  })

  // POST /users/:id/roles — assign role (admin only)
  app.post('/:id/roles', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { role } = req.body as { role: string }

    const validRoles = ['super_admin', 'org_admin', 'instructor', 'ta', 'learner']
    if (!validRoles.includes(role)) {
      return reply.status(400).send({ error: 'Invalid role' })
    }

    const user = await UserModel.assignRole(id, role as never)
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return { data: user }
  })
}

export default userRoutes
