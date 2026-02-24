-- V1: Organizations table
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  plan       VARCHAR(50) NOT NULL DEFAULT 'starter',
  settings   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a default org for local development
INSERT INTO organizations (name, slug, plan)
VALUES ('LMS Dev Org', 'dev', 'enterprise');
