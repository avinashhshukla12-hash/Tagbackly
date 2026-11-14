import type {
  AppNotification,
  ChatMessage,
  ConversationSummary,
  DashboardStats,
  ItemCategory,
  ItemStatus,
  PublicTagItem,
  RewardType,
  TagItem,
  UserProfile,
} from '../types';

const TOKEN_KEY = 'tagbackly_token';
const FINDER_TOKEN_KEY = 'tagbackly_finder_token';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getOrCreateFinderToken(): string {
  try {
    let token = localStorage.getItem(FINDER_TOKEN_KEY);
    if (!token || token.length < 16) {
      token =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `fnd-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(FINDER_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return `fnd-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return 'Unsupported format. Please choose a JPEG, PNG, or WebP image.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image exceeds the 5 MB file size limit.';
  }
  return null;
}

export function uploadImageWithProgress(
  dataUri: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads/image', true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/json');
    const token = getStoredToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}') as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          onProgress(100);
          resolve(data.url);
        } else {
          reject(new Error(data.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Invalid server response during image upload.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during image upload.'));
    xhr.send(JSON.stringify({ dataUri }));
  });
}

export const api = {
  // Auth (+91 Mobile Number + Password)
  signup(payload: {
    fullName: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }) {
    return request<{ token: string; user: UserProfile }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  login(payload: { phone: string; password: string }) {
    return request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  forgotPassword(phone: string) {
    return request<{
      ok: boolean;
      phone: string;
      message: string;
    }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },
  resetPassword(payload: {
    phone: string;
    idToken: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getMe() {
    return request<{ user: UserProfile }>('/api/auth/me');
  },
  updateProfile(payload: {
    fullName: string;
    displayAlias: string;
    email?: string | null;
    address: string;
    profileImageUrl?: string | null;
    removeProfileImage?: boolean;
  }) {
    return request<{ user: UserProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ message: string }>('/api/profile/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteAccount(currentPassword: string) {
    return request<{ ok: boolean; message: string }>('/api/profile/account', {
      method: 'DELETE',
      body: JSON.stringify({ currentPassword }),
    });
  },

  // Dashboard & Items
  getDashboard() {
    return request<{ stats: DashboardStats }>('/api/dashboard');
  },
  getItems() {
    return request<{ items: TagItem[] }>('/api/items');
  },
  getItem(id: string) {
    return request<{ item: TagItem }>(`/api/items/${encodeURIComponent(id)}`);
  },
  createItem(payload: {
    name: string;
    category: ItemCategory;
    description: string;
    status: ItemStatus;
    ownerMessage: string;
    rewardType: RewardType;
    rewardAmount: string;
    rewardDescription: string;
    photoUrl?: string | null;
    photoData?: string | null;
  }) {
    return request<{ item: TagItem }>('/api/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateItem(
    id: string,
    payload: {
      name?: string;
      category?: ItemCategory;
      description?: string;
      status?: ItemStatus;
      ownerMessage?: string;
      rewardType?: RewardType;
      rewardAmount?: string;
      rewardDescription?: string;
      photoUrl?: string | null;
      photoData?: string | null;
      removePhoto?: boolean;
    },
  ) {
    return request<{ item: TagItem }>(`/api/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteItem(id: string) {
    return request<{ ok: boolean }>(`/api/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Notifications
  getNotifications() {
    return request<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications');
  },
  markAllNotificationsRead() {
    return request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' });
  },
  markNotificationRead(id: string) {
    return request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    });
  },

  // Owner Conversations
  getConversations() {
    return request<{ conversations: ConversationSummary[] }>('/api/conversations');
  },
  getConversationMessages(conversationId: string) {
    return request<{
      conversation: {
        id: string;
        itemId: string;
        finderLabel: string;
        status: 'active' | 'resolved' | 'blocked';
        blockedByOwner: boolean;
        blockedByFinder: boolean;
      };
      messages: ChatMessage[];
    }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
  },
  markConversationRead(conversationId: string) {
    return request<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
    });
  },
  sendOwnerMessage(conversationId: string, body: string) {
    return request<{ message: ChatMessage }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
  toggleBlockFinder(conversationId: string, blocked: boolean) {
    return request<{ ok: boolean; blockedByOwner: boolean; status: string }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/block`,
      {
        method: 'POST',
        body: JSON.stringify({ blocked }),
      },
    );
  },
  resolveConversation(conversationId: string, markReturned: boolean) {
    return request<{ ok: boolean; status: string }>(`/api/conversations/${encodeURIComponent(conversationId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ markReturned }),
    });
  },

  // Public QR & Finder
  getPublicItem(slug: string) {
    return request<{ item: PublicTagItem }>(`/api/public/items/${encodeURIComponent(slug)}`);
  },
  getFinderConversation(slug: string, finderToken: string) {
    return request<{
      conversation: {
        id: string;
        finderLabel: string;
        status: 'active' | 'resolved' | 'blocked';
        blockedByOwner: boolean;
        blockedByFinder: boolean;
        createdAt: string;
      } | null;
      messages: ChatMessage[];
    }>(`/api/public/items/${encodeURIComponent(slug)}/conversation`, {
      headers: {
        'x-finder-token': finderToken,
      },
    });
  },
  startFinderConversation(
    slug: string,
    payload: { finderToken: string; finderLabel: string; message: string },
  ) {
    return request<{
      conversation: {
        id: string;
        finderLabel: string;
        status: 'active' | 'resolved' | 'blocked';
        blockedByOwner: boolean;
        blockedByFinder: boolean;
        createdAt: string;
      };
      message: ChatMessage;
      itemStatus?: ItemStatus;
    }>(`/api/public/items/${encodeURIComponent(slug)}/conversations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  sendFinderMessage(conversationId: string, finderToken: string, body: string) {
    return request<{ message: ChatMessage }>(`/api/public/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ finderToken, body }),
    });
  },
  markFinderConversationRead(conversationId: string, finderToken: string) {
    return request<{ ok: boolean }>(`/api/public/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ finderToken }),
    });
  },
  blockByFinder(conversationId: string, finderToken: string) {
    return request<{ ok: boolean; status: string; blockedByFinder: boolean }>(
      `/api/public/conversations/${encodeURIComponent(conversationId)}/block`,
      {
        method: 'POST',
        body: JSON.stringify({ finderToken }),
      },
    );
  },
  reportAbuse(payload: {
    itemSlug?: string;
    conversationId?: string;
    reporterRole: 'finder' | 'owner';
    reason: string;
    details?: string;
  }) {
    return request<{ ok: boolean; message: string }>('/api/public/report-abuse', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export function compressImageFile(file: File, maxDimension = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      reject(new Error(validationError));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the selected image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unable to decode image file.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser canvas is unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const output = canvas.toDataURL('image/jpeg', 0.85);
        resolve(output);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function createWebSocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
