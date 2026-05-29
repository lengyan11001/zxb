CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'sdr')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '服务',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  description TEXT NOT NULL DEFAULT '',
  core_value TEXT NOT NULL DEFAULT '',
  target_customer TEXT NOT NULL DEFAULT '',
  unique_advantage TEXT NOT NULL DEFAULT '',
  price_strategy TEXT NOT NULL DEFAULT '',
  success_cases JSONB NOT NULL DEFAULT '[]',
  pain_points JSONB NOT NULL DEFAULT '[]',
  benefits JSONB NOT NULL DEFAULT '[]',
  objection_responses JSONB NOT NULL DEFAULT '{}',
  collection_dimensions JSONB NOT NULL DEFAULT '[]',
  signal_rules JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  total_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enterprises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  active_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unified_credit_code TEXT,
  industry TEXT NOT NULL DEFAULT '',
  scale TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_status TEXT NOT NULL DEFAULT 'pending' CHECK (phone_status IN ('pending', 'cleaned', 'invalid', 'duplicate')),
  collection_status TEXT NOT NULL DEFAULT 'pending' CHECK (collection_status IN ('pending', 'queued', 'collecting', 'completed', 'failed')),
  collection_progress INTEGER NOT NULL DEFAULT 0 CHECK (collection_progress BETWEEN 0 AND 100),
  signals JSONB NOT NULL DEFAULT '[]',
  profile JSONB NOT NULL DEFAULT '{}',
  timeline JSONB NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  result TEXT NOT NULL CHECK (result IN ('未拨打', '已接通', '未接', '拒绝', '有效通话', '加微信', '约见', '回拨')),
  notes TEXT NOT NULL DEFAULT '',
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'generating', 'completed', 'failed')),
  full_script TEXT NOT NULL DEFAULT '',
  concise_script TEXT NOT NULL DEFAULT '',
  opening TEXT NOT NULL DEFAULT '',
  hook_points JSONB NOT NULL DEFAULT '[]',
  key_clues JSONB NOT NULL DEFAULT '[]',
  objection_prep JSONB NOT NULL DEFAULT '[]',
  structure_ratio JSONB NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL DEFAULT 'local',
  error_message TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  secret_ref TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  ip INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enterprises_org_name ON enterprises (organization_id, name);
CREATE INDEX IF NOT EXISTS idx_enterprises_owner ON enterprises (organization_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_enterprises_status ON enterprises (organization_id, collection_status);
CREATE INDEX IF NOT EXISTS idx_enterprises_industry ON enterprises (organization_id, industry);
CREATE INDEX IF NOT EXISTS idx_enterprises_signals_gin ON enterprises USING GIN (signals);
CREATE INDEX IF NOT EXISTS idx_call_records_enterprise ON call_records (enterprise_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_records_user_date ON call_records (organization_id, user_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_scripts_enterprise_product ON scripts (enterprise_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs (organization_id, created_at DESC);
