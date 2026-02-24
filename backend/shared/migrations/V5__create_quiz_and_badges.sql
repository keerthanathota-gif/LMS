-- V5: Quiz questions, attempts, badges, certificates

CREATE TABLE quiz_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     UUID REFERENCES modules(id),
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) NOT NULL DEFAULT 'multiple_choice',
  options       JSONB,
  correct_answer TEXT,
  explanation   TEXT,
  difficulty    DECIMAL(3,2) DEFAULT 0.5,
  skill_tags    TEXT[] DEFAULT '{}',
  ai_generated  BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quiz_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  course_id   UUID REFERENCES courses(id),
  module_id   UUID REFERENCES modules(id),
  answers     JSONB NOT NULL DEFAULT '[]',
  score_pct   DECIMAL(5,2) NOT NULL,
  passed      BOOLEAN NOT NULL,
  time_secs   INTEGER,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status       VARCHAR(50) NOT NULL DEFAULT 'active',
  progress_pct DECIMAL(5,2) DEFAULT 0,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
);

CREATE TABLE badges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  image_url     TEXT NOT NULL DEFAULT 'https://via.placeholder.com/150',
  criteria      JSONB NOT NULL DEFAULT '{}',
  skill_tags    TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE issued_badges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id      UUID NOT NULL REFERENCES badges(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  course_id     UUID REFERENCES courses(id),
  assertion_url TEXT,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(badge_id, user_id, course_id)
);

CREATE TABLE certificates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  course_id     UUID NOT NULL REFERENCES courses(id),
  template_html TEXT NOT NULL DEFAULT '<h1>Certificate of Completion</h1>',
  criteria      JSONB NOT NULL DEFAULT '{"min_score": 70}',
  validity_days INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE issued_certs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  course_id      UUID NOT NULL REFERENCES courses(id),
  pdf_url        TEXT NOT NULL DEFAULT '',
  verify_url     TEXT NOT NULL DEFAULT '',
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  UNIQUE(certificate_id, user_id)
);

CREATE INDEX idx_quiz_questions_course   ON quiz_questions(course_id);
CREATE INDEX idx_quiz_attempts_user      ON quiz_attempts(user_id);
CREATE INDEX idx_enrollments_user        ON enrollments(user_id);
CREATE INDEX idx_enrollments_course      ON enrollments(course_id);
CREATE INDEX idx_issued_badges_user      ON issued_badges(user_id);
