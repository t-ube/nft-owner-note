-- Sync session table
-- Each row represents a per-device sync auth session, issued after a verified Xaman SignIn.
-- Access is service-role only; RLS is enabled with no policies so anon/authenticated cannot read.

CREATE TABLE sync_sessions (
  token_hash    TEXT PRIMARY KEY,
  address       TEXT NOT NULL,
  device_label  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_sync_sessions_address
  ON sync_sessions (address)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_sync_sessions_expires
  ON sync_sessions (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;
-- No policies = default deny for anon and authenticated.
-- service_role bypasses RLS, which is what API routes use via SUPABASE_SERVICE_ROLE_KEY.
