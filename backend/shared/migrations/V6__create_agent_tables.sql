-- V6: Agent conversations and tool registry

CREATE TABLE tool_registry (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(255) NOT NULL,
  description   TEXT NOT NULL,
  version       VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  schema        JSONB NOT NULL DEFAULT '{}',
  endpoint      TEXT NOT NULL,
  auth_type     VARCHAR(50) DEFAULT 'none',
  enabled       BOOLEAN DEFAULT true,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  session_id VARCHAR(255) NOT NULL,
  role       VARCHAR(50) NOT NULL DEFAULT 'admin',
  messages   JSONB NOT NULL DEFAULT '[]',
  summary    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  dag_json      JSONB NOT NULL DEFAULT '{}',
  trigger_event VARCHAR(255),
  created_by    UUID REFERENCES users(id),
  enabled       BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default tools
INSERT INTO tool_registry (name, display_name, description, endpoint) VALUES
  ('create_course',    'Create Course',    'Create a new course with title and modules',      'http://localhost:3002/courses'),
  ('generate_quiz',    'Generate Quiz',    'AI-generate quiz questions from content',          'http://localhost:3004/quiz/generate'),
  ('publish_course',   'Publish Course',   'Publish course to make it visible to learners',   'http://localhost:3002/courses/:id/publish'),
  ('enroll_learners',  'Enroll Learners',  'Enroll users in a course',                        'http://localhost:3001/enrollments'),
  ('send_notification','Send Notification','Send email notification to users',                 'http://localhost:3007/notifications/email'),
  ('issue_badge',      'Issue Badge',      'Issue a badge to a learner',                      'http://localhost:3005/badges/:id/issue');
