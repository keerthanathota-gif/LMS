-- V2: Users table
CREATE TYPE user_role AS ENUM ('super_admin', 'org_admin', 'instructor', 'ta', 'learner');
CREATE TYPE skill_level AS ENUM ('beginner', 'intermediate', 'advanced');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         VARCHAR(255) UNIQUE NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  role          user_role NOT NULL DEFAULT 'learner',
  keycloak_id   VARCHAR(255) UNIQUE,
  avatar_url    TEXT,
  preferences   JSONB NOT NULL DEFAULT '{}',
  skill_level   skill_level NOT NULL DEFAULT 'beginner',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_org_id     ON users(org_id);
CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_keycloak   ON users(keycloak_id);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_org_isolation ON users
  USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- Seed a default super admin for local dev
-- Password: admin123 (bcrypt hash — change in production!)
INSERT INTO users (org_id, email, full_name, role, password_hash)
SELECT id, 'admin@lms.local', 'LMS Admin', 'super_admin',
       '$2b$10$dadFbwcJ.lQnlbSVriGNyuGJaRRYhebeWfHvJt6zatfir8IjMukEC'
FROM organizations WHERE slug = 'dev';

-- Seed a default learner for local dev
-- Password: learner123 (bcrypt hash — change in production!)
INSERT INTO users (org_id, email, full_name, role, password_hash)
SELECT id, 'learner@lms.local', 'Demo Learner', 'learner',
       '$2a$10$XUyFKKENxV1JeJvSkOI5ZeKk9lbyuc6KENGWnR/GkZO8Al.cus5iK'
FROM organizations WHERE slug = 'dev'
ON CONFLICT (email) DO NOTHING;
