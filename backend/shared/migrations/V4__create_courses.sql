-- V4: Courses and modules
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id),
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  thumbnail_url TEXT,
  status        VARCHAR(50) NOT NULL DEFAULT 'draft',
  visibility    VARCHAR(50) NOT NULL DEFAULT 'private',
  price         DECIMAL(10,2) DEFAULT 0,
  skill_tags    TEXT[] DEFAULT '{}',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE modules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title             VARCHAR(500) NOT NULL,
  order_index       INTEGER NOT NULL DEFAULT 0,
  content_type      VARCHAR(50) DEFAULT 'text',
  content_url       TEXT,
  source_type       VARCHAR(50) DEFAULT 'text',
  source_url        TEXT,
  source_metadata   JSONB DEFAULT '{}',
  duration_secs     INTEGER,
  transcript        TEXT,
  caption_url       TEXT,
  processing_status VARCHAR(50) DEFAULT 'ready',
  processing_error  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_org_id ON courses(org_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_modules_course_id ON modules(course_id);
