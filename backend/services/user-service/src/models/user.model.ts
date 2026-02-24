import { db } from '../config/db'

export type UserRole = 'super_admin' | 'org_admin' | 'instructor' | 'ta' | 'learner'

export interface User {
  id: string
  orgId: string
  email: string
  fullName: string
  passwordHash?: string
  role: UserRole
  keycloakId?: string
  avatarUrl?: string
  preferences: Record<string, unknown>
  skillLevel: 'beginner' | 'intermediate' | 'advanced'
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserInput {
  orgId: string
  email: string
  fullName: string
  role: UserRole
  keycloakId?: string
  avatarUrl?: string
  passwordHash?: string
}

// All queries use this so snake_case DB columns map to camelCase TS fields
const SELECT_COLS = `
  id,
  org_id        AS "orgId",
  email,
  full_name     AS "fullName",
  password_hash AS "passwordHash",
  role,
  keycloak_id   AS "keycloakId",
  avatar_url    AS "avatarUrl",
  preferences,
  skill_level   AS "skillLevel",
  created_at    AS "createdAt",
  updated_at    AS "updatedAt"
`

export const UserModel = {
  async findById(id: string): Promise<User | null> {
    const { rows } = await db.query<User>(
      `SELECT ${SELECT_COLS} FROM users WHERE id = $1`,
      [id],
    )
    return rows[0] ?? null
  },

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await db.query<User>(
      `SELECT ${SELECT_COLS} FROM users WHERE email = $1`,
      [email],
    )
    return rows[0] ?? null
  },

  async findByKeycloakId(keycloakId: string): Promise<User | null> {
    const { rows } = await db.query<User>(
      `SELECT ${SELECT_COLS} FROM users WHERE keycloak_id = $1`,
      [keycloakId],
    )
    return rows[0] ?? null
  },

  async listByOrg(orgId: string, limit = 50, offset = 0): Promise<User[]> {
    const { rows } = await db.query<User>(
      `SELECT ${SELECT_COLS} FROM users WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [orgId, limit, offset],
    )
    return rows
  },

  async create(input: CreateUserInput): Promise<User> {
    const { rows } = await db.query<User>(
      `INSERT INTO users (org_id, email, full_name, role, keycloak_id, avatar_url, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SELECT_COLS}`,
      [input.orgId, input.email, input.fullName, input.role, input.keycloakId, input.avatarUrl, input.passwordHash],
    )
    return rows[0]
  },

  async update(id: string, fields: Partial<Pick<User, 'fullName' | 'avatarUrl' | 'preferences' | 'skillLevel'>>): Promise<User | null> {
    const updates: string[] = []
    const values: unknown[] = []
    let i = 1

    if (fields.fullName    !== undefined) { updates.push(`full_name = $${i++}`);   values.push(fields.fullName) }
    if (fields.avatarUrl   !== undefined) { updates.push(`avatar_url = $${i++}`);  values.push(fields.avatarUrl) }
    if (fields.preferences !== undefined) { updates.push(`preferences = $${i++}`); values.push(JSON.stringify(fields.preferences)) }
    if (fields.skillLevel  !== undefined) { updates.push(`skill_level = $${i++}`); values.push(fields.skillLevel) }

    if (updates.length === 0) return this.findById(id)

    updates.push(`updated_at = NOW()`)
    values.push(id)

    const { rows } = await db.query<User>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING ${SELECT_COLS}`,
      values,
    )
    return rows[0] ?? null
  },

  async assignRole(id: string, role: UserRole): Promise<User | null> {
    const { rows } = await db.query<User>(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING ${SELECT_COLS}`,
      [role, id],
    )
    return rows[0] ?? null
  },
}
