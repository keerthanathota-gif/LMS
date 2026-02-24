-- V8: Gamification — XP ledger, streaks, leaderboard view

CREATE TABLE user_xp (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source     VARCHAR(100) NOT NULL,  -- 'quiz_pass' | 'course_complete' | 'streak_bonus' | 'badge_earned'
  xp         INTEGER NOT NULL DEFAULT 0,
  ref_id     UUID,                   -- e.g. quiz_attempt id, course id
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_xp_user_id ON user_xp(user_id);
CREATE INDEX idx_user_xp_org_id  ON user_xp(org_id);

-- Streak tracking: last activity date per learner
CREATE TABLE user_streaks (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leaderboard view: total XP per user in an org
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  u.id          AS user_id,
  u.full_name,
  u.org_id,
  COALESCE(SUM(x.xp), 0) AS total_xp,
  RANK() OVER (PARTITION BY u.org_id ORDER BY COALESCE(SUM(x.xp), 0) DESC) AS rank
FROM users u
LEFT JOIN user_xp x ON x.user_id = u.id
GROUP BY u.id, u.full_name, u.org_id;
