-- V3: Audit log table (append-only)
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID,
  actor_id      UUID,
  actor_role    VARCHAR(50),
  action        VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id   UUID,
  payload       JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  signature     VARCHAR(512),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org_id     ON audit_log(org_id);
CREATE INDEX idx_audit_actor_id   ON audit_log(actor_id);
CREATE INDEX idx_audit_action     ON audit_log(action);
CREATE INDEX idx_audit_created_at ON audit_log(created_at DESC);

-- Prevent modification of audit records
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
