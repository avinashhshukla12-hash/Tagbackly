import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
export const uploadsDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tagbackly.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    display_alias TEXT NOT NULL,
    profile_image TEXT,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    reset_code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    public_slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SAFE',
    owner_message TEXT NOT NULL DEFAULT '',
    reward_type TEXT NOT NULL DEFAULT 'none',
    reward_amount TEXT NOT NULL DEFAULT '',
    reward_description TEXT NOT NULL DEFAULT '',
    photo_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_items_owner_id ON items(owner_id);
  CREATE INDEX IF NOT EXISTS idx_items_public_slug ON items(public_slug);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    finder_token TEXT NOT NULL,
    finder_label TEXT NOT NULL DEFAULT 'Finder',
    status TEXT NOT NULL DEFAULT 'active',
    blocked_by_owner INTEGER NOT NULL DEFAULT 0,
    blocked_by_finder INTEGER NOT NULL DEFAULT 0,
    last_message_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON conversations(owner_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_item_token ON conversations(item_id, finder_token);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    sender_label TEXT NOT NULL,
    body TEXT NOT NULL,
    read_status INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    item_id TEXT,
    conversation_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

  CREATE TABLE IF NOT EXISTS abuse_reports (
    id TEXT PRIMARY KEY,
    item_id TEXT,
    conversation_id TEXT,
    reporter_role TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

ensureColumn('users', 'profile_image', 'TEXT');
ensureColumn('items', 'reward_type', "TEXT NOT NULL DEFAULT 'none'");
ensureColumn('items', 'reward_description', "TEXT NOT NULL DEFAULT ''");
ensureColumn('messages', 'read_status', 'INTEGER NOT NULL DEFAULT 0');

// Migrate legacy lowercase statuses from Part 1 to Part 2 uppercase statuses
db.exec(`
  UPDATE items SET status = 'SAFE' WHERE status = 'protected';
  UPDATE items SET status = 'LOST' WHERE status = 'lost';
  UPDATE items SET status = 'FOUND' WHERE status = 'found';
  UPDATE items SET status = 'RETURNED' WHERE status = 'returned';
  UPDATE items SET reward_type = 'amount' WHERE reward_type = 'none' AND TRIM(reward_amount) != '';
`);

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  const secretFile = path.join(dataDir, '.jwt_secret');
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim();
  }
  const generated = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}
