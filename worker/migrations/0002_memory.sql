-- Persistent, account-scoped Jarvis conversation history and explicit memories.
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','model')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_user_id_id_idx ON chat_messages(user_id, id);
CREATE TABLE IF NOT EXISTS user_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, content)
);
CREATE INDEX IF NOT EXISTS user_memories_user_id_idx ON user_memories(user_id, created_at);
