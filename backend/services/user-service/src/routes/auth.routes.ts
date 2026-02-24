import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/user.model'

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

// Dev-mode token: base64url-encoded JSON payload
// Replace with proper JWT (fast-jwt / Keycloak) in production
function makeDevToken(userId: string, orgId: string, role: string): string {
  const payload = { userId, orgId, role, exp: Date.now() + 86_400_000 }
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function parseDevToken(token: string): { userId: string; orgId: string; role: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'))
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/login — direct DB auth for dev
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid credentials format' })
    }

    const { email, password } = parsed.data

    try {
      const user = await UserModel.findByEmail(email)
      if (!user || !user.passwordHash) {
        return reply.status(401).send({ error: 'Invalid email or password' })
      }

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid email or password' })
      }

      const accessToken  = makeDevToken(user.id, user.orgId, user.role)
      const refreshToken = makeDevToken(user.id, user.orgId, user.role)

      return {
        user: {
          id:       user.id,
          email:    user.email,
          fullName: user.fullName,
          role:     user.role,
          orgId:    user.orgId,
        },
        tokens: { accessToken, refreshToken, expiresIn: 86400 },
      }
    } catch (err) {
      app.log.error(err, 'Login error')
      return reply.status(500).send({ error: 'Authentication service error' })
    }
  })

  // POST /auth/logout — client clears token
  app.post('/logout', async () => ({ message: 'Logged out' }))

  // GET /auth/me — verify token and return current user
  app.get('/me', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'Unauthorized' })

    const payload = parseDevToken(auth.slice(7))
    if (!payload) return reply.status(401).send({ error: 'Token expired or invalid' })

    const user = await UserModel.findById(payload.userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    return {
      user: {
        id:       user.id,
        email:    user.email,
        fullName: user.fullName,
        role:     user.role,
        orgId:    user.orgId,
      },
    }
  })
}

export default authRoutes
