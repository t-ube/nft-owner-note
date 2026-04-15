-- User data tables
-- Each row is owned by an XRPL address (matches sync_sessions.address),
-- not a Supabase Auth user. All access goes through the service_role via
-- API routes, which enforce session ownership at the application layer.

-- Address Groups
CREATE TABLE address_groups (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  name TEXT NOT NULL,
  addresses TEXT[] DEFAULT '{}',
  x_account TEXT,
  memo TEXT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (address, id)
);

CREATE INDEX idx_address_groups_address ON address_groups (address);

-- Addresses
CREATE TABLE addresses (
  address TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  group_id TEXT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (owner_address, address)
);

CREATE INDEX idx_addresses_owner_address ON addresses (owner_address);

-- Projects
CREATE TABLE projects (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  taxon TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (address, id)
);

CREATE INDEX idx_projects_address ON projects (address);

-- Project Owner Values
CREATE TABLE project_owner_values (
  id TEXT NOT NULL,
  address TEXT NOT NULL,
  project_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  user_value1 NUMERIC,
  user_value2 NUMERIC,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (address, id)
);

CREATE INDEX idx_project_owner_values_address ON project_owner_values (address);

-- RLS: enable with no policies so anon/authenticated cannot read.
-- service_role bypasses RLS, which is what API routes use via
-- SUPABASE_SERVICE_ROLE_KEY. Application-layer code must match the
-- row's `address` against the authenticated session address from
-- getSession() before read/write.
ALTER TABLE address_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_owner_values ENABLE ROW LEVEL SECURITY;
