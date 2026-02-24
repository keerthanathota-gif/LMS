-- V7: Extend enrollments table (V5 created the base table)
-- Add org_id for org-scoped queries and extra indexes

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_enrollments_org_id ON enrollments(org_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status  ON enrollments(status);
