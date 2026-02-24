-- V9: Course Scheduling (drip), Learning Paths, and Prerequisites
-- Adds 3 new tables. Zero changes to existing tables.
-- JSONB extensions on courses.metadata and modules.source_metadata are schema-free (no ALTER needed).

-- ─────────────────────────────────────────────────────
-- 1. DRIP AUTO-PUBLISH SCHEDULE
--    One row per future course release event.
--    The course-service drip scheduler polls this table hourly
--    and publishes courses whose scheduled_at has passed.
-- ─────────────────────────────────────────────────────
CREATE TABLE course_schedules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  action       VARCHAR(50) NOT NULL DEFAULT 'publish',   -- 'publish' | 'archive'
  executed_at  TIMESTAMPTZ,                              -- NULL = pending; set when executed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index: fast lookup of pending schedules
CREATE INDEX idx_schedules_pending
  ON course_schedules(scheduled_at)
  WHERE executed_at IS NULL;

CREATE INDEX idx_schedules_course ON course_schedules(course_id);

-- ─────────────────────────────────────────────────────
-- 2. LEARNING PATHS
--    An umbrella that groups ordered courses under one title.
--    e.g. "Python Mastery Path" = Beginner + Intermediate + Advanced
-- ─────────────────────────────────────────────────────
CREATE TABLE learning_paths (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title       VARCHAR(500) NOT NULL,
  description TEXT,
  skill_tags  TEXT[]      DEFAULT '{}',
  metadata    JSONB       NOT NULL DEFAULT '{}',   -- cover_image, color, etc.
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_learning_paths_org ON learning_paths(org_id);

-- ─────────────────────────────────────────────────────
-- 3. LEARNING PATH → COURSES (junction)
--    Ordered list of courses in a path.
--    prerequisite_id: the course that must be COMPLETED before this one unlocks.
--    unlock_after_days: optional extra delay after prerequisite completion.
-- ─────────────────────────────────────────────────────
CREATE TABLE learning_path_courses (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id           UUID    NOT NULL REFERENCES learning_paths(id)  ON DELETE CASCADE,
  course_id         UUID    NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
  order_index       INTEGER NOT NULL DEFAULT 0,
  prerequisite_id   UUID    REFERENCES courses(id),   -- NULL = no prerequisite (first in path)
  unlock_after_days INTEGER DEFAULT 0,               -- 0 = immediately on prerequisite completion
  UNIQUE(path_id, course_id)
);

CREATE INDEX idx_path_courses_path   ON learning_path_courses(path_id);
CREATE INDEX idx_path_courses_course ON learning_path_courses(course_id);

-- ─────────────────────────────────────────────────────
-- NOTES ON JSONB EXTENSIONS (no SQL needed — columns exist)
--
-- courses.metadata gains these optional keys:
--   {
--     "drip_series_id":           "uuid-of-learning-path",
--     "drip_week_number":         2,
--     "drip_release_days":        7,
--     "prerequisite_course_ids":  ["uuid1"],
--     "source_rss_feed":          "https://feed.url/rss",
--     "content_summary":          "AI-generated summary of all modules",
--     "thumbnail_source":         "youtube_auto | upload | default"
--   }
--
-- modules.source_metadata gains these optional keys:
--   {
--     "youtube_video_id":   "dQw4w9WgXcQ",
--     "youtube_channel":    "Channel Name",
--     "youtube_embed_url":  "https://www.youtube.com/embed/dQw4w9WgXcQ",
--     "rss_episode_guid":   "episode-guid-from-feed",
--     "rss_feed_url":       "https://feed.url/rss",
--     "minio_object_key":   "courses/uuid/uuid.mp4",
--     "transcription_job":  "pending | done | failed",
--     "original_filename":  "lecture1.mp4"
--   }
-- ─────────────────────────────────────────────────────
