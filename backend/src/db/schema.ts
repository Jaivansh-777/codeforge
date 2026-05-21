export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS _cf_schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  username VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title VARCHAR(255) DEFAULT 'Untitled',
  language VARCHAR(50) NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  snippet_id UUID,
  language VARCHAR(50) NOT NULL,
  code_hash VARCHAR(64),
  input TEXT,
  output TEXT,
  error TEXT,
  execution_time_ms INTEGER,
  memory_used_kb INTEGER DEFAULT 0,
  cpu_time_ms INTEGER DEFAULT 0,
  exit_code INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_user_id ON execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snippets_user_id ON snippets(user_id);
`;
