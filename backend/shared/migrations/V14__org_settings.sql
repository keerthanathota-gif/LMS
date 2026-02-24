-- V14: Admin-configurable settings (key-value per org)
CREATE TABLE IF NOT EXISTS org_settings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key        VARCHAR(100) NOT NULL,
    value      TEXT NOT NULL DEFAULT '',
    is_secret  BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, key)
);
CREATE INDEX IF NOT EXISTS idx_settings_org ON org_settings(org_id);
