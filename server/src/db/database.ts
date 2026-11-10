import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbDir = join(__dirname, '..', 'data')
mkdirSync(dbDir, { recursive: true })

const dbPath = join(dbDir, 'agenthub.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'codex_appserver',
    endpoint TEXT NOT NULL,
    auth_config TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'offline',
    last_check_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    config TEXT DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'web',
    status TEXT NOT NULL DEFAULT 'active',
    title TEXT,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    archived_at TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    streaming_completed INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS feishu_config (
    id TEXT PRIMARY KEY,
    webhook_url TEXT DEFAULT '',
    bot_app_id TEXT DEFAULT '',
    bot_app_secret TEXT DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feishu_events (
    event_type TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS push_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    created_at TEXT NOT NULL
  );
`)

// ── Seed default feishu config ──
const feishuCount = db.prepare('SELECT COUNT(*) as cnt FROM feishu_config').get() as { cnt: number }
if (feishuCount.cnt === 0) {
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO feishu_config (id, webhook_url, bot_app_id, bot_app_secret, enabled, created_at, updated_at)
    VALUES (?, '', '', '', 0, ?, ?)`).run('default', now, now)
}

// ── Seed default feishu events ──
const eventCount = db.prepare('SELECT COUNT(*) as cnt FROM feishu_events').get() as { cnt: number }
if (eventCount.cnt === 0) {
  const events = ['agent_online', 'agent_offline', 'agent_error', 'session_completed']
  const insertEvent = db.prepare('INSERT INTO feishu_events (event_type, enabled) VALUES (?, 1)')
  for (const evt of events) {
    insertEvent.run(evt)
  }
}

export function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function encryptAuth(plain: string): string {
  // Simple base64 encoding for at-rest obfuscation (NFR-004: not plaintext)
  return Buffer.from(plain).toString('base64')
}

export function decryptAuth(encrypted: string): string {
  try {
    return Buffer.from(encrypted, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

export default db
