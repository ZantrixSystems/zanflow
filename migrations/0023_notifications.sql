CREATE TABLE notifications (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  type        VARCHAR(64)   NOT NULL,
  title       TEXT          NOT NULL,
  body        TEXT,
  link        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user
  ON notifications (tenant_id, user_id, created_at DESC);

CREATE INDEX idx_notifications_unread
  ON notifications (tenant_id, user_id, read_at)
  WHERE read_at IS NULL;
