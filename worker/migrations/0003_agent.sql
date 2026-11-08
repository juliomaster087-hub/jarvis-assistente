-- Bounded agent execution history. All records are scoped to an authenticated user.
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
  status TEXT NOT NULL CHECK (status IN ('completed','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_tasks_user_created_idx ON agent_tasks(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed','failed')),
  tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (tool_calls BETWEEN 0 AND 4),
  rounds INTEGER NOT NULL DEFAULT 0 CHECK (rounds BETWEEN 0 AND 3),
  summary TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_runs_user_finished_idx ON agent_runs(user_id, finished_at DESC);

CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 4),
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  arguments_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, sequence)
);
CREATE INDEX IF NOT EXISTS agent_steps_run_sequence_idx ON agent_steps(run_id, sequence);
