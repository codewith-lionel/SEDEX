-- 0001_init
-- Initial schema for HR Audit Form Generator.

CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'Other',
  file_path   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates (category);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates (status);

CREATE TABLE IF NOT EXISTS template_fields (
  id               TEXT PRIMARY KEY,
  template_id      TEXT NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
  field_key        TEXT NOT NULL,
  label            TEXT NOT NULL,
  cell_address     TEXT NOT NULL,
  sheet_name       TEXT,
  field_type       TEXT NOT NULL DEFAULT 'text',
  required         INTEGER NOT NULL DEFAULT 0,
  default_value    TEXT,
  validation_rule  TEXT,
  ai_description   TEXT,
  dropdown_options TEXT NOT NULL DEFAULT '[]',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (template_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_fields_template ON template_fields (template_id);

CREATE TABLE IF NOT EXISTS employees (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  code         TEXT,
  department   TEXT,
  designation  TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_code ON employees (code) WHERE code IS NOT NULL AND code <> '';

CREATE TABLE IF NOT EXISTS generated_files (
  id            TEXT PRIMARY KEY,
  template_id   TEXT REFERENCES templates (id) ON DELETE SET NULL,
  template_name TEXT,
  employee_id   TEXT REFERENCES employees (id) ON DELETE SET NULL,
  employee_name TEXT,
  file_name     TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'completed',
  error         TEXT,
  source        TEXT NOT NULL DEFAULT 'manual',
  data_snapshot TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_created ON generated_files (created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
