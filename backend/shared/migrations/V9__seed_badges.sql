-- V9: Seed default badges for the dev organization
-- This ensures the badges table is never empty on a fresh install
-- and that all existing users get the Early Adopter badge.

-- Insert the "Early Adopter" badge template (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO badges (id, org_id, name, description, image_url, criteria, skill_tags)
SELECT
  'bf240192-6c31-47b3-ae78-bbcc2ab2bee2'::uuid,
  o.id,
  'Early Adopter',
  'Awarded to the first learners of this LMS platform. Welcome aboard!',
  'https://via.placeholder.com/150/6366f1/ffffff?text=EA',
  '{"description": "Be an early member of the platform"}',
  ARRAY['milestone']
FROM organizations o WHERE o.slug = 'dev'
ON CONFLICT (id) DO NOTHING;

-- Issue the Early Adopter badge to every existing user in the dev org
-- (skips users who already have it via the UNIQUE constraint)
INSERT INTO issued_badges (id, badge_id, user_id, course_id, assertion_url, issued_at)
SELECT
  gen_random_uuid(),
  'bf240192-6c31-47b3-ae78-bbcc2ab2bee2'::uuid,
  u.id,
  NULL,
  'http://localhost:3000/badges/assertion/' || gen_random_uuid(),
  NOW()
FROM users u
JOIN organizations o ON o.id = u.org_id
WHERE o.slug = 'dev'
ON CONFLICT (badge_id, user_id, course_id) DO NOTHING;
