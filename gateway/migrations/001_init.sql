CREATE TABLE tools (
  tool_key        TEXT PRIMARY KEY,
  server_id       TEXT NOT NULL,
  tool_name       TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('approved','pending','rejected')),
  approved_hash   TEXT,
  approved_def    JSONB,
  current_hash    TEXT NOT NULL,
  current_def     JSONB NOT NULL,
  review          JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tool_calls (
  id          BIGSERIAL PRIMARY KEY,
  tool_key    TEXT NOT NULL,
  tool_hash   TEXT,
  args        JSONB,
  outcome     TEXT NOT NULL CHECK (outcome IN ('allowed','blocked','error')),
  latency_ms  INT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id         BIGSERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  tool_key   TEXT,
  payload    JSONB NOT NULL,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL UNIQUE
);
CREATE INDEX ON tool_calls (created_at DESC);
