-- V16: Live sessions, Peer reviews, AI summaries, Adaptive learning, AI insights

-- ── Live Cohort Sessions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           VARCHAR(300) NOT NULL,
    description     TEXT,
    meeting_url     TEXT,
    meeting_provider VARCHAR(50) DEFAULT 'zoom',
    scheduled_at    TIMESTAMPTZ NOT NULL,
    duration_mins   INTEGER DEFAULT 60,
    host_user_id    UUID REFERENCES users(id),
    status          VARCHAR(20) DEFAULT 'scheduled',
    recording_url   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON live_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_date ON live_sessions(scheduled_at);

CREATE TABLE IF NOT EXISTS live_session_attendees (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rsvp_status VARCHAR(20) DEFAULT 'registered',
    attended    BOOLEAN DEFAULT false,
    joined_at   TIMESTAMPTZ,
    UNIQUE (session_id, user_id)
);

-- ── Peer Review Assignments ──────────────────────────────────────────────────
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS is_peer_review BOOLEAN DEFAULT false;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS peer_reviews_required INTEGER DEFAULT 3;

CREATE TABLE IF NOT EXISTS peer_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    reviewer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score           INTEGER,
    feedback        TEXT,
    rubric_scores   JSONB DEFAULT '{}',
    status          VARCHAR(20) DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    UNIQUE (submission_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_submission ON peer_reviews(submission_id);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewer ON peer_reviews(reviewer_id);

-- ── AI-generated module summaries ────────────────────────────────────────────
ALTER TABLE modules ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- ── Adaptive learning: quiz retry recommendations ────────────────────────────
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS weak_topics TEXT[];
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS recommended_modules UUID[];

-- ── AI analytics insights cache ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_insights (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL,
    title       VARCHAR(300) NOT NULL,
    body        TEXT NOT NULL,
    severity    VARCHAR(20) DEFAULT 'info',
    data        JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_insights_org ON ai_insights(org_id);
