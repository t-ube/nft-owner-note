-- Address Groups
CREATE TABLE address_groups (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  addresses TEXT[] DEFAULT '{}',
  x_account TEXT,
  memo TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Addresses
CREATE TABLE addresses (
  address TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  group_id TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, address)
);

-- Projects
CREATE TABLE projects (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  taxon TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Project Owner Values
CREATE TABLE project_owner_values (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  user_value1 NUMERIC,
  user_value2 NUMERIC,
  is_deleted BOOLEAN DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- RLS
ALTER TABLE address_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_owner_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own data" ON address_groups
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can CRUD own data" ON addresses
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can CRUD own data" ON projects
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can CRUD own data" ON project_owner_values
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX idx_address_groups_deleted ON address_groups(user_id, is_deleted);
CREATE INDEX idx_addresses_deleted ON addresses(user_id, is_deleted);
CREATE INDEX idx_projects_deleted ON projects(user_id, is_deleted);
CREATE INDEX idx_project_owner_values_deleted ON project_owner_values(user_id, is_deleted);