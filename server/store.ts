import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, uploadsDir } from './db.ts';

export interface UserRow {
  id: string;
  email: string | null;
  password_hash: string;
  full_name: string;
  display_alias: string;
  profile_image: string | null;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
}

export interface PasswordResetRow {
  id: string;
  user_id: string;
  email: string;
  phone: string;
  reset_code: string;
  expires_at: string;
  used: number;
  created_at: string;
}

export interface ItemRow {
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

export interface ConversationRow {
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

export interface ConversationWithMetaRow extends ConversationRow {
  item_name: string;
  item_slug: string;
  item_status: string;
  item_photo_url: string | null;
  last_message_body: string | null;
  last_sender_role: string | null;
  message_count: number;
  unread_count: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_role: string;
  sender_label: string;
  body: string;
  read_status: number;
  created_at: string;
}

export interface NotificationRow {
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

export interface PublicItemRow {
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

export interface DashboardStatsData {
  totalItems: number;
  safeItems: number;
  lostItems: number;
  foundItems: number;
  chattingItems: number;
  returnedItems: number;
  activeConversations: number;
  unreadMessages: number;
}

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const SUPABASE_STORAGE_BUCKET = (process.env.SUPABASE_STORAGE_BUCKET ?? 'tagbackly-uploads').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

async function supabaseRest<T>(
  pathWithQuery: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('apikey', SUPABASE_SERVICE_ROLE_KEY);
  headers.set('Authorization', `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathWithQuery}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase REST error (${res.status}): ${errText || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function parseImageDataUri(dataUri: string): { ext: string; mime: string; buffer: Buffer } | null {
  const match = dataUri.match(/^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const extRaw = match[2] === 'jpg' ? 'jpeg' : match[2];
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > 5 * 1024 * 1024) {
    return null;
  }
  return { ext, mime, buffer };
}

export function isSafeUploadUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(url)) return true;
  if (
    SUPABASE_URL &&
    url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`)
  ) {
    return true;
  }
  return Boolean(parseImageDataUri(url));
}

export async function saveUploadedImage(dataUri: string): Promise<string | null> {
  const parsed = parseImageDataUri(dataUri);
  if (!parsed) return null;

  const filename = `${crypto.randomUUID()}.${parsed.ext}`;

  if (isSupabaseConfigured) {
    try {
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${filename}`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': parsed.mime,
            'x-upsert': 'true',
          },
          body: new Uint8Array(parsed.buffer),
        },
      );
      if (uploadRes.ok) {
        return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${filename}`;
      }
    } catch {
      // Fall back to storing validated compressed data URI so images survive Render restarts even without a Storage bucket
    }
    return dataUri;
  }

  const fullPath = path.join(uploadsDir, filename);
  fs.writeFileSync(fullPath, parsed.buffer);
  return `/uploads/${filename}`;
}

export async function deleteUploadedImage(photoUrl: string | null): Promise<void> {
  if (!photoUrl) return;
  if (photoUrl.startsWith('/uploads/')) {
    const safeName = path.basename(photoUrl);
    const fullPath = path.join(uploadsDir, safeName);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // Ignore cleanup error
      }
    }
    return;
  }

  const publicPrefix = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/`;
  if (isSupabaseConfigured && photoUrl.startsWith(publicPrefix)) {
    const filename = photoUrl.slice(publicPrefix.length);
    if (!filename || filename.includes('/')) return;
    try {
      await fetch(
        `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeURIComponent(filename)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      );
    } catch {
      // Ignore cleanup error
    }
  }
}

export const store = {
  async findUserById(id: string): Promise<UserRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<UserRow[]>(
        `users?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      );
      return rows[0];
    }
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  },

  async findUserByPhone(phone: string): Promise<UserRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<UserRow[]>(
        `users?phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`,
      );
      return rows[0];
    }
    return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined;
  },

  async findUserByEmail(email: string): Promise<UserRow | undefined> {
    if (!email) return undefined;
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<UserRow[]>(
        `users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
      );
      return rows[0];
    }
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  },

  async createUser(input: UserRow): Promise<UserRow> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<UserRow[]>('users', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(input),
      });
      return rows[0];
    }
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, display_alias, profile_image, phone, address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.email,
      input.password_hash,
      input.full_name,
      input.display_alias,
      input.profile_image,
      input.phone,
      input.address,
      input.created_at,
      input.updated_at,
    );
    return (await this.findUserById(input.id))!;
  },

  async updateUserProfile(
    id: string,
    patch: {
      full_name: string;
      display_alias: string;
      profile_image: string | null;
      email: string | null;
      address: string;
      updated_at: string;
    },
  ): Promise<UserRow> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<UserRow[]>(
        `users?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(patch),
        },
      );
      return rows[0];
    }
    db.prepare(`
      UPDATE users
      SET full_name = ?, display_alias = ?, profile_image = ?, email = ?, address = ?, updated_at = ?
      WHERE id = ?
    `).run(
      patch.full_name,
      patch.display_alias,
      patch.profile_image,
      patch.email,
      patch.address,
      patch.updated_at,
      id,
    );
    return (await this.findUserById(id))!;
  },

  async updateUserPassword(id: string, passwordHash: string, updatedAt: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(`users?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ password_hash: passwordHash, updated_at: updatedAt }),
      });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      passwordHash,
      updatedAt,
      id,
    );
  },

  async deleteUser(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(`users?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  async invalidateOpenPasswordResets(userId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(
        `password_resets?user_id=eq.${encodeURIComponent(userId)}&used=eq.0`,
        {
          method: 'PATCH',
          body: JSON.stringify({ used: 1 }),
        },
      );
      return;
    }
    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(userId);
  },

  async createPasswordReset(input: PasswordResetRow): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest('password_resets', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return;
    }
    db.prepare(`
      INSERT INTO password_resets (id, user_id, email, phone, reset_code, expires_at, used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.user_id,
      input.email,
      input.phone,
      input.reset_code,
      input.expires_at,
      input.used,
      input.created_at,
    );
  },

  async findValidPasswordResetByPhone(
    phone: string,
    code: string,
  ): Promise<PasswordResetRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<PasswordResetRow[]>(
        `password_resets?phone=eq.${encodeURIComponent(phone)}&reset_code=eq.${encodeURIComponent(code)}&used=eq.0&order=created_at.desc&limit=1`,
      );
      return rows[0];
    }
    return db
      .prepare(`
        SELECT * FROM password_resets
        WHERE phone = ? AND reset_code = ? AND used = 0
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(phone, code) as PasswordResetRow | undefined;
  },

  async markPasswordResetUsed(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(`password_resets?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ used: 1 }),
      });
      return;
    }
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(id);
  },

  async getDashboardStats(ownerId: string): Promise<DashboardStatsData> {
    if (isSupabaseConfigured) {
      const [items, conversations] = await Promise.all([
        supabaseRest<Array<{ id: string; status: string }>>(
          `items?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,status`,
        ),
        supabaseRest<
          Array<{
            id: string;
            status: string;
            blocked_by_owner: number;
            blocked_by_finder: number;
          }>
        >(
          `conversations?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,status,blocked_by_owner,blocked_by_finder`,
        ),
      ]);

      const unblockedConvIds = conversations
        .filter((c) => !c.blocked_by_owner)
        .map((c) => c.id);

      let unreadMessages = 0;
      if (unblockedConvIds.length > 0) {
        const inList = unblockedConvIds.map((id) => `"${id}"`).join(',');
        const unreadRows = await supabaseRest<Array<{ id: string }>>(
          `messages?conversation_id=in.(${encodeURIComponent(inList)})&sender_role=eq.finder&read_status=eq.0&select=id`,
        );
        unreadMessages = unreadRows.length;
      }

      return {
        totalItems: items.length,
        safeItems: items.filter((i) => i.status === 'SAFE').length,
        lostItems: items.filter((i) => i.status === 'LOST').length,
        foundItems: items.filter((i) => i.status === 'FOUND').length,
        chattingItems: items.filter((i) => i.status === 'CHATTING').length,
        returnedItems: items.filter((i) => i.status === 'RETURNED').length,
        activeConversations: conversations.filter(
          (c) => c.status === 'active' && !c.blocked_by_owner && !c.blocked_by_finder,
        ).length,
        unreadMessages,
      };
    }

    const counts = db
      .prepare(`
        SELECT
          COUNT(*) AS total_items,
          SUM(CASE WHEN status = 'SAFE' THEN 1 ELSE 0 END) AS safe_items,
          SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) AS lost_items,
          SUM(CASE WHEN status = 'FOUND' THEN 1 ELSE 0 END) AS found_items,
          SUM(CASE WHEN status = 'CHATTING' THEN 1 ELSE 0 END) AS chatting_items,
          SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) AS returned_items
        FROM items
        WHERE owner_id = ?
      `)
      .get(ownerId) as {
      total_items: number;
      safe_items: number | null;
      lost_items: number | null;
      found_items: number | null;
      chatting_items: number | null;
      returned_items: number | null;
    };

    const convCount = db
      .prepare(`
        SELECT COUNT(*) AS active_conversations
        FROM conversations
        WHERE owner_id = ? AND status = 'active' AND blocked_by_owner = 0 AND blocked_by_finder = 0
      `)
      .get(ownerId) as { active_conversations: number };

    const unreadCount = db
      .prepare(`
        SELECT COUNT(*) AS unread_messages
        FROM messages m
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE c.owner_id = ? AND m.sender_role = 'finder' AND m.read_status = 0 AND c.blocked_by_owner = 0
      `)
      .get(ownerId) as { unread_messages: number };

    return {
      totalItems: Number(counts.total_items ?? 0),
      safeItems: Number(counts.safe_items ?? 0),
      lostItems: Number(counts.lost_items ?? 0),
      foundItems: Number(counts.found_items ?? 0),
      chattingItems: Number(counts.chatting_items ?? 0),
      returnedItems: Number(counts.returned_items ?? 0),
      activeConversations: Number(convCount.active_conversations ?? 0),
      unreadMessages: Number(unreadCount.unread_messages ?? 0),
    };
  },

  async listItemsByOwner(ownerId: string): Promise<ItemRow[]> {
    if (isSupabaseConfigured) {
      const [items, conversations] = await Promise.all([
        supabaseRest<ItemRow[]>(
          `items?owner_id=eq.${encodeURIComponent(ownerId)}&select=*&order=updated_at.desc`,
        ),
        supabaseRest<Array<{ item_id: string; blocked_by_owner: number }>>(
          `conversations?owner_id=eq.${encodeURIComponent(ownerId)}&blocked_by_owner=eq.0&select=item_id,blocked_by_owner`,
        ),
      ]);
      const convCounts = new Map<string, number>();
      for (const c of conversations) {
        convCounts.set(c.item_id, (convCounts.get(c.item_id) ?? 0) + 1);
      }
      return items.map((item) => ({
        ...item,
        conversation_count: convCounts.get(item.id) ?? 0,
      }));
    }

    return db
      .prepare(`
        SELECT i.*,
          (SELECT COUNT(*) FROM conversations c WHERE c.item_id = i.id AND c.blocked_by_owner = 0) AS conversation_count
        FROM items i
        WHERE i.owner_id = ?
        ORDER BY i.updated_at DESC
      `)
      .all(ownerId) as unknown as ItemRow[];
  },

  async listItemPhotosByOwner(ownerId: string): Promise<Array<{ photo_url: string | null }>> {
    if (isSupabaseConfigured) {
      return supabaseRest<Array<{ photo_url: string | null }>>(
        `items?owner_id=eq.${encodeURIComponent(ownerId)}&select=photo_url`,
      );
    }
    return db
      .prepare('SELECT photo_url FROM items WHERE owner_id = ?')
      .all(ownerId) as unknown as Array<{ photo_url: string | null }>;
  },

  async getItemByIdForOwner(id: string, ownerId: string): Promise<ItemRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ItemRow[]>(
        `items?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*&limit=1`,
      );
      const item = rows[0];
      if (!item) return undefined;
      const convs = await supabaseRest<Array<{ id: string }>>(
        `conversations?item_id=eq.${encodeURIComponent(id)}&blocked_by_owner=eq.0&select=id`,
      );
      return { ...item, conversation_count: convs.length };
    }
    return db
      .prepare(`
        SELECT i.*,
          (SELECT COUNT(*) FROM conversations c WHERE c.item_id = i.id AND c.blocked_by_owner = 0) AS conversation_count
        FROM items i
        WHERE i.id = ? AND i.owner_id = ?
      `)
      .get(id, ownerId) as ItemRow | undefined;
  },

  async createItem(input: Omit<ItemRow, 'conversation_count'>): Promise<ItemRow> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ItemRow[]>('items', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(input),
      });
      return { ...rows[0], conversation_count: 0 };
    }
    db.prepare(`
      INSERT INTO items (id, owner_id, public_slug, name, category, description, status, owner_message, reward_type, reward_amount, reward_description, photo_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.owner_id,
      input.public_slug,
      input.name,
      input.category,
      input.description,
      input.status,
      input.owner_message,
      input.reward_type,
      input.reward_amount,
      input.reward_description,
      input.photo_url,
      input.created_at,
      input.updated_at,
    );
    return (await this.getItemByIdForOwner(input.id, input.owner_id))!;
  },

  async updateItem(
    id: string,
    ownerId: string,
    patch: Partial<Omit<ItemRow, 'id' | 'owner_id' | 'public_slug' | 'created_at' | 'conversation_count'>>,
  ): Promise<ItemRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ItemRow[]>(
        `items?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(patch),
        },
      );
      if (!rows[0]) return undefined;
      return this.getItemByIdForOwner(id, ownerId);
    }

    const existing = await this.getItemByIdForOwner(id, ownerId);
    if (!existing) return undefined;

    db.prepare(`
      UPDATE items
      SET name = ?, category = ?, description = ?, status = ?, owner_message = ?, reward_type = ?, reward_amount = ?, reward_description = ?, photo_url = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      patch.name ?? existing.name,
      patch.category ?? existing.category,
      patch.description ?? existing.description,
      patch.status ?? existing.status,
      patch.owner_message ?? existing.owner_message,
      patch.reward_type ?? existing.reward_type,
      patch.reward_amount ?? existing.reward_amount,
      patch.reward_description ?? existing.reward_description,
      patch.photo_url !== undefined ? patch.photo_url : existing.photo_url,
      patch.updated_at ?? existing.updated_at,
      id,
      ownerId,
    );
    return this.getItemByIdForOwner(id, ownerId);
  },

  async updateItemStatusSystem(id: string, patch: { status?: string; updated_at: string }): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(`items?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return;
    }
    if (patch.status !== undefined) {
      db.prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run(
        patch.status,
        patch.updated_at,
        id,
      );
    } else {
      db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(patch.updated_at, id);
    }
  },

  async deleteItem(id: string, ownerId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(
        `items?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}`,
        { method: 'DELETE' },
      );
      return;
    }
    db.prepare('DELETE FROM items WHERE id = ? AND owner_id = ?').run(id, ownerId);
  },

  async getItemBySlug(slug: string): Promise<ItemRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ItemRow[]>(
        `items?public_slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
      );
      return rows[0];
    }
    return db.prepare('SELECT * FROM items WHERE public_slug = ?').get(slug) as ItemRow | undefined;
  },

  async getPublicItemBySlug(slug: string): Promise<PublicItemRow | undefined> {
    if (isSupabaseConfigured) {
      const item = await this.getItemBySlug(slug);
      if (!item) return undefined;
      const owner = await this.findUserById(item.owner_id);
      if (!owner) return undefined;
      return {
        public_slug: item.public_slug,
        name: item.name,
        category: item.category,
        description: item.description,
        status: item.status,
        owner_message: item.owner_message,
        reward_type: item.reward_type,
        reward_amount: item.reward_amount,
        reward_description: item.reward_description,
        photo_url: item.photo_url,
        updated_at: item.updated_at,
        owner_alias: owner.display_alias,
      };
    }

    return db
      .prepare(`
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
      `)
      .get(slug) as PublicItemRow | undefined;
  },

  async createNotification(input: NotificationRow): Promise<NotificationRow> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<NotificationRow[]>('notifications', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(input),
      });
      return rows[0];
    }
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, item_id, conversation_id, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.user_id,
      input.type,
      input.title,
      input.body,
      input.item_id,
      input.conversation_id,
      input.is_read,
      input.created_at,
    );
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(input.id) as unknown as NotificationRow;
  },

  async listNotifications(userId: string): Promise<NotificationRow[]> {
    if (isSupabaseConfigured) {
      return supabaseRest<NotificationRow[]>(
        `notifications?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=60`,
      );
    }
    return db
      .prepare(`
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 60
      `)
      .all(userId) as unknown as NotificationRow[];
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(
        `notifications?user_id=eq.${encodeURIComponent(userId)}&is_read=eq.0`,
        {
          method: 'PATCH',
          body: JSON.stringify({ is_read: 1 }),
        },
      );
      return;
    }
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
  },

  async markNotificationRead(id: string, userId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(
        `notifications?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ is_read: 1 }),
        },
      );
      return;
    }
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  },

  async listConversations(ownerId: string): Promise<ConversationWithMetaRow[]> {
    if (isSupabaseConfigured) {
      const [conversations, items] = await Promise.all([
        supabaseRest<ConversationRow[]>(
          `conversations?owner_id=eq.${encodeURIComponent(ownerId)}&select=*&order=last_message_at.desc`,
        ),
        supabaseRest<ItemRow[]>(
          `items?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,name,public_slug,status,photo_url`,
        ),
      ]);
      if (conversations.length === 0) return [];

      const itemMap = new Map(items.map((i) => [i.id, i]));
      const inList = conversations.map((c) => `"${c.id}"`).join(',');
      const msgs = await supabaseRest<MessageRow[]>(
        `messages?conversation_id=in.(${encodeURIComponent(inList)})&select=*&order=created_at.desc`,
      );

      const msgsByConv = new Map<string, MessageRow[]>();
      for (const m of msgs) {
        const list = msgsByConv.get(m.conversation_id) ?? [];
        list.push(m);
        msgsByConv.set(m.conversation_id, list);
      }

      return conversations
        .filter((c) => itemMap.has(c.item_id))
        .map((c) => {
          const item = itemMap.get(c.item_id)!;
          const convMsgs = msgsByConv.get(c.id) ?? [];
          const latest = convMsgs[0];
          const unread = convMsgs.filter((m) => m.sender_role === 'finder' && !m.read_status).length;
          return {
            ...c,
            item_name: item.name,
            item_slug: item.public_slug,
            item_status: item.status,
            item_photo_url: item.photo_url,
            last_message_body: latest?.body ?? null,
            last_sender_role: latest?.sender_role ?? null,
            message_count: convMsgs.length,
            unread_count: unread,
          };
        });
    }

    return db
      .prepare(`
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
      `)
      .all(ownerId) as unknown as ConversationWithMetaRow[];
  },

  async getConversationForOwner(
    convId: string,
    ownerId: string,
  ): Promise<ConversationRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ConversationRow[]>(
        `conversations?id=eq.${encodeURIComponent(convId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*&limit=1`,
      );
      return rows[0];
    }
    return db
      .prepare('SELECT * FROM conversations WHERE id = ? AND owner_id = ?')
      .get(convId, ownerId) as ConversationRow | undefined;
  },

  async getConversationByFinderToken(
    convId: string,
    finderToken: string,
  ): Promise<ConversationRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ConversationRow[]>(
        `conversations?id=eq.${encodeURIComponent(convId)}&finder_token=eq.${encodeURIComponent(finderToken)}&select=*&limit=1`,
      );
      return rows[0];
    }
    return db
      .prepare('SELECT * FROM conversations WHERE id = ? AND finder_token = ?')
      .get(convId, finderToken) as ConversationRow | undefined;
  },

  async findConversationByItemAndFinder(
    itemId: string,
    finderToken: string,
  ): Promise<ConversationRow | undefined> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ConversationRow[]>(
        `conversations?item_id=eq.${encodeURIComponent(itemId)}&finder_token=eq.${encodeURIComponent(finderToken)}&order=created_at.desc&limit=1`,
      );
      return rows[0];
    }
    return db
      .prepare(
        'SELECT * FROM conversations WHERE item_id = ? AND finder_token = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(itemId, finderToken) as ConversationRow | undefined;
  },

  async createConversation(input: ConversationRow): Promise<ConversationRow> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<ConversationRow[]>('conversations', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(input),
      });
      return rows[0];
    }
    db.prepare(`
      INSERT INTO conversations (id, item_id, owner_id, finder_token, finder_label, status, blocked_by_owner, blocked_by_finder, last_message_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.item_id,
      input.owner_id,
      input.finder_token,
      input.finder_label,
      input.status,
      input.blocked_by_owner,
      input.blocked_by_finder,
      input.last_message_at,
      input.created_at,
    );
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(input.id) as unknown as ConversationRow;
  },

  async updateConversation(
    id: string,
    patch: Partial<
      Pick<ConversationRow, 'status' | 'blocked_by_owner' | 'blocked_by_finder' | 'last_message_at'>
    >,
  ): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(`conversations?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return;
    }
    const sets: string[] = [];
    const vals: Array<string | number> = [];
    if (patch.status !== undefined) {
      sets.push('status = ?');
      vals.push(patch.status);
    }
    if (patch.blocked_by_owner !== undefined) {
      sets.push('blocked_by_owner = ?');
      vals.push(patch.blocked_by_owner);
    }
    if (patch.blocked_by_finder !== undefined) {
      sets.push('blocked_by_finder = ?');
      vals.push(patch.blocked_by_finder);
    }
    if (patch.last_message_at !== undefined) {
      sets.push('last_message_at = ?');
      vals.push(patch.last_message_at);
    }
    if (sets.length === 0) return;
    vals.push(id);
    db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    if (isSupabaseConfigured) {
      return supabaseRest<MessageRow[]>(
        `messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=*&order=created_at.asc`,
      );
    }
    return db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as unknown as MessageRow[];
  },

  async createMessage(input: MessageRow): Promise<MessageRow> {
    if (isSupabaseConfigured) {
      const rows = await supabaseRest<MessageRow[]>('messages', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(input),
      });
      return rows[0];
    }
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_role, sender_label, body, read_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.conversation_id,
      input.sender_role,
      input.sender_label,
      input.body,
      input.read_status,
      input.created_at,
    );
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(input.id) as unknown as MessageRow;
  },

  async markMessagesRead(conversationId: string, senderRole: 'finder' | 'owner'): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest(
        `messages?conversation_id=eq.${encodeURIComponent(conversationId)}&sender_role=eq.${senderRole}&read_status=eq.0`,
        {
          method: 'PATCH',
          body: JSON.stringify({ read_status: 1 }),
        },
      );
      return;
    }
    db.prepare(
      'UPDATE messages SET read_status = 1 WHERE conversation_id = ? AND sender_role = ? AND read_status = 0',
    ).run(conversationId, senderRole);
  },

  async createAbuseReport(input: {
    id: string;
    item_id: string | null;
    conversation_id: string | null;
    reporter_role: string;
    reason: string;
    details: string;
    created_at: string;
  }): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRest('abuse_reports', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return;
    }
    db.prepare(`
      INSERT INTO abuse_reports (id, item_id, conversation_id, reporter_role, reason, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.item_id,
      input.conversation_id,
      input.reporter_role,
      input.reason,
      input.details,
      input.created_at,
    );
  },
};
