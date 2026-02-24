-- V13: Resume tracking + skip detection
-- Adds checkpoint columns to enrollments and per-module progress tracking table

-- Resume checkpoint on enrollments (which module + timestamp the learner was last on)
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS last_module_id UUID REFERENCES modules(id) ON DELETE SET NULL;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS last_position_secs INTEGER DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- Per-module completion tracking (replaces localStorage, works cross-device)
-- watch_time_secs tracks actual cumulative play time for skip detection
CREATE TABLE IF NOT EXISTS module_progress (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id        UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status           VARCHAR(20) NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'completed'
    watch_time_secs  INTEGER NOT NULL DEFAULT 0,                  -- actual cumulative watch time
    position_secs    INTEGER NOT NULL DEFAULT 0,                  -- current playback position
    completed_at     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_modprog_user_course ON module_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_modprog_module ON module_progress(module_id);
