export const ITEM_CATEGORIES = [
  'Mobile & Electronics',
  'Bags',
  'Books',
  'Documents',
  'Keys',
  'Wallets',
  'Accessories',
  'Other',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_STATUSES = ['SAFE', 'LOST', 'FOUND', 'CHATTING', 'RETURNED'] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const REWARD_TYPES = ['none', 'amount', 'custom'] as const;

export type RewardType = (typeof REWARD_TYPES)[number];

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  displayAlias: string;
  profileImage: string | null;
  phone: string;
  address: string;
  createdAt: string;
}

export interface DashboardStats {
  totalItems: number;
  safeItems: number;
  lostItems: number;
  foundItems: number;
  chattingItems: number;
  returnedItems: number;
  activeConversations: number;
  unreadMessages: number;
}

export interface TagItem {
  id: string;
  ownerId: string;
  publicSlug: string;
  name: string;
  category: ItemCategory;
  description: string;
  status: ItemStatus;
  ownerMessage: string;
  rewardType: RewardType;
  rewardAmount: string;
  rewardDescription: string;
  photoUrl: string | null;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicTagItem {
  publicSlug: string;
  name: string;
  category: ItemCategory;
  description: string;
  status: ItemStatus;
  ownerMessage: string;
  rewardType: RewardType;
  rewardAmount: string;
  rewardDescription: string;
  photoUrl: string | null;
  ownerAlias: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  itemId: string;
  itemName: string;
  itemSlug: string;
  itemStatus: ItemStatus;
  itemPhotoUrl: string | null;
  finderLabel: string;
  status: 'active' | 'resolved' | 'blocked';
  blockedByOwner: boolean;
  blockedByFinder: boolean;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastSenderRole: 'finder' | 'owner' | null;
  messageCount: number;
  unreadCount: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderRole: 'finder' | 'owner';
  senderLabel: string;
  body: string;
  readStatus: boolean;
  createdAt: string;
}

export type NotificationType = 'new_message' | 'new_chat' | 'status_update' | 'account_activity';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  itemId: string | null;
  conversationId: string | null;
  isRead: boolean;
  createdAt: string;
}
