import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { db, getJwtSecret, uploadsDir } from './server/db.ts';
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  REWARD_TYPES,
  type ItemCategory,
  type ItemStatus,
  type NotificationType,
  type RewardType,
} from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = getJwtSecret();
const SESSION_COOKIE = 'tagbackly_session';

interface AuthTokenPayload {
  sub: string;
  email: string;
}

interface AuthedRequest extends Request {
  userId?: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  display_alias: string;
  profile_image: string | null;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  owner_id: string;
  public_slug: string;
  name: string;
  category: string;
  description: string;
  status: string;
  owner_message: string;
  reward_type: string;
  reward_amount: string;
  reward_description: string;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  conversation_count?: number;
}

interface ConversationRow {
  id: string;
  item_id: string;
  owner_id: string;
  finder_token: string;
  finder_label: string;
  status: string;
  blocked_by_owner: number;
  blocked_by_finder: number;
  last_message_at: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_role: string;
  sender_label: string;
  body: string;
  read_status: number;
  created_at: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  item_id: string | null;
  conversation_id: string | null;
  is_read: number;
  created_at: string;
}

const VALID_CATEGORIES = new Set<string>(ITEM_CATEGORIES);
const VALID_STATUSES = new Set<string>(ITEM_STATUSES);
const VALID_REWARD_TYPES = new Set<string>(REWARD_TYPES);

function nowIso(): string {
  return new Date().toISOString();
}

function generateSlug(): string {
  return `tb-${crypto.randomBytes(6).toString('hex')}`;
}

interface RateBucket {
  timestamps: number[];
}

function createRateLimiter(maxRequests: number, windowMs: number, message: string) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = buckets.get(key) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

    if (bucket.timestamps.length >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.timestamps[0] + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.status(429).json({ error: message });
      return;
    }

    bucket.timestamps.push(now);
    buckets.set(key, bucket);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.timestamps.length)));
    next();
  };
}

const recentMessageLog = new Map<string, Array<{ body: string; ts: number }>>();

function isSpamDuplicate(conversationId: string, senderKey: string, body: string): boolean {
  const normalized = body.trim().toLowerCase();
  const mapKey = `${conversationId}:${senderKey}`;
  const now = Date.now();
  const cutoff = now - 15_000;
  const entries = (recentMessageLog.get(mapKey) ?? []).filter((e) => e.ts > cutoff);
  const sameCount = entries.filter((e) => e.body === normalized).length;
  entries.push({ body: normalized, ts: now });
  recentMessageLog.set(mapKey, entries);
  return sameCount >= 2;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

function signSession(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email } satisfies AuthTokenPayload, JWT_SECRET, {
    expiresIn: '14d',
  });
}

function setSessionCookie(res: Response, token: string, req: Request): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: Boolean(isSecure),
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.sub) as { id: string } | undefined;
    if (!user) {
      res.status(401).json({ error: 'Account not found' });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid' });
  }
}

function mapUserProfile(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    displayAlias: row.display_alias,
    profileImage: row.profile_image ?? null,
    phone: row.phone,
    address: row.address,
    createdAt: row.created_at,
  };
}

function mapItem(row: ItemRow) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    publicSlug: row.public_slug,
    name: row.name,
    category: row.category as ItemCategory,
    description: row.description,
    status: row.status as ItemStatus,
    ownerMessage: row.owner_message,
    rewardType: (VALID_REWARD_TYPES.has(row.reward_type) ? row.reward_type : 'none') as RewardType,
    rewardAmount: row.reward_amount,
    rewardDescription: row.reward_description ?? '',
    photoUrl: row.photo_url,
    conversationCount: Number(row.conversation_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderRole: row.sender_role as 'finder' | 'owner',
    senderLabel: row.sender_label,
    body: row.body,
    readStatus: Boolean(row.read_status),
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    itemId: row.item_id,
    conversationId: row.conversation_id,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function saveBase64Photo(dataUri: string): string | null {
  const match = dataUri.match(/^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }
  const extRaw = match[2] === 'jpg' ? 'jpeg' : match[2];
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > 5 * 1024 * 1024) {
    return null;
  }
  const filename = `${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(uploadsDir, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/uploads/${filename}`;
}

function isSafeUploadUrl(url: unknown): url is string {
  return typeof url === 'string' && /^\/uploads\/[a-zA-Z0-9._-]+$/.test(url);
}

function deleteUploadIfLocal(photoUrl: string | null): void {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return;
  const safeName = path.basename(photoUrl);
  const fullPath = path.join(uploadsDir, safeName);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      // Ignore cleanup error
    }
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// WebSocket connection tracking
interface WsMeta {
  ws: WebSocket;
  ownerId: string | null;
  conversationSubs: Set<string>;
}

const wsClients = new Set<WsMeta>();

function broadcastToConversation(conversationId: string, ownerId: string, event: string, payload: unknown): void {
  const frame = JSON.stringify({ event, conversationId, payload });
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (client.ownerId === ownerId || client.conversationSubs.has(conversationId)) {
      client.ws.send(frame);
    }
  }
}

function broadcastToOwner(ownerId: string, event: string, payload: unknown): void {
  const frame = JSON.stringify({ event, payload });
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (client.ownerId === ownerId) {
      client.ws.send(frame);
    }
  }
}

function createOwnerNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  itemId?: string | null;
  conversationId?: string | null;
}) {
  const id = crypto.randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, item_id, conversation_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, params.userId, params.type, params.title, params.body, params.itemId ?? null, params.conversationId ?? null, now);

  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as unknown as NotificationRow;
  const mapped = mapNotification(row);
  broadcastToOwner(params.userId, 'notification:created', mapped);
  return mapped;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

  const authRateLimit = createRateLimiter(
    15,
    15 * 60 * 1000,
    'Too many authentication attempts. Please wait a few minutes and try again.',
  );
  const publicRateLimit = createRateLimiter(
    45,
    60 * 1000,
    'Too many requests. Please slow down and try again shortly.',
  );
  const messageRateLimit = createRateLimiter(
    20,
    60 * 1000,
    'You are sending messages too quickly. Please wait a moment.',
  );

  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/signup', authRateLimit);
  app.use('/api/auth/forgot-password', authRateLimit);
  app.use('/api/auth/reset-password', authRateLimit);
  app.use('/api/public', publicRateLimit);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- AUTHENTICATED IMAGE UPLOAD (supports real XHR progress) ---

  app.post('/api/uploads/image', requireAuth, (req: AuthedRequest, res) => {
    const dataUri = typeof req.body?.dataUri === 'string' ? req.body.dataUri : '';
    const url = saveBase64Photo(dataUri);
    if (!url) {
      res.status(400).json({ error: 'Invalid image format or file exceeds 5 MB limit (JPEG, PNG, WebP only).' });
      return;
    }
    res.status(201).json({ url });
  });

  // --- AUTHENTICATION ---

  app.post('/api/auth/signup', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const fullName = String(req.body?.fullName ?? '').trim();

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (fullName.length < 2 || fullName.length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const id = crypto.randomUUID();
    const firstWord = fullName.split(/\s+/)[0] || 'Owner';
    const displayAlias = `${firstWord.slice(0, 24)} (Verified Owner)`;
    const passwordHash = bcrypt.hashSync(password, 10);
    const now = nowIso();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, display_alias, profile_image, phone, address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, '', '', ?, ?)
    `).run(id, email, passwordHash, fullName, displayAlias, now, now);

    createOwnerNotification({
      userId: id,
      type: 'account_activity',
      title: 'Welcome to TAGBACKLY',
      body: 'Your owner account is active. Register your first item to mint a unique QR recovery tag.',
    });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    const token = signSession({ id: user.id, email: user.email });
    setSessionCookie(res, token, req);

    res.status(201).json({
      token,
      user: mapUserProfile(user),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signSession({ id: user.id, email: user.email });
    setSessionCookie(res, token, req);

    res.json({
      token,
      user: mapUserProfile(user),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: isSecure ? 'none' : 'lax',
      secure: Boolean(isSecure),
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email) as { id: string; email: string } | undefined;
    if (!user) {
      res.json({
        message: 'If an account matches that email, a 6-digit reset code has been issued.',
        codeIssued: false,
      });
      return;
    }

    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const now = nowIso();

    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
    db.prepare(`
      INSERT INTO password_resets (id, user_id, email, reset_code, expires_at, used, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(crypto.randomUUID(), user.id, user.email, code, expiresAt, now);

    res.json({
      message: 'A 6-digit verification code has been generated for your account.',
      codeIssued: true,
      verificationCodePreview: code,
      expiresInMinutes: 15,
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '');

    if (!isValidEmail(email) || !code || newPassword.length < 8) {
      res.status(400).json({ error: 'Valid email, 6-digit code, and a password of at least 8 characters are required.' });
      return;
    }

    const resetRow = db.prepare(`
      SELECT * FROM password_resets
      WHERE email = ? AND reset_code = ? AND used = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(email, code) as { id: string; user_id: string; expires_at: string } | undefined;

    if (!resetRow) {
      res.status(400).json({ error: 'Invalid or already used verification code.' });
      return;
    }
    if (new Date(resetRow.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      return;
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const now = nowIso();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now, resetRow.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(resetRow.id);

    createOwnerNotification({
      userId: resetRow.user_id,
      type: 'account_activity',
      title: 'Password reset completed',
      body: 'Your account password was successfully reset via verification code.',
    });

    res.json({ message: 'Password updated successfully. You can now sign in.' });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!) as unknown as UserRow;
    res.json({ user: mapUserProfile(user) });
  });

  app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!) as unknown as UserRow;
    const fullName = String(req.body?.fullName ?? existing.full_name).trim();
    const displayAlias = String(req.body?.displayAlias ?? existing.display_alias).trim();
    const phone = String(req.body?.phone ?? existing.phone).trim();
    const address = String(req.body?.address ?? existing.address).trim();

    if (fullName.length < 2 || fullName.length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }
    if (displayAlias.length < 2 || displayAlias.length > 40) {
      res.status(400).json({ error: 'Public display alias must be between 2 and 40 characters.' });
      return;
    }
    if (phone.length > 40 || address.length > 240) {
      res.status(400).json({ error: 'Phone or address exceeds maximum length.' });
      return;
    }

    let profileImage = existing.profile_image;
    if (req.body?.removeProfileImage === true) {
      deleteUploadIfLocal(existing.profile_image);
      profileImage = null;
    } else if (isSafeUploadUrl(req.body?.profileImageUrl)) {
      if (existing.profile_image && existing.profile_image !== req.body.profileImageUrl) {
        deleteUploadIfLocal(existing.profile_image);
      }
      profileImage = req.body.profileImageUrl;
    } else if (typeof req.body?.profileImageData === 'string' && req.body.profileImageData.startsWith('data:image/')) {
      const saved = saveBase64Photo(req.body.profileImageData);
      if (!saved) {
        res.status(400).json({ error: 'Invalid profile image format or size (max 5MB).' });
        return;
      }
      deleteUploadIfLocal(existing.profile_image);
      profileImage = saved;
    }

    const now = nowIso();
    db.prepare(`
      UPDATE users
      SET full_name = ?, display_alias = ?, profile_image = ?, phone = ?, address = ?, updated_at = ?
      WHERE id = ?
    `).run(fullName, displayAlias, profileImage, phone, address, now, req.userId!);

    createOwnerNotification({
      userId: req.userId!,
      type: 'account_activity',
      title: 'Profile settings updated',
      body: 'Your account profile and privacy details were updated.',
    });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!) as unknown as UserRow;
    res.json({ user: mapUserProfile(updated) });
  });

  app.post('/api/profile/change-password', requireAuth, (req: AuthedRequest, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!) as unknown as UserRow;
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, nowIso(), req.userId!);

    createOwnerNotification({
      userId: req.userId!,
      type: 'account_activity',
      title: 'Password changed',
      body: 'Your account password was changed successfully.',
    });

    res.json({ message: 'Password updated successfully.' });
  });

  app.delete('/api/profile/account', requireAuth, (req: AuthedRequest, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    if (!currentPassword) {
      res.status(400).json({ error: 'Current password is required to delete your account.' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!) as UserRow | undefined;
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const userItems = db
      .prepare('SELECT photo_url FROM items WHERE owner_id = ?')
      .all(req.userId!) as unknown as Array<{ photo_url: string | null }>;

    deleteUploadIfLocal(user.profile_image);
    for (const item of userItems) {
      deleteUploadIfLocal(item.photo_url);
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.userId!);

    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: isSecure ? 'none' : 'lax',
      secure: Boolean(isSecure),
      path: '/',
    });

    res.json({ ok: true, message: 'Account and all associated items deleted permanently.' });
  });

  // --- DASHBOARD & ITEMS ---

  app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
    const ownerId = req.userId!;
    const counts = db.prepare(`
      SELECT
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'SAFE' THEN 1 ELSE 0 END) AS safe_items,
        SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) AS lost_items,
        SUM(CASE WHEN status = 'FOUND' THEN 1 ELSE 0 END) AS found_items,
        SUM(CASE WHEN status = 'CHATTING' THEN 1 ELSE 0 END) AS chatting_items,
        SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) AS returned_items
      FROM items
      WHERE owner_id = ?
    `).get(ownerId) as {
      total_items: number;
      safe_items: number | null;
      lost_items: number | null;
      found_items: number | null;
      chatting_items: number | null;
      returned_items: number | null;
    };

    const convCount = db.prepare(`
      SELECT COUNT(*) AS active_conversations
      FROM conversations
      WHERE owner_id = ? AND status = 'active' AND blocked_by_owner = 0 AND blocked_by_finder = 0
    `).get(ownerId) as { active_conversations: number };

    const unreadCount = db.prepare(`
      SELECT COUNT(*) AS unread_messages
      FROM messages m
      INNER JOIN conversations c ON c.id = m.conversation_id
      WHERE c.owner_id = ? AND m.sender_role = 'finder' AND m.read_status = 0 AND c.blocked_by_owner = 0
    `).get(ownerId) as { unread_messages: number };

    res.json({
      stats: {
        totalItems: Number(counts.total_items ?? 0),
        safeItems: Number(counts.safe_items ?? 0),
        lostItems: Number(counts.lost_items ?? 0),
        foundItems: Number(counts.found_items ?? 0),
        chattingItems: Number(counts.chatting_items ?? 0),
        returnedItems: Number(counts.returned_items ?? 0),
        activeConversations: Number(convCount.active_conversations ?? 0),
        unreadMessages: Number(unreadCount.unread_messages ?? 0),
      },
    });
  });

  app.get('/api/items', requireAuth, (req: AuthedRequest, res) => {
    const rows = db.prepare(`
      SELECT i.*,
        (SELECT COUNT(*) FROM conversations c WHERE c.item_id = i.id AND c.blocked_by_owner = 0) AS conversation_count
      FROM items i
      WHERE i.owner_id = ?
      ORDER BY i.updated_at DESC
    `).all(req.userId!) as unknown as ItemRow[];

    res.json({ items: rows.map(mapItem) });
  });

  app.post('/api/items', requireAuth, (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? '').trim();
    const category = String(req.body?.category ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const status = String(req.body?.status ?? 'SAFE').trim().toUpperCase();
    const ownerMessage = String(req.body?.ownerMessage ?? '').trim();
    const rewardType = String(req.body?.rewardType ?? 'none').trim().toLowerCase();
    const rewardAmount = String(req.body?.rewardAmount ?? '').trim();
    const rewardDescription = String(req.body?.rewardDescription ?? '').trim();
    const photoData = typeof req.body?.photoData === 'string' ? req.body.photoData : null;
    const photoUrlInput = req.body?.photoUrl;

    if (name.length < 2 || name.length > 100) {
      res.status(400).json({ error: 'Item name must be between 2 and 100 characters.' });
      return;
    }
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Please select a valid category.' });
      return;
    }
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ error: 'Please select a valid status (SAFE, LOST, FOUND, CHATTING, RETURNED).' });
      return;
    }
    if (!VALID_REWARD_TYPES.has(rewardType)) {
      res.status(400).json({ error: 'Invalid reward type.' });
      return;
    }
    if (description.length < 3 || description.length > 1000) {
      res.status(400).json({ error: 'Description must be between 3 and 1000 characters.' });
      return;
    }
    if (ownerMessage.length > 500) {
      res.status(400).json({ error: 'Owner message cannot exceed 500 characters.' });
      return;
    }
    if (rewardAmount.length > 120 || rewardDescription.length > 300) {
      res.status(400).json({ error: 'Reward details exceed maximum length.' });
      return;
    }
    if (rewardType === 'amount' && !rewardAmount) {
      res.status(400).json({ error: 'Please enter a reward amount or select No Reward.' });
      return;
    }
    if (rewardType === 'custom' && !rewardDescription) {
      res.status(400).json({ error: 'Please enter a custom reward description or select No Reward.' });
      return;
    }

    let photoUrl: string | null = null;
    if (isSafeUploadUrl(photoUrlInput)) {
      photoUrl = photoUrlInput;
    } else if (photoData) {
      photoUrl = saveBase64Photo(photoData);
      if (!photoUrl) {
        res.status(400).json({ error: 'Invalid photo format or file too large (max 5MB JPEG/PNG/WebP).' });
        return;
      }
    }

    const id = crypto.randomUUID();
    const publicSlug = generateSlug();
    const now = nowIso();
    const finalAmount = rewardType === 'amount' ? rewardAmount : '';
    const finalDesc = rewardType === 'custom' ? rewardDescription : '';

    db.prepare(`
      INSERT INTO items (id, owner_id, public_slug, name, category, description, status, owner_message, reward_type, reward_amount, reward_description, photo_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.userId!,
      publicSlug,
      name,
      category,
      description,
      status,
      ownerMessage,
      rewardType,
      finalAmount,
      finalDesc,
      photoUrl,
      now,
      now,
    );

    createOwnerNotification({
      userId: req.userId!,
      type: 'status_update',
      title: `Item registered: ${name}`,
      body: `Status set to ${status}. Unique QR tag ${publicSlug} is ready.`,
      itemId: id,
    });

    const created = db.prepare('SELECT *, 0 AS conversation_count FROM items WHERE id = ?').get(id) as unknown as ItemRow;
    res.status(201).json({ item: mapItem(created) });
  });

  app.get('/api/items/:id', requireAuth, (req: AuthedRequest, res) => {
    const row = db.prepare(`
      SELECT i.*,
        (SELECT COUNT(*) FROM conversations c WHERE c.item_id = i.id AND c.blocked_by_owner = 0) AS conversation_count
      FROM items i
      WHERE i.id = ? AND i.owner_id = ?
    `).get(req.params.id, req.userId!) as ItemRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }
    res.json({ item: mapItem(row) });
  });

  app.patch('/api/items/:id', requireAuth, (req: AuthedRequest, res) => {
    const existing = db.prepare('SELECT * FROM items WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId!) as ItemRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const category = req.body?.category !== undefined ? String(req.body.category).trim() : existing.category;
    const description = req.body?.description !== undefined ? String(req.body.description).trim() : existing.description;
    const status = req.body?.status !== undefined ? String(req.body.status).trim().toUpperCase() : existing.status;
    const ownerMessage = req.body?.ownerMessage !== undefined ? String(req.body.ownerMessage).trim() : existing.owner_message;
    const rewardType = req.body?.rewardType !== undefined ? String(req.body.rewardType).trim().toLowerCase() : existing.reward_type;
    const rewardAmountRaw = req.body?.rewardAmount !== undefined ? String(req.body.rewardAmount).trim() : existing.reward_amount;
    const rewardDescriptionRaw =
      req.body?.rewardDescription !== undefined ? String(req.body.rewardDescription).trim() : existing.reward_description;

    if (name.length < 2 || name.length > 100) {
      res.status(400).json({ error: 'Item name must be between 2 and 100 characters.' });
      return;
    }
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Invalid category.' });
      return;
    }
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }
    if (!VALID_REWARD_TYPES.has(rewardType)) {
      res.status(400).json({ error: 'Invalid reward type.' });
      return;
    }
    if (description.length < 3 || description.length > 1000) {
      res.status(400).json({ error: 'Description must be between 3 and 1000 characters.' });
      return;
    }
    if (ownerMessage.length > 500 || rewardAmountRaw.length > 120 || rewardDescriptionRaw.length > 300) {
      res.status(400).json({ error: 'Owner message or reward exceeds maximum length.' });
      return;
    }

    const rewardAmount = rewardType === 'amount' ? rewardAmountRaw : '';
    const rewardDescription = rewardType === 'custom' ? rewardDescriptionRaw : '';

    let photoUrl = existing.photo_url;
    if (req.body?.removePhoto === true) {
      deleteUploadIfLocal(existing.photo_url);
      photoUrl = null;
    } else if (isSafeUploadUrl(req.body?.photoUrl)) {
      if (existing.photo_url && existing.photo_url !== req.body.photoUrl) {
        deleteUploadIfLocal(existing.photo_url);
      }
      photoUrl = req.body.photoUrl;
    } else if (typeof req.body?.photoData === 'string' && req.body.photoData.startsWith('data:image/')) {
      const saved = saveBase64Photo(req.body.photoData);
      if (!saved) {
        res.status(400).json({ error: 'Invalid photo format or file too large.' });
        return;
      }
      deleteUploadIfLocal(existing.photo_url);
      photoUrl = saved;
    }

    const now = nowIso();
    db.prepare(`
      UPDATE items
      SET name = ?, category = ?, description = ?, status = ?, owner_message = ?, reward_type = ?, reward_amount = ?, reward_description = ?, photo_url = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      name,
      category,
      description,
      status,
      ownerMessage,
      rewardType,
      rewardAmount,
      rewardDescription,
      photoUrl,
      now,
      existing.id,
      req.userId!,
    );

    if (status !== existing.status) {
      createOwnerNotification({
        userId: req.userId!,
        type: 'status_update',
        title: `Status updated: ${name}`,
        body: `Item status changed from ${existing.status} to ${status}.`,
        itemId: existing.id,
      });
    }

    const updated = db.prepare(`
      SELECT i.*,
        (SELECT COUNT(*) FROM conversations c WHERE c.item_id = i.id AND c.blocked_by_owner = 0) AS conversation_count
      FROM items i WHERE i.id = ?
    `).get(existing.id) as unknown as ItemRow;

    res.json({ item: mapItem(updated) });
  });

  app.delete('/api/items/:id', requireAuth, (req: AuthedRequest, res) => {
    const existing = db.prepare('SELECT id, photo_url FROM items WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId!) as { id: string; photo_url: string | null } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }
    deleteUploadIfLocal(existing.photo_url);
    db.prepare('DELETE FROM items WHERE id = ? AND owner_id = ?').run(existing.id, req.userId!);
    res.json({ ok: true });
  });

  // --- OWNER NOTIFICATIONS ---

  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const rows = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 60
    `).all(req.userId!) as unknown as NotificationRow[];

    const unreadCount = rows.filter((r) => !r.is_read).length;
    res.json({ notifications: rows.map(mapNotification), unreadCount });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.userId!);
    res.json({ ok: true });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!);
    res.json({ ok: true });
  });

  // --- OWNER CONVERSATIONS ---

  app.get('/api/conversations', requireAuth, (req: AuthedRequest, res) => {
    const rows = db.prepare(`
      SELECT
        c.*,
        i.name AS item_name,
        i.public_slug AS item_slug,
        i.status AS item_status,
        i.photo_url AS item_photo_url,
        (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_body,
        (SELECT m.sender_role FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_role,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_role = 'finder' AND m.read_status = 0) AS unread_count
      FROM conversations c
      INNER JOIN items i ON i.id = c.item_id
      WHERE c.owner_id = ?
      ORDER BY c.last_message_at DESC
    `).all(req.userId!) as unknown as Array<
      ConversationRow & {
        item_name: string;
        item_slug: string;
        item_status: string;
        item_photo_url: string | null;
        last_message_body: string | null;
        last_sender_role: string | null;
        message_count: number;
        unread_count: number;
      }
    >;

    res.json({
      conversations: rows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        itemName: r.item_name,
        itemSlug: r.item_slug,
        itemStatus: r.item_status as ItemStatus,
        itemPhotoUrl: r.item_photo_url,
        finderLabel: r.finder_label,
        status: r.status as 'active' | 'resolved' | 'blocked',
        blockedByOwner: Boolean(r.blocked_by_owner),
        blockedByFinder: Boolean(r.blocked_by_finder),
        lastMessageAt: r.last_message_at,
        lastMessageBody: r.last_message_body,
        lastSenderRole: (r.last_sender_role as 'finder' | 'owner' | null) ?? null,
        messageCount: Number(r.message_count ?? 0),
        unreadCount: Number(r.unread_count ?? 0),
        createdAt: r.created_at,
      })),
    });
  });

  app.get('/api/conversations/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId!) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    // Mark finder messages read when owner opens conversation
    db.prepare(`UPDATE messages SET read_status = 1 WHERE conversation_id = ? AND sender_role = 'finder' AND read_status = 0`).run(conv.id);
    broadcastToConversation(conv.id, conv.owner_id, 'messages:read', { conversationId: conv.id, readerRole: 'owner' });

    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conv.id) as unknown as MessageRow[];
    res.json({
      conversation: {
        id: conv.id,
        itemId: conv.item_id,
        finderLabel: conv.finder_label,
        status: conv.status,
        blockedByOwner: Boolean(conv.blocked_by_owner),
        blockedByFinder: Boolean(conv.blocked_by_finder),
      },
      messages: messages.map(mapMessage),
    });
  });

  app.post('/api/conversations/:id/read', requireAuth, (req: AuthedRequest, res) => {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId!) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    db.prepare(`UPDATE messages SET read_status = 1 WHERE conversation_id = ? AND sender_role = 'finder' AND read_status = 0`).run(conv.id);
    broadcastToConversation(conv.id, conv.owner_id, 'messages:read', { conversationId: conv.id, readerRole: 'owner' });
    res.json({ ok: true });
  });

  app.post('/api/conversations/:id/messages', requireAuth, messageRateLimit, (req: AuthedRequest, res) => {
    const body = String(req.body?.body ?? '').trim();
    if (!body || body.length > 2000) {
      res.status(400).json({ error: 'Message must be between 1 and 2000 characters.' });
      return;
    }

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId!) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    if (conv.blocked_by_owner || conv.blocked_by_finder || conv.status === 'blocked') {
      res.status(403).json({ error: 'This conversation is blocked.' });
      return;
    }
    if (isSpamDuplicate(conv.id, req.userId!, body)) {
      res.status(429).json({ error: 'Duplicate message blocked by spam protection.' });
      return;
    }

    const owner = db.prepare('SELECT display_alias FROM users WHERE id = ?').get(req.userId!) as { display_alias: string };
    const msgId = crypto.randomUUID();
    const now = nowIso();

    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_role, sender_label, body, read_status, created_at)
      VALUES (?, ?, 'owner', ?, ?, 0, ?)
    `).run(msgId, conv.id, owner.display_alias, body, now);

    db.prepare(`UPDATE conversations SET last_message_at = ?, status = 'active' WHERE id = ?`).run(now, conv.id);

    const created = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId) as unknown as MessageRow;
    const mapped = mapMessage(created);
    broadcastToConversation(conv.id, conv.owner_id, 'message:created', mapped);
    res.status(201).json({ message: mapped });
  });

  app.post('/api/conversations/:id/block', requireAuth, (req: AuthedRequest, res) => {
    const blocked = Boolean(req.body?.blocked ?? true);
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId!) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const nextStatus = blocked ? 'blocked' : conv.blocked_by_finder ? 'blocked' : 'active';
    db.prepare('UPDATE conversations SET blocked_by_owner = ?, status = ? WHERE id = ?').run(blocked ? 1 : 0, nextStatus, conv.id);

    broadcastToConversation(conv.id, conv.owner_id, 'conversation:updated', {
      id: conv.id,
      status: nextStatus,
      blockedByOwner: blocked,
      blockedByFinder: Boolean(conv.blocked_by_finder),
    });

    res.json({ ok: true, blockedByOwner: blocked, status: nextStatus });
  });

  app.post('/api/conversations/:id/resolve', requireAuth, (req: AuthedRequest, res) => {
    const markReturned = Boolean(req.body?.markReturned);
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId!) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    db.prepare(`UPDATE conversations SET status = 'resolved' WHERE id = ?`).run(conv.id);
    if (markReturned) {
      const item = db.prepare('SELECT name, status FROM items WHERE id = ? AND owner_id = ?').get(conv.item_id, req.userId!) as { name: string; status: string } | undefined;
      db.prepare(`UPDATE items SET status = 'RETURNED', updated_at = ? WHERE id = ? AND owner_id = ?`).run(nowIso(), conv.item_id, req.userId!);
      if (item && item.status !== 'RETURNED') {
        createOwnerNotification({
          userId: req.userId!,
          type: 'status_update',
          title: `Item returned: ${item.name}`,
          body: 'Item marked as RETURNED and conversation resolved.',
          itemId: conv.item_id,
          conversationId: conv.id,
        });
      }
    }

    broadcastToConversation(conv.id, conv.owner_id, 'conversation:updated', {
      id: conv.id,
      status: 'resolved',
      blockedByOwner: Boolean(conv.blocked_by_owner),
      blockedByFinder: Boolean(conv.blocked_by_finder),
    });

    res.json({ ok: true, status: 'resolved' });
  });

  // --- PUBLIC QR LANDING & FINDER EXPERIENCE (ZERO PRIVATE OWNER PII) ---

  app.get('/api/public/items/:slug', (req, res) => {
    const slug = String(req.params.slug ?? '').trim();
    const row = db.prepare(`
      SELECT
        i.public_slug,
        i.name,
        i.category,
        i.description,
        i.status,
        i.owner_message,
        i.reward_type,
        i.reward_amount,
        i.reward_description,
        i.photo_url,
        i.updated_at,
        u.display_alias AS owner_alias
      FROM items i
      INNER JOIN users u ON u.id = i.owner_id
      WHERE i.public_slug = ?
    `).get(slug) as
      | {
          public_slug: string;
          name: string;
          category: string;
          description: string;
          status: string;
          owner_message: string;
          reward_type: string;
          reward_amount: string;
          reward_description: string;
          photo_url: string | null;
          updated_at: string;
          owner_alias: string;
        }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'No registered item was found for this QR tag.' });
      return;
    }

    res.json({
      item: {
        publicSlug: row.public_slug,
        name: row.name,
        category: row.category as ItemCategory,
        description: row.description,
        status: row.status as ItemStatus,
        ownerMessage: row.owner_message,
        rewardType: (VALID_REWARD_TYPES.has(row.reward_type) ? row.reward_type : 'none') as RewardType,
        rewardAmount: row.reward_amount,
        rewardDescription: row.reward_description ?? '',
        photoUrl: row.photo_url,
        ownerAlias: row.owner_alias,
        updatedAt: row.updated_at,
      },
    });
  });

  app.get('/api/public/items/:slug/conversation', (req, res) => {
    const slug = String(req.params.slug ?? '').trim();
    const finderToken = String(req.headers['x-finder-token'] ?? req.query.finderToken ?? '').trim();
    if (!finderToken || finderToken.length < 8) {
      res.json({ conversation: null, messages: [] });
      return;
    }

    const item = db.prepare('SELECT id FROM items WHERE public_slug = ?').get(slug) as { id: string } | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }

    const conv = db.prepare(`
      SELECT * FROM conversations WHERE item_id = ? AND finder_token = ? ORDER BY created_at DESC LIMIT 1
    `).get(item.id, finderToken) as ConversationRow | undefined;

    if (!conv) {
      res.json({ conversation: null, messages: [] });
      return;
    }

    // Mark owner replies as read when finder loads the thread
    db.prepare(`UPDATE messages SET read_status = 1 WHERE conversation_id = ? AND sender_role = 'owner' AND read_status = 0`).run(conv.id);

    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conv.id) as unknown as MessageRow[];
    res.json({
      conversation: {
        id: conv.id,
        finderLabel: conv.finder_label,
        status: conv.status,
        blockedByOwner: Boolean(conv.blocked_by_owner),
        blockedByFinder: Boolean(conv.blocked_by_finder),
        createdAt: conv.created_at,
      },
      messages: messages.map(mapMessage),
    });
  });

  app.post('/api/public/items/:slug/conversations', (req, res) => {
    const slug = String(req.params.slug ?? '').trim();
    const finderToken = String(req.body?.finderToken ?? '').trim();
    const finderLabelRaw = String(req.body?.finderLabel ?? '').trim();
    const finderLabel = finderLabelRaw ? finderLabelRaw.slice(0, 60) : 'Anonymous Finder';
    const messageBody = String(req.body?.message ?? '').trim();

    if (!finderToken || finderToken.length < 8 || finderToken.length > 128) {
      res.status(400).json({ error: 'Invalid finder session token.' });
      return;
    }
    if (!messageBody || messageBody.length > 2000) {
      res.status(400).json({ error: 'Please write a message (up to 2000 characters).' });
      return;
    }

    const item = db.prepare('SELECT id, owner_id, name, status FROM items WHERE public_slug = ?').get(slug) as {
      id: string;
      owner_id: string;
      name: string;
      status: string;
    } | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }

    let conv = db.prepare(`
      SELECT * FROM conversations WHERE item_id = ? AND finder_token = ? ORDER BY created_at DESC LIMIT 1
    `).get(item.id, finderToken) as ConversationRow | undefined;

    const now = nowIso();
    let isNewChat = false;
    if (conv) {
      if (conv.blocked_by_owner || conv.blocked_by_finder || conv.status === 'blocked') {
        res.status(403).json({ error: 'Messaging has been blocked for this conversation.' });
        return;
      }
    } else {
      isNewChat = true;
      const convId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO conversations (id, item_id, owner_id, finder_token, finder_label, status, blocked_by_owner, blocked_by_finder, last_message_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', 0, 0, ?, ?)
      `).run(convId, item.id, item.owner_id, finderToken, finderLabel, now, now);
      conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) as unknown as ConversationRow;
    }

    const msgId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_role, sender_label, body, read_status, created_at)
      VALUES (?, ?, 'finder', ?, ?, 0, ?)
    `).run(msgId, conv.id, conv.finder_label, messageBody, now);

    db.prepare(`UPDATE conversations SET last_message_at = ?, status = 'active' WHERE id = ?`).run(now, conv.id);

    // Transition item status to CHATTING if not already RETURNED or CHATTING
    let nextItemStatus = item.status;
    if (item.status !== 'RETURNED' && item.status !== 'CHATTING') {
      nextItemStatus = 'CHATTING';
      db.prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run('CHATTING', now, item.id);
      createOwnerNotification({
        userId: item.owner_id,
        type: 'status_update',
        title: `Status updated: ${item.name}`,
        body: `Status automatically switched to CHATTING because a finder started a conversation.`,
        itemId: item.id,
        conversationId: conv.id,
      });
    } else {
      db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(now, item.id);
    }

    createOwnerNotification({
      userId: item.owner_id,
      type: isNewChat ? 'new_chat' : 'new_message',
      title: isNewChat ? `New finder chat for ${item.name}` : `New message from ${conv.finder_label}`,
      body: messageBody.slice(0, 140),
      itemId: item.id,
      conversationId: conv.id,
    });

    const createdMsg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId) as unknown as MessageRow;
    const mappedMsg = mapMessage(createdMsg);

    broadcastToConversation(conv.id, item.owner_id, 'message:created', mappedMsg);
    broadcastToConversation(conv.id, item.owner_id, 'conversation:updated', {
      id: conv.id,
      status: conv.status,
      blockedByOwner: false,
      blockedByFinder: false,
      itemStatus: nextItemStatus,
    });

    res.status(201).json({
      conversation: {
        id: conv.id,
        finderLabel: conv.finder_label,
        status: conv.status,
        blockedByOwner: false,
        blockedByFinder: false,
        createdAt: conv.created_at,
      },
      message: mappedMsg,
      itemStatus: nextItemStatus,
    });
  });

  app.post('/api/public/conversations/:id/messages', messageRateLimit, (req, res) => {
    const finderToken = String(req.body?.finderToken ?? '').trim();
    const body = String(req.body?.body ?? '').trim();

    if (!finderToken || !body || body.length > 2000) {
      res.status(400).json({ error: 'Valid session and message (1-2000 characters) are required.' });
      return;
    }

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND finder_token = ?').get(req.params.id, finderToken) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    if (conv.blocked_by_owner || conv.blocked_by_finder || conv.status === 'blocked') {
      res.status(403).json({ error: 'Messaging is unavailable because this contact has been blocked.' });
      return;
    }
    if (isSpamDuplicate(conv.id, finderToken, body)) {
      res.status(429).json({ error: 'Duplicate message blocked by spam protection. Please avoid repeating messages.' });
      return;
    }

    const item = db.prepare('SELECT name FROM items WHERE id = ?').get(conv.item_id) as { name: string } | undefined;

    const msgId = crypto.randomUUID();
    const now = nowIso();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_role, sender_label, body, read_status, created_at)
      VALUES (?, ?, 'finder', ?, ?, 0, ?)
    `).run(msgId, conv.id, conv.finder_label, body, now);

    db.prepare(`UPDATE conversations SET last_message_at = ?, status = 'active' WHERE id = ?`).run(now, conv.id);

    createOwnerNotification({
      userId: conv.owner_id,
      type: 'new_message',
      title: `New message on ${item?.name ?? 'registered item'}`,
      body: `${conv.finder_label}: ${body.slice(0, 120)}`,
      itemId: conv.item_id,
      conversationId: conv.id,
    });

    const createdMsg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId) as unknown as MessageRow;
    const mapped = mapMessage(createdMsg);
    broadcastToConversation(conv.id, conv.owner_id, 'message:created', mapped);
    res.status(201).json({ message: mapped });
  });

  app.post('/api/public/conversations/:id/read', (req, res) => {
    const finderToken = String(req.body?.finderToken ?? '').trim();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND finder_token = ?').get(req.params.id, finderToken) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    db.prepare(`UPDATE messages SET read_status = 1 WHERE conversation_id = ? AND sender_role = 'owner' AND read_status = 0`).run(conv.id);
    broadcastToConversation(conv.id, conv.owner_id, 'messages:read', { conversationId: conv.id, readerRole: 'finder' });
    res.json({ ok: true });
  });

  app.post('/api/public/conversations/:id/block', (req, res) => {
    const finderToken = String(req.body?.finderToken ?? '').trim();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND finder_token = ?').get(req.params.id, finderToken) as ConversationRow | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    db.prepare(`UPDATE conversations SET blocked_by_finder = 1, status = 'blocked' WHERE id = ?`).run(conv.id);
    broadcastToConversation(conv.id, conv.owner_id, 'conversation:updated', {
      id: conv.id,
      status: 'blocked',
      blockedByOwner: Boolean(conv.blocked_by_owner),
      blockedByFinder: true,
    });
    res.json({ ok: true, status: 'blocked', blockedByFinder: true });
  });

  app.post('/api/public/report-abuse', (req, res) => {
    const itemSlug = req.body?.itemSlug ? String(req.body.itemSlug).trim() : null;
    const conversationId = req.body?.conversationId ? String(req.body.conversationId).trim() : null;
    const reporterRole = req.body?.reporterRole === 'owner' ? 'owner' : 'finder';
    const reason = String(req.body?.reason ?? '').trim();
    const details = String(req.body?.details ?? '').trim().slice(0, 1000);

    if (!reason || reason.length > 120) {
      res.status(400).json({ error: 'Please select a reason for reporting.' });
      return;
    }

    let itemId: string | null = null;
    if (itemSlug) {
      const item = db.prepare('SELECT id FROM items WHERE public_slug = ?').get(itemSlug) as { id: string } | undefined;
      itemId = item?.id ?? null;
    }

    db.prepare(`
      INSERT INTO abuse_reports (id, item_id, conversation_id, reporter_role, reason, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), itemId, conversationId, reporterRole, reason, details, nowIso());

    res.status(201).json({ ok: true, message: 'Report submitted. Thank you for keeping TAGBACKLY safe.' });
  });

  // --- VITE / STATIC SERVING ---

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const meta: WsMeta = {
      ws,
      ownerId: null,
      conversationSubs: new Set(),
    };
    wsClients.add(meta);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          token?: string;
          conversationId?: string;
          finderToken?: string;
        };
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          try {
            const decoded = jwt.verify(msg.token, JWT_SECRET) as AuthTokenPayload;
            meta.ownerId = decoded.sub;
          } catch {
            meta.ownerId = null;
          }
        } else if (msg.type === 'subscribe_conversation' && msg.conversationId && msg.finderToken) {
          const conv = db
            .prepare('SELECT id FROM conversations WHERE id = ? AND finder_token = ?')
            .get(msg.conversationId, msg.finderToken) as { id: string } | undefined;
          if (conv) {
            meta.conversationSubs.add(conv.id);
          }
        }
      } catch {
        // Ignore malformed WS frame
      }
    });

    ws.on('close', () => {
      wsClients.delete(meta);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TAGBACKLY server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TAGBACKLY server:', err);
  process.exit(1);
});
