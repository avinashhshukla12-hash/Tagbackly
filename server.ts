import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { getJwtSecret, uploadsDir } from './server/db.ts';
import { verifyFirebasePhoneIdToken } from './server/firebaseAdmin.ts';
import {
  activeStorageBackend,
  deleteUploadedImage,
  isSafeUploadUrl,
  saveUploadedImage,
  store,
  type ItemRow,
  type MessageRow,
  type NotificationRow,
  type UserRow,
} from './server/store.ts';
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
  phone: string;
  email?: string | null;
}

interface AuthedRequest extends Request {
  userId?: string;
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

export function normalizeIndianPhone(input: unknown): string | null {
  const cleaned = String(input ?? '').replace(/[\s()-]/g, '').trim();
  if (!cleaned) return null;
  let digits = cleaned;
  if (digits.startsWith('+91')) {
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!/^\d{10}$/.test(digits)) {
    return null;
  }
  return `+91${digits}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function asyncRoute(
  fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void> | void,
) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
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

function signSession(user: { id: string; phone: string; email?: string | null }): string {
  return jwt.sign(
    { sub: user.id, phone: user.phone, email: user.email ?? null } satisfies AuthTokenPayload,
    JWT_SECRET,
    { expiresIn: '14d' },
  );
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

const requireAuth = asyncRoute(async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  let decoded: AuthTokenPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }
  const user = await store.findUserById(decoded.sub);
  if (!user) {
    res.status(401).json({ error: 'Account not found' });
    return;
  }
  req.userId = user.id;
  next();
});

function mapUserProfile(row: UserRow) {
  return {
    id: row.id,
    email: row.email ?? null,
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

// WebSocket connection tracking
interface WsMeta {
  ws: WebSocket;
  ownerId: string | null;
  conversationSubs: Set<string>;
}

const wsClients = new Set<WsMeta>();

function broadcastToConversation(
  conversationId: string,
  ownerId: string,
  event: string,
  payload: unknown,
): void {
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

async function createOwnerNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  itemId?: string | null;
  conversationId?: string | null;
}) {
  const row = await store.createNotification({
    id: crypto.randomUUID(),
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    item_id: params.itemId ?? null,
    conversation_id: params.conversationId ?? null,
    is_read: 0,
    created_at: nowIso(),
  });
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
    25,
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
    res.json({
      status: 'ok',
      storage: activeStorageBackend,
    });
  });

  // --- AUTHENTICATED IMAGE UPLOAD (supports real XHR progress) ---

  app.post(
    '/api/uploads/image',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const dataUri = typeof req.body?.dataUri === 'string' ? req.body.dataUri : '';
      const url = await saveUploadedImage(dataUri);
      if (!url) {
        res.status(400).json({
          error: 'Invalid image format or file exceeds 5 MB limit (JPEG, PNG, WebP only).',
        });
        return;
      }
      res.status(201).json({ url });
    }),
  );

  // --- AUTHENTICATION (+91 10-digit Mobile Number + Password) ---

  app.post(
    '/api/auth/signup',
    asyncRoute(async (req, res) => {
      const fullName = String(req.body?.fullName ?? '').trim();
      const phone = normalizeIndianPhone(req.body?.phone);
      const password = String(req.body?.password ?? '');
      const confirmPassword =
        req.body?.confirmPassword !== undefined ? String(req.body.confirmPassword) : undefined;
      const optionalEmailRaw = String(req.body?.email ?? '').trim().toLowerCase();
      const optionalEmail = optionalEmailRaw ? optionalEmailRaw : null;

      if (fullName.length < 2 || fullName.length > 80) {
        res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
        return;
      }
      if (!phone) {
        res.status(400).json({ error: 'Please enter a valid 10-digit +91 mobile number.' });
        return;
      }
      if (optionalEmail && !isValidEmail(optionalEmail)) {
        res.status(400).json({ error: 'Optional email address is invalid.' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }
      if (confirmPassword !== undefined && password !== confirmPassword) {
        res.status(400).json({ error: 'Password and Confirm Password do not match.' });
        return;
      }

      const existingPhone = await store.findUserByPhone(phone);
      if (existingPhone) {
        res.status(409).json({ error: 'An account with this +91 mobile number already exists.' });
        return;
      }
      if (optionalEmail) {
        const existingEmail = await store.findUserByEmail(optionalEmail);
        if (existingEmail) {
          res.status(409).json({ error: 'An account with this email already exists.' });
          return;
        }
      }

      const id = crypto.randomUUID();
      const firstWord = fullName.split(/\s+/)[0] || 'Owner';
      const displayAlias = `${firstWord.slice(0, 24)} (Verified Owner)`;
      const passwordHash = bcrypt.hashSync(password, 10);
      const now = nowIso();

      const user = await store.createUser({
        id,
        email: optionalEmail,
        password_hash: passwordHash,
        full_name: fullName,
        display_alias: displayAlias,
        profile_image: null,
        phone,
        address: '',
        created_at: now,
        updated_at: now,
      });

      await createOwnerNotification({
        userId: user.id,
        type: 'account_activity',
        title: 'Welcome to TAGBACKLY',
        body: 'Your owner account is active. Register your first item to mint a unique QR recovery tag.',
      });

      const token = signSession({ id: user.id, phone: user.phone, email: user.email });
      setSessionCookie(res, token, req);

      res.status(201).json({
        token,
        user: mapUserProfile(user),
      });
    }),
  );

  app.post(
    '/api/auth/login',
    asyncRoute(async (req, res) => {
      const phoneInput = req.body?.phone;
      const emailInput = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');

      if (!password) {
        res.status(400).json({ error: 'Mobile number and password are required.' });
        return;
      }

      let user: UserRow | undefined;
      if (phoneInput !== undefined && String(phoneInput).trim() !== '') {
        const phone = normalizeIndianPhone(phoneInput);
        if (!phone) {
          res.status(400).json({ error: 'Please enter a valid 10-digit +91 mobile number.' });
          return;
        }
        user = await store.findUserByPhone(phone);
      } else if (emailInput) {
        user = await store.findUserByEmail(emailInput);
      } else {
        res.status(400).json({ error: '10-digit +91 mobile number and password are required.' });
        return;
      }

      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid mobile number or password.' });
        return;
      }

      const token = signSession({ id: user.id, phone: user.phone, email: user.email });
      setSessionCookie(res, token, req);

      res.json({
        token,
        user: mapUserProfile(user),
      });
    }),
  );

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

  app.post(
    '/api/auth/forgot-password',
    asyncRoute(async (req, res) => {
      const phone = normalizeIndianPhone(req.body?.phone);
      if (!phone) {
        res.status(400).json({ error: 'Please enter a valid 10-digit +91 mobile number.' });
        return;
      }

      const user = await store.findUserByPhone(phone);
      if (!user) {
        res.status(404).json({
          error: 'No owner account found with this +91 mobile number.',
        });
        return;
      }

      res.json({
        ok: true,
        phone: user.phone,
        message: 'Account verified. Sending SMS OTP via Firebase Phone Auth.',
      });
    }),
  );

  app.post(
    '/api/auth/reset-password',
    asyncRoute(async (req, res) => {
      const phone = normalizeIndianPhone(req.body?.phone);
      const idToken = String(req.body?.idToken ?? '').trim();
      const newPassword = String(req.body?.newPassword ?? '');
      const confirmPassword =
        req.body?.confirmPassword !== undefined ? String(req.body.confirmPassword) : undefined;

      if (!phone || !idToken || newPassword.length < 8) {
        res.status(400).json({
          error:
            'Valid 10-digit +91 mobile number, SMS OTP verification token, and password of at least 8 characters are required.',
        });
        return;
      }
      if (confirmPassword !== undefined && newPassword !== confirmPassword) {
        res.status(400).json({ error: 'New Password and Confirm Password do not match.' });
        return;
      }

      let verifiedPhone: string;
      try {
        const verified = await verifyFirebasePhoneIdToken(idToken);
        verifiedPhone = normalizeIndianPhone(verified.phoneNumber) ?? verified.phoneNumber;
      } catch (err) {
        res.status(401).json({
          error:
            err instanceof Error
              ? `SMS OTP verification failed: ${err.message}`
              : 'Invalid or expired Firebase Phone verification token.',
        });
        return;
      }

      if (verifiedPhone !== phone) {
        res.status(403).json({
          error: 'Verified SMS mobile number does not match the requested account.',
        });
        return;
      }

      const user = await store.findUserByPhone(phone);
      if (!user) {
        res.status(404).json({ error: 'Owner account not found.' });
        return;
      }

      const passwordHash = bcrypt.hashSync(newPassword, 10);
      await store.updateUserPassword(user.id, passwordHash, nowIso());

      await createOwnerNotification({
        userId: user.id,
        type: 'account_activity',
        title: 'Password reset completed',
        body: 'Your account password was successfully reset using Firebase SMS OTP verification.',
      });

      res.json({
        message:
          'Password updated successfully via SMS OTP verification. You can now sign in with your mobile number.',
      });
    }),
  );

  app.get(
    '/api/auth/me',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const user = (await store.findUserById(req.userId!))!;
      res.json({ user: mapUserProfile(user) });
    }),
  );

  app.patch(
    '/api/profile',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const existing = (await store.findUserById(req.userId!))!;
      const fullName = String(req.body?.fullName ?? existing.full_name).trim();
      const displayAlias = String(req.body?.displayAlias ?? existing.display_alias).trim();
      const address = String(req.body?.address ?? existing.address).trim();
      const emailRaw =
        req.body?.email !== undefined ? String(req.body.email ?? '').trim().toLowerCase() : existing.email ?? '';
      const nextEmail = emailRaw ? emailRaw : null;

      if (fullName.length < 2 || fullName.length > 80) {
        res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
        return;
      }
      if (displayAlias.length < 2 || displayAlias.length > 40) {
        res.status(400).json({ error: 'Public display alias must be between 2 and 40 characters.' });
        return;
      }
      if (nextEmail && !isValidEmail(nextEmail)) {
        res.status(400).json({ error: 'Please enter a valid private recovery email or leave it blank.' });
        return;
      }
      if (nextEmail && nextEmail !== existing.email) {
        const emailOwner = await store.findUserByEmail(nextEmail);
        if (emailOwner && emailOwner.id !== existing.id) {
          res.status(409).json({ error: 'That email address is already linked to another account.' });
          return;
        }
      }
      if (address.length > 240) {
        res.status(400).json({ error: 'Address exceeds maximum length (240 characters).' });
        return;
      }

      let profileImage = existing.profile_image;
      if (req.body?.removeProfileImage === true) {
        await deleteUploadedImage(existing.profile_image);
        profileImage = null;
      } else if (isSafeUploadUrl(req.body?.profileImageUrl)) {
        if (existing.profile_image && existing.profile_image !== req.body.profileImageUrl) {
          await deleteUploadedImage(existing.profile_image);
        }
        profileImage = req.body.profileImageUrl;
      } else if (
        typeof req.body?.profileImageData === 'string' &&
        req.body.profileImageData.startsWith('data:image/')
      ) {
        const saved = await saveUploadedImage(req.body.profileImageData);
        if (!saved) {
          res.status(400).json({ error: 'Invalid profile image format or size (max 5MB).' });
          return;
        }
        await deleteUploadedImage(existing.profile_image);
        profileImage = saved;
      }

      const updated = await store.updateUserProfile(req.userId!, {
        full_name: fullName,
        display_alias: displayAlias,
        profile_image: profileImage,
        email: nextEmail,
        address,
        updated_at: nowIso(),
      });

      await createOwnerNotification({
        userId: req.userId!,
        type: 'account_activity',
        title: 'Profile settings updated',
        body: 'Your account profile and privacy details were updated.',
      });

      res.json({ user: mapUserProfile(updated) });
    }),
  );

  app.post(
    '/api/profile/change-password',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const currentPassword = String(req.body?.currentPassword ?? '');
      const newPassword = String(req.body?.newPassword ?? '');

      if (newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters.' });
        return;
      }

      const user = (await store.findUserById(req.userId!))!;
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const passwordHash = bcrypt.hashSync(newPassword, 10);
      await store.updateUserPassword(req.userId!, passwordHash, nowIso());

      await createOwnerNotification({
        userId: req.userId!,
        type: 'account_activity',
        title: 'Password changed',
        body: 'Your account password was changed successfully.',
      });

      res.json({ message: 'Password updated successfully.' });
    }),
  );

  app.delete(
    '/api/profile/account',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const currentPassword = String(req.body?.currentPassword ?? '');
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required to delete your account.' });
        return;
      }

      const user = await store.findUserById(req.userId!);
      if (!user) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const userItems = await store.listItemPhotosByOwner(req.userId!);
      await deleteUploadedImage(user.profile_image);
      for (const item of userItems) {
        await deleteUploadedImage(item.photo_url);
      }

      await store.deleteUser(req.userId!);

      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        sameSite: isSecure ? 'none' : 'lax',
        secure: Boolean(isSecure),
        path: '/',
      });

      res.json({ ok: true, message: 'Account and all associated items deleted permanently.' });
    }),
  );

  // --- DASHBOARD & ITEMS ---

  app.get(
    '/api/dashboard',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const stats = await store.getDashboardStats(req.userId!);
      res.json({ stats });
    }),
  );

  app.get(
    '/api/items',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const rows = await store.listItemsByOwner(req.userId!);
      res.json({ items: rows.map(mapItem) });
    }),
  );

  app.post(
    '/api/items',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
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
        photoUrl = await saveUploadedImage(photoData);
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

      const created = await store.createItem({
        id,
        owner_id: req.userId!,
        public_slug: publicSlug,
        name,
        category,
        description,
        status,
        owner_message: ownerMessage,
        reward_type: rewardType,
        reward_amount: finalAmount,
        reward_description: finalDesc,
        photo_url: photoUrl,
        created_at: now,
        updated_at: now,
      });

      await createOwnerNotification({
        userId: req.userId!,
        type: 'status_update',
        title: `Item registered: ${name}`,
        body: `Status set to ${status}. Unique QR tag ${publicSlug} is ready.`,
        itemId: id,
      });

      res.status(201).json({ item: mapItem(created) });
    }),
  );

  app.get(
    '/api/items/:id',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const row = await store.getItemByIdForOwner(req.params.id, req.userId!);
      if (!row) {
        res.status(404).json({ error: 'Item not found.' });
        return;
      }
      res.json({ item: mapItem(row) });
    }),
  );

  app.patch(
    '/api/items/:id',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const existing = await store.getItemByIdForOwner(req.params.id, req.userId!);
      if (!existing) {
        res.status(404).json({ error: 'Item not found.' });
        return;
      }

      const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
      const category =
        req.body?.category !== undefined ? String(req.body.category).trim() : existing.category;
      const description =
        req.body?.description !== undefined
          ? String(req.body.description).trim()
          : existing.description;
      const status =
        req.body?.status !== undefined
          ? String(req.body.status).trim().toUpperCase()
          : existing.status;
      const ownerMessage =
        req.body?.ownerMessage !== undefined
          ? String(req.body.ownerMessage).trim()
          : existing.owner_message;
      const rewardType =
        req.body?.rewardType !== undefined
          ? String(req.body.rewardType).trim().toLowerCase()
          : existing.reward_type;
      const rewardAmountRaw =
        req.body?.rewardAmount !== undefined
          ? String(req.body.rewardAmount).trim()
          : existing.reward_amount;
      const rewardDescriptionRaw =
        req.body?.rewardDescription !== undefined
          ? String(req.body.rewardDescription).trim()
          : existing.reward_description;

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
      if (
        ownerMessage.length > 500 ||
        rewardAmountRaw.length > 120 ||
        rewardDescriptionRaw.length > 300
      ) {
        res.status(400).json({ error: 'Owner message or reward exceeds maximum length.' });
        return;
      }

      const rewardAmount = rewardType === 'amount' ? rewardAmountRaw : '';
      const rewardDescription = rewardType === 'custom' ? rewardDescriptionRaw : '';

      let photoUrl = existing.photo_url;
      if (req.body?.removePhoto === true) {
        await deleteUploadedImage(existing.photo_url);
        photoUrl = null;
      } else if (isSafeUploadUrl(req.body?.photoUrl)) {
        if (existing.photo_url && existing.photo_url !== req.body.photoUrl) {
          await deleteUploadedImage(existing.photo_url);
        }
        photoUrl = req.body.photoUrl;
      } else if (
        typeof req.body?.photoData === 'string' &&
        req.body.photoData.startsWith('data:image/')
      ) {
        const saved = await saveUploadedImage(req.body.photoData);
        if (!saved) {
          res.status(400).json({ error: 'Invalid photo format or file too large.' });
          return;
        }
        await deleteUploadedImage(existing.photo_url);
        photoUrl = saved;
      }

      const updated = (await store.updateItem(existing.id, req.userId!, {
        name,
        category,
        description,
        status,
        owner_message: ownerMessage,
        reward_type: rewardType,
        reward_amount: rewardAmount,
        reward_description: rewardDescription,
        photo_url: photoUrl,
        updated_at: nowIso(),
      }))!;

      if (status !== existing.status) {
        await createOwnerNotification({
          userId: req.userId!,
          type: 'status_update',
          title: `Status updated: ${name}`,
          body: `Item status changed from ${existing.status} to ${status}.`,
          itemId: existing.id,
        });
      }

      res.json({ item: mapItem(updated) });
    }),
  );

  app.delete(
    '/api/items/:id',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const existing = await store.getItemByIdForOwner(req.params.id, req.userId!);
      if (!existing) {
        res.status(404).json({ error: 'Item not found.' });
        return;
      }
      await deleteUploadedImage(existing.photo_url);
      await store.deleteItem(existing.id, req.userId!);
      res.json({ ok: true });
    }),
  );

  // --- OWNER NOTIFICATIONS ---

  app.get(
    '/api/notifications',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const rows = await store.listNotifications(req.userId!);
      const unreadCount = rows.filter((r) => !r.is_read).length;
      res.json({ notifications: rows.map(mapNotification), unreadCount });
    }),
  );

  app.post(
    '/api/notifications/read-all',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      await store.markAllNotificationsRead(req.userId!);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/notifications/:id/read',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      await store.markNotificationRead(req.params.id, req.userId!);
      res.json({ ok: true });
    }),
  );

  // --- OWNER CONVERSATIONS ---

  app.get(
    '/api/conversations',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const rows = await store.listConversations(req.userId!);
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
    }),
  );

  app.get(
    '/api/conversations/:id/messages',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const conv = await store.getConversationForOwner(req.params.id, req.userId!);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }

      await store.markMessagesRead(conv.id, 'finder');
      broadcastToConversation(conv.id, conv.owner_id, 'messages:read', {
        conversationId: conv.id,
        readerRole: 'owner',
      });

      const messages = await store.listMessages(conv.id);
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
    }),
  );

  app.post(
    '/api/conversations/:id/read',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const conv = await store.getConversationForOwner(req.params.id, req.userId!);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      await store.markMessagesRead(conv.id, 'finder');
      broadcastToConversation(conv.id, conv.owner_id, 'messages:read', {
        conversationId: conv.id,
        readerRole: 'owner',
      });
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/conversations/:id/messages',
    requireAuth,
    messageRateLimit,
    asyncRoute(async (req: AuthedRequest, res) => {
      const body = String(req.body?.body ?? '').trim();
      if (!body || body.length > 2000) {
        res.status(400).json({ error: 'Message must be between 1 and 2000 characters.' });
        return;
      }

      const conv = await store.getConversationForOwner(req.params.id, req.userId!);
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

      const owner = (await store.findUserById(req.userId!))!;
      const now = nowIso();
      const created = await store.createMessage({
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_role: 'owner',
        sender_label: owner.display_alias,
        body,
        read_status: 0,
        created_at: now,
      });

      await store.updateConversation(conv.id, { last_message_at: now, status: 'active' });

      const mapped = mapMessage(created);
      broadcastToConversation(conv.id, conv.owner_id, 'message:created', mapped);
      res.status(201).json({ message: mapped });
    }),
  );

  app.post(
    '/api/conversations/:id/block',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const blocked = Boolean(req.body?.blocked ?? true);
      const conv = await store.getConversationForOwner(req.params.id, req.userId!);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      const nextStatus = blocked ? 'blocked' : conv.blocked_by_finder ? 'blocked' : 'active';
      await store.updateConversation(conv.id, {
        blocked_by_owner: blocked ? 1 : 0,
        status: nextStatus,
      });

      broadcastToConversation(conv.id, conv.owner_id, 'conversation:updated', {
        id: conv.id,
        status: nextStatus,
        blockedByOwner: blocked,
        blockedByFinder: Boolean(conv.blocked_by_finder),
      });

      res.json({ ok: true, blockedByOwner: blocked, status: nextStatus });
    }),
  );

  app.post(
    '/api/conversations/:id/resolve',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      const markReturned = Boolean(req.body?.markReturned);
      const conv = await store.getConversationForOwner(req.params.id, req.userId!);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }

      await store.updateConversation(conv.id, { status: 'resolved' });
      if (markReturned) {
        const item = await store.getItemByIdForOwner(conv.item_id, req.userId!);
        if (item) {
          await store.updateItemStatusSystem(item.id, { status: 'RETURNED', updated_at: nowIso() });
          if (item.status !== 'RETURNED') {
            await createOwnerNotification({
              userId: req.userId!,
              type: 'status_update',
              title: `Item returned: ${item.name}`,
              body: 'Item marked as RETURNED and conversation resolved.',
              itemId: conv.item_id,
              conversationId: conv.id,
            });
          }
        }
      }

      broadcastToConversation(conv.id, conv.owner_id, 'conversation:updated', {
        id: conv.id,
        status: 'resolved',
        blockedByOwner: Boolean(conv.blocked_by_owner),
        blockedByFinder: Boolean(conv.blocked_by_finder),
      });

      res.json({ ok: true, status: 'resolved' });
    }),
  );

  // --- PUBLIC QR LANDING & FINDER EXPERIENCE (ZERO PRIVATE OWNER PII) ---

  app.get(
    '/api/public/items/:slug',
    asyncRoute(async (req, res) => {
      const slug = String(req.params.slug ?? '').trim();
      const row = await store.getPublicItemBySlug(slug);

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
    }),
  );

  app.get(
    '/api/public/items/:slug/conversation',
    asyncRoute(async (req, res) => {
      const slug = String(req.params.slug ?? '').trim();
      const finderToken = String(req.headers['x-finder-token'] ?? req.query.finderToken ?? '').trim();
      if (!finderToken || finderToken.length < 8) {
        res.json({ conversation: null, messages: [] });
        return;
      }

      const item = await store.getItemBySlug(slug);
      if (!item) {
        res.status(404).json({ error: 'Item not found.' });
        return;
      }

      const conv = await store.findConversationByItemAndFinder(item.id, finderToken);
      if (!conv) {
        res.json({ conversation: null, messages: [] });
        return;
      }

      await store.markMessagesRead(conv.id, 'owner');
      const messages = await store.listMessages(conv.id);

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
    }),
  );

  app.post(
    '/api/public/items/:slug/conversations',
    asyncRoute(async (req, res) => {
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

      const item = await store.getItemBySlug(slug);
      if (!item) {
        res.status(404).json({ error: 'Item not found.' });
        return;
      }

      let conv = await store.findConversationByItemAndFinder(item.id, finderToken);
      const now = nowIso();
      let isNewChat = false;

      if (conv) {
        if (conv.blocked_by_owner || conv.blocked_by_finder || conv.status === 'blocked') {
          res.status(403).json({ error: 'Messaging has been blocked for this conversation.' });
          return;
        }
      } else {
        isNewChat = true;
        conv = await store.createConversation({
          id: crypto.randomUUID(),
          item_id: item.id,
          owner_id: item.owner_id,
          finder_token: finderToken,
          finder_label: finderLabel,
          status: 'active',
          blocked_by_owner: 0,
          blocked_by_finder: 0,
          last_message_at: now,
          created_at: now,
        });
      }

      const createdMsg = await store.createMessage({
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_role: 'finder',
        sender_label: conv.finder_label,
        body: messageBody,
        read_status: 0,
        created_at: now,
      });

      await store.updateConversation(conv.id, { last_message_at: now, status: 'active' });

      let nextItemStatus = item.status;
      if (item.status !== 'RETURNED' && item.status !== 'CHATTING') {
        nextItemStatus = 'CHATTING';
        await store.updateItemStatusSystem(item.id, { status: 'CHATTING', updated_at: now });
        await createOwnerNotification({
          userId: item.owner_id,
          type: 'status_update',
          title: `Status updated: ${item.name}`,
          body: 'Status automatically switched to CHATTING because a finder started a conversation.',
          itemId: item.id,
          conversationId: conv.id,
        });
      } else {
        await store.updateItemStatusSystem(item.id, { updated_at: now });
      }

      await createOwnerNotification({
        userId: item.owner_id,
        type: isNewChat ? 'new_chat' : 'new_message',
        title: isNewChat ? `New finder chat for ${item.name}` : `New message from ${conv.finder_label}`,
        body: messageBody.slice(0, 140),
        itemId: item.id,
        conversationId: conv.id,
      });

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
    }),
  );

  app.post(
    '/api/public/conversations/:id/messages',
    messageRateLimit,
    asyncRoute(async (req, res) => {
      const finderToken = String(req.body?.finderToken ?? '').trim();
      const body = String(req.body?.body ?? '').trim();

      if (!finderToken || !body || body.length > 2000) {
        res.status(400).json({ error: 'Valid session and message (1-2000 characters) are required.' });
        return;
      }

      const conv = await store.getConversationByFinderToken(req.params.id, finderToken);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      if (conv.blocked_by_owner || conv.blocked_by_finder || conv.status === 'blocked') {
        res.status(403).json({ error: 'Messaging is unavailable because this contact has been blocked.' });
        return;
      }
      if (isSpamDuplicate(conv.id, finderToken, body)) {
        res.status(429).json({
          error: 'Duplicate message blocked by spam protection. Please avoid repeating messages.',
        });
        return;
      }

      const item = await store.getItemByIdForOwner(conv.item_id, conv.owner_id);
      const now = nowIso();
      const createdMsg = await store.createMessage({
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_role: 'finder',
        sender_label: conv.finder_label,
        body,
        read_status: 0,
        created_at: now,
      });

      await store.updateConversation(conv.id, { last_message_at: now, status: 'active' });

      await createOwnerNotification({
        userId: conv.owner_id,
        type: 'new_message',
        title: `New message on ${item?.name ?? 'registered item'}`,
        body: `${conv.finder_label}: ${body.slice(0, 120)}`,
        itemId: conv.item_id,
        conversationId: conv.id,
      });

      const mapped = mapMessage(createdMsg);
      broadcastToConversation(conv.id, conv.owner_id, 'message:created', mapped);
      res.status(201).json({ message: mapped });
    }),
  );

  app.post(
    '/api/public/conversations/:id/read',
    asyncRoute(async (req, res) => {
      const finderToken = String(req.body?.finderToken ?? '').trim();
      const conv = await store.getConversationByFinderToken(req.params.id, finderToken);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      await store.markMessagesRead(conv.id, 'owner');
      broadcastToConversation(conv.id, conv.owner_id, 'messages:read', {
        conversationId: conv.id,
        readerRole: 'finder',
      });
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/public/conversations/:id/block',
    asyncRoute(async (req, res) => {
      const finderToken = String(req.body?.finderToken ?? '').trim();
      const conv = await store.getConversationByFinderToken(req.params.id, finderToken);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }

      await store.updateConversation(conv.id, { blocked_by_finder: 1, status: 'blocked' });
      broadcastToConversation(conv.id, conv.owner_id, 'conversation:updated', {
        id: conv.id,
        status: 'blocked',
        blockedByOwner: Boolean(conv.blocked_by_owner),
        blockedByFinder: true,
      });
      res.json({ ok: true, status: 'blocked', blockedByFinder: true });
    }),
  );

  app.post(
    '/api/public/report-abuse',
    asyncRoute(async (req, res) => {
      const itemSlug = req.body?.itemSlug ? String(req.body.itemSlug).trim() : null;
      const conversationId = req.body?.conversationId
        ? String(req.body.conversationId).trim()
        : null;
      const reporterRole = req.body?.reporterRole === 'owner' ? 'owner' : 'finder';
      const reason = String(req.body?.reason ?? '').trim();
      const details = String(req.body?.details ?? '').trim().slice(0, 1000);

      if (!reason || reason.length > 120) {
        res.status(400).json({ error: 'Please select a reason for reporting.' });
        return;
      }

      let itemId: string | null = null;
      if (itemSlug) {
        const item = await store.getItemBySlug(itemSlug);
        itemId = item?.id ?? null;
      }

      await store.createAbuseReport({
        id: crypto.randomUUID(),
        item_id: itemId,
        conversation_id: conversationId,
        reporter_role: reporterRole,
        reason,
        details,
        created_at: nowIso(),
      });

      res.status(201).json({
        ok: true,
        message: 'Report submitted. Thank you for keeping TAGBACKLY safe.',
      });
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
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

    ws.on('message', async (raw) => {
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
          const conv = await store.getConversationByFinderToken(
            msg.conversationId,
            msg.finderToken,
          );
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
    console.log(
      `TAGBACKLY server listening on http://0.0.0.0:${PORT} (storage: ${activeStorageBackend})`,
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start TAGBACKLY server:', err);
  process.exit(1);
});
