-- User data tables
-- Each row is owned by an XRPL address (matches sync_sessions.address),
-- not a Supabase Auth user. All access goes through the service_role via
-- API routes, which enforce session ownership at the application layer.

-- Address Groups
-- `name` and `memo` are stored encrypted in `cipher`; the columns themselves
-- stay nullable so the schema is unchanged for clients that do not encrypt.
-- `addresses` and `x_account` remain plaintext (they are app-level assets the
-- user explicitly wanted readable).
CREATE TABLE address_groups (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  name TEXT,
  addresses TEXT[] DEFAULT '{}',
  x_account TEXT,
  memo TEXT,
  cipher TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (address, id)
);

CREATE INDEX idx_address_groups_address ON address_groups (address);
CREATE INDEX idx_address_groups_updated ON address_groups (address, updated_at);

-- Addresses
CREATE TABLE addresses (
  address TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  group_id TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (owner_address, address)
);

CREATE INDEX idx_addresses_owner_address ON addresses (owner_address);
CREATE INDEX idx_addresses_updated ON addresses (owner_address, updated_at);

-- Projects
-- `name` is encrypted in `cipher`. `issuer`/`taxon`/`project_id` are
-- on-chain references and stay plaintext.
CREATE TABLE projects (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT,
  issuer TEXT NOT NULL,
  taxon TEXT NOT NULL,
  cipher TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (address, id)
);

CREATE INDEX idx_projects_address ON projects (address);
CREATE INDEX idx_projects_updated ON projects (address, updated_at);

-- Project Owner Values
-- `user_value1` and `user_value2` are encrypted in `cipher`; the numeric
-- columns stay nullable so the schema is unchanged for plaintext clients.
-- `owner` is an XRPL address and stays plaintext.
CREATE TABLE project_owner_values (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  project_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  user_value1 NUMERIC,
  user_value2 NUMERIC,
  cipher TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (address, id)
);

CREATE INDEX idx_project_owner_values_address ON project_owner_values (address);
CREATE INDEX idx_project_owner_values_updated ON project_owner_values (address, updated_at);

-- User Settings
-- Per-address preference flags. One row per XRPL address.
CREATE TABLE user_settings (
  address TEXT PRIMARY KEY,
  data_provision_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL
);

-- RLS: enable with no policies so anon/authenticated cannot read.
-- service_role bypasses RLS, which is what API routes use via
-- SUPABASE_SERVICE_ROLE_KEY. Application-layer code must match the
-- row's `address` against the authenticated session address from
-- getSession() before read/write.
ALTER TABLE address_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_owner_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
