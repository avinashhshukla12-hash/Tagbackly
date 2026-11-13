import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Bell,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Edit3,
  Flag,
  Globe,
  HelpCircle,
  Home,
  ImagePlus,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  api,
  compressImageFile,
  createWebSocketUrl,
  getStoredToken,
  setStoredToken,
  uploadImageWithProgress,
  validateImageFile,
} from '../lib/api';
import { useLanguage } from '../lib/i18n';
import {
  ITEM_CATEGORIES,
  ITEM_STATUSES,
  type AppNotification,
  type ChatMessage,
  type ConversationSummary,
  type DashboardStats,
  type ItemStatus,
  type TagItem,
  type UserProfile,
} from '../types';
import { ItemFormModal } from './ItemFormModal';
import { PWAInstallButton } from './PWAInstallButton';
import { QrCodeStudio } from './QrCodeStudio';
import { QrPreviewGrid } from './QrPreviewGrid';
import { QrScannerModal } from './QrScannerModal';
import { StatusIndicator } from './StatusBadge';

type DashboardTab =
  | 'overview'
  | 'items'
  | 'qr-codes'
  | 'conversations'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'help';

interface OwnerDashboardProps {
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onSignedOut: () => void;
  onGoHome: () => void;
  onOpenPublicPreview: (slug: string) => void;
}

export function OwnerDashboard({
  user,
  onUserUpdated,
  onSignedOut,
  onGoHome,
  onOpenPublicPreview,
}: OwnerDashboardProps) {
  const { lang, setLang, t } = useLanguage();
  const [tab, setTab] = useState<DashboardTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats>({
    totalItems: 0,
    safeItems: 0,
    lostItems: 0,
    foundItems: 0,
    chattingItems: 0,
    returnedItems: 0,
    activeConversations: 0,
    unreadMessages: 0,
  });
  const [items, setItems] = useState<TagItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [browserAlertPermission, setBrowserAlertPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });

  // Item Management state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ItemStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TagItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Conversation Inbox state
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);
  const [abuseModalConvId, setAbuseModalConvId] = useState<string | null>(null);
  const [abuseReason, setAbuseReason] = useState('Spam or unsolicited solicitation');
  const [abuseDetails, setAbuseDetails] = useState('');
  const [abuseFeedback, setAbuseFeedback] = useState<string | null>(null);

  // Profile state
  const [fullName, setFullName] = useState(user.fullName);
  const [displayAlias, setDisplayAlias] = useState(user.displayAlias);
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(user.address);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(user.profileImage);
  const [uploadedProfileImageUrl, setUploadedProfileImageUrl] = useState<string | null>(user.profileImage);
  const [removeProfileImage, setRemoveProfileImage] = useState(false);
  const [profileUploadProgress, setProfileUploadProgress] = useState<number | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileFileRef = useRef<HTMLInputElement | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Settings / Delete Account / Support state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [supportReason, setSupportReason] = useState('General Support Question');
  const [supportDetails, setSupportDetails] = useState('');
  const [supportFeedback, setSupportFeedback] = useState<string | null>(null);

  const activeConvIdRef = useRef<string | null>(null);
  activeConvIdRef.current = activeConvId;

  const refreshAll = useCallback(async () => {
    try {
      setLoadError(null);
      const [dashRes, itemsRes, convRes, notifRes] = await Promise.all([
        api.getDashboard(),
        api.getItems(),
        api.getConversations(),
        api.getNotifications(),
      ]);
      setStats(dashRes.stats);
      setItems(itemsRes.items);
      setConversations(convRes.conversations);
      setNotifications(notifRes.notifications);
      setUnreadNotifications(notifRes.unreadCount);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Real-time WebSocket listener for messages, read receipts, status updates, and notifications
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(createWebSocketUrl());
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', token }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            event?: string;
            conversationId?: string;
            payload?:
              | ChatMessage
              | AppNotification
              | { id: string; status: string }
              | { conversationId?: string; readerRole?: string };
          };
          if (data.event === 'message:created' && data.payload) {
            const incomingMsg = data.payload as ChatMessage;
            if (activeConvIdRef.current === incomingMsg.conversationId) {
              setMessages((prev) =>
                prev.some((m) => m.id === incomingMsg.id) ? prev : [...prev, incomingMsg],
              );
              if (incomingMsg.senderRole === 'finder') {
                api.markConversationRead(incomingMsg.conversationId).catch(() => {});
              }
            }
            refreshAll();
          } else if (data.event === 'messages:read' && data.payload) {
            const readPayload = data.payload as { conversationId?: string; readerRole?: string };
            if (
              readPayload.readerRole === 'finder' &&
              activeConvIdRef.current === readPayload.conversationId
            ) {
              setMessages((prev) =>
                prev.map((m) => (m.senderRole === 'owner' ? { ...m, readStatus: true } : m)),
              );
            }
            refreshAll();
          } else if (data.event === 'conversation:updated') {
            refreshAll();
          } else if (data.event === 'notification:created' && data.payload) {
            const notif = data.payload as AppNotification;
            setNotifications((prev) => (prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev]));
            setUnreadNotifications((n) => n + 1);
            if (
              typeof window !== 'undefined' &&
              'Notification' in window &&
              window.Notification.permission === 'granted' &&
              document.visibilityState === 'hidden'
            ) {
              try {
                new window.Notification(notif.title, { body: notif.body });
              } catch {
                // Ignore browser notification error
              }
            }
          }
        } catch {
          // Ignore malformed WS frame
        }
      };
    } catch {
      // Fallback gracefully
    }

    return () => {
      ws?.close();
    };
  }, [refreshAll]);

  // Load selected conversation messages and mark unread finder messages as read
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessagesLoading(true);
    setConvError(null);
    api
      .getConversationMessages(activeConvId)
      .then((res) => {
        if (!active) return;
        setMessages(res.messages);
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConvId ? { ...c, unreadCount: 0 } : c)),
        );
        api.getDashboard().then((d) => {
          if (active) setStats(d.stats);
        }).catch(() => {});
      })
      .catch((err) => {
        if (active) setConvError(err instanceof Error ? err.message : 'Could not load messages.');
      })
      .finally(() => {
        if (active) setMessagesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeConvId]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.publicSlug.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, statusFilter, categoryFilter]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId],
  );

  async function handleSignOut() {
    try {
      await api.logout();
    } catch {
      // Ignore logout network error
    }
    setStoredToken(null);
    onSignedOut();
  }

  function handleItemSaved(saved: TagItem, isEdit: boolean) {
    setItems((prev) =>
      isEdit ? prev.map((it) => (it.id === saved.id ? saved : it)) : [saved, ...prev],
    );
    setSelectedItemId(saved.id);
    setTab('items');
    refreshAll();
  }

  async function handleQuickStatusChange(item: TagItem, nextStatus: ItemStatus) {
    try {
      const res = await api.updateItem(item.id, { status: nextStatus });
      setItems((prev) => prev.map((it) => (it.id === item.id ? res.item : it)));
      refreshAll();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to update status.');
    }
  }

  async function handleDeleteItem(id: string) {
    try {
      await api.deleteItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (selectedItemId === id) setSelectedItemId(null);
      setDeleteConfirmId(null);
      refreshAll();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to delete item.');
    }
  }

  async function handleSendOwnerReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConvId || !replyBody.trim()) return;
    setSendingReply(true);
    setConvError(null);
    try {
      const res = await api.sendOwnerMessage(activeConvId, replyBody.trim());
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message],
      );
      setReplyBody('');
      refreshAll();
    } catch (err) {
      setConvError(err instanceof Error ? err.message : 'Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  }

  async function handleToggleBlock(conv: ConversationSummary) {
    setConvError(null);
    try {
      await api.toggleBlockFinder(conv.id, !conv.blockedByOwner);
      await refreshAll();
    } catch (err) {
      setConvError(err instanceof Error ? err.message : 'Could not update block status.');
    }
  }

  async function handleResolveConversation(conv: ConversationSummary, markReturned: boolean) {
    setConvError(null);
    try {
      await api.resolveConversation(conv.id, markReturned);
      await refreshAll();
    } catch (err) {
      setConvError(err instanceof Error ? err.message : 'Could not update conversation.');
    }
  }

  async function handleSubmitAbuseReport(e: React.FormEvent) {
    e.preventDefault();
    if (!abuseModalConvId) return;
    try {
      const res = await api.reportAbuse({
        conversationId: abuseModalConvId,
        reporterRole: 'owner',
        reason: abuseReason,
        details: abuseDetails,
      });
      setAbuseFeedback(res.message);
      setAbuseDetails('');
      setTimeout(() => {
        setAbuseModalConvId(null);
        setAbuseFeedback(null);
      }, 1500);
    } catch (err) {
      setAbuseFeedback(err instanceof Error ? err.message : 'Could not submit report.');
    }
  }

  async function handleProfileImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileError(null);
    const validationErr = validateImageFile(file);
    if (validationErr) {
      setProfileError(validationErr);
      e.target.value = '';
      return;
    }
    try {
      setProfileUploadProgress(5);
      const compressed = await compressImageFile(file, 600);
      setProfileImagePreview(compressed);
      setRemoveProfileImage(false);
      const url = await uploadImageWithProgress(compressed, setProfileUploadProgress);
      setUploadedProfileImageUrl(url);
      setTimeout(() => setProfileUploadProgress(null), 600);
    } catch (err) {
      setProfileUploadProgress(null);
      setProfileError(err instanceof Error ? err.message : 'Profile image upload failed.');
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const res = await api.updateProfile({
        fullName,
        displayAlias,
        phone,
        address,
        ...(uploadedProfileImageUrl && uploadedProfileImageUrl !== user.profileImage
          ? { profileImageUrl: uploadedProfileImageUrl }
          : {}),
        ...(removeProfileImage ? { removeProfileImage: true } : {}),
      });
      onUserUpdated(res.user);
      setProfileMessage('Profile and privacy settings saved.');
      refreshAll();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    try {
      const res = await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage(res.message);
      refreshAll();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password.');
    }
  }

  async function handleMarkAllNotifsRead() {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadNotifications(0);
  }

  async function handleOpenNotification(notif: AppNotification) {
    if (!notif.isRead) {
      api.markNotificationRead(notif.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
      );
      setUnreadNotifications((c) => Math.max(0, c - 1));
    }
    if (notif.conversationId) {
      setActiveConvId(notif.conversationId);
      setTab('conversations');
    } else if (notif.itemId) {
      setSelectedItemId(notif.itemId);
      setTab('items');
    }
  }

  async function handleRequestBrowserAlerts() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await window.Notification.requestPermission();
    setBrowserAlertPermission(perm);
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteAccountError(null);
    setDeletingAccount(true);
    try {
      await api.deleteAccount(deleteAccountPassword);
      setStoredToken(null);
      onSignedOut();
    } catch (err) {
      setDeleteAccountError(err instanceof Error ? err.message : 'Unable to delete account.');
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleSubmitSupport(e: React.FormEvent) {
    e.preventDefault();
    if (!supportDetails.trim()) return;
    setSupportFeedback(null);
    try {
      const res = await api.reportAbuse({
        reporterRole: 'owner',
        reason: supportReason,
        details: supportDetails.trim(),
      });
      setSupportFeedback(res.message);
      setSupportDetails('');
    } catch (err) {
      setSupportFeedback(err instanceof Error ? err.message : 'Unable to submit inquiry.');
    }
  }

  const navItems: Array<{
    id: DashboardTab;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
    highlight?: boolean;
  }> = [
    { id: 'overview', label: t('navHome'), icon: LayoutDashboard },
    { id: 'items', label: t('navItems'), icon: Package, count: stats.totalItems },
    { id: 'qr-codes', label: t('navQrCodes'), icon: QrCode, count: stats.totalItems },
    {
      id: 'conversations',
      label: t('navMessages'),
      icon: MessageSquare,
      count: stats.unreadMessages > 0 ? stats.unreadMessages : stats.activeConversations,
      highlight: stats.unreadMessages > 0,
    },
    {
      id: 'notifications',
      label: t('navNotifications'),
      icon: Bell,
      count: unreadNotifications > 0 ? unreadNotifications : undefined,
      highlight: unreadNotifications > 0,
    },
    { id: 'profile', label: t('navProfile'), icon: User },
    { id: 'settings', label: t('navSettings'), icon: Settings },
    { id: 'help', label: t('navHelp'), icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[256px] lg:flex-col lg:fixed lg:inset-y-0 bg-[#101828] text-[#F8FAFC] border-r border-slate-800">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={onGoHome}
            className="font-display text-lg font-extrabold tracking-tight text-white hover:text-slate-200 transition-colors"
          >
            TAGBACKLY
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((nav) => {
            const Icon = nav.icon;
            const active = tab === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  setTab(nav.id);
                  if (nav.id !== 'items') setSelectedItemId(null);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{nav.label}</span>
                </span>
                {typeof nav.count === 'number' && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active
                        ? 'text-white/95'
                        : nav.highlight
                          ? 'text-[#8B5CF6] font-bold'
                          : 'text-slate-400'
                    }`}
                  >
                    {nav.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="px-2 flex items-center gap-3">
            {user.profileImage ? (
              <img
                src={user.profileImage}
                alt={user.fullName}
                className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
              <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#101828] text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <button
          type="button"
          onClick={onGoHome}
          className="font-display text-base font-extrabold tracking-tight"
        >
          TAGBACKLY
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="p-2 text-slate-300 hover:text-white"
            aria-label="Scan QR"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className="relative p-2 text-slate-300 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 text-[9px] font-mono font-bold text-white bg-[#2563EB] px-1 rounded">
                {unreadNotifications}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2563EB] rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-2 text-slate-300 hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#101828] text-white px-4 pb-4 border-b border-slate-800 space-y-1">
          {navItems.map((nav) => {
            const Icon = nav.icon;
            const active = tab === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  setTab(nav.id);
                  setMobileMenuOpen(false);
                  if (nav.id !== 'items') setSelectedItemId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium ${
                  active ? 'bg-[#2563EB] text-white' : 'text-slate-300'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{nav.label}</span>
                </span>
                {typeof nav.count === 'number' && (
                  <span className="font-mono text-xs tabular-nums">{nav.count}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-rose-300"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('signOut')}</span>
          </button>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-[256px] flex flex-col min-w-0">
        {/* Desktop Workspace Top Bar */}
        <div className="hidden lg:flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>Owner Portal</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#101828] font-semibold">
              {tab === 'overview' && t('navHome')}
              {tab === 'items' && (selectedItem ? selectedItem.name : t('myItemsTitle'))}
              {tab === 'qr-codes' && t('myQrTitle')}
              {tab === 'conversations' && t('conversationsTitle')}
              {tab === 'notifications' && t('notificationsTitle')}
              {tab === 'profile' && t('profileTitle')}
              {tab === 'settings' && t('settingsTitle')}
              {tab === 'help' && t('helpTitle')}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#101828] bg-[#F8FAFC] border border-slate-200 hover:border-slate-300 rounded-xl transition-colors whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>{t('scanTag')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{t('addNewItem')}</span>
            </button>
          </div>
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-[1200px] w-full mx-auto">
          {loadError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 flex items-center justify-between">
              <span>{loadError}</span>
              <button type="button" onClick={refreshAll} className="font-semibold underline">
                Retry
              </button>
            </div>
          )}

          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#101828]">
                  {t('overviewTitle')}, {user.fullName.split(' ')[0]}
                </h1>
                <p className="text-sm text-slate-600 mt-1">{t('overviewSub')}</p>
              </div>

              {/* Real-Database KPI Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-500">{t('totalItems')}</div>
                  <div className="mt-2 font-display text-2xl font-bold text-[#101828] tabular-nums">
                    {loading ? '—' : stats.totalItems}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-500">{t('lostItems')}</div>
                  <div className="mt-2 font-display text-2xl font-bold text-rose-600 tabular-nums">
                    {loading ? '—' : stats.lostItems}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-500">{t('foundItems')}</div>
                  <div className="mt-2 font-display text-2xl font-bold text-amber-600 tabular-nums">
                    {loading ? '—' : stats.foundItems}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-500">{t('chattingItems')}</div>
                  <div className="mt-2 font-display text-2xl font-bold text-[#8B5CF6] tabular-nums">
                    {loading ? '—' : stats.chattingItems}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-500">{t('returnedItems')}</div>
                  <div className="mt-2 font-display text-2xl font-bold text-emerald-600 tabular-nums">
                    {loading ? '—' : stats.returnedItems}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-slate-500">{t('activeChats')}</div>
                  <div className="mt-2 font-display text-2xl font-bold text-[#2563EB] tabular-nums">
                    {loading ? '—' : stats.activeConversations}
                  </div>
                </div>
              </div>

              {items.length === 0 && !loading ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center mx-auto mb-4">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-[#101828]">
                    Register your first item to generate a QR tag
                  </h2>
                  <p className="text-sm text-slate-600 max-w-md mx-auto mt-2">
                    Add your wallet, backpack, laptop, keys, or documents. Every item gets a unique
                    privacy-protected QR code ready to download or print.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setModalOpen(true);
                    }}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Your First Item</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-[#101828]">Recent Items</h2>
                      <button
                        type="button"
                        onClick={() => setTab('items')}
                        className="text-xs font-semibold text-[#2563EB] hover:underline"
                      >
                        View all
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {items.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setTab('items');
                          }}
                          className="w-full px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F8FAFC] text-left transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {item.photoUrl ? (
                              <img
                                src={item.photoUrl}
                                alt={item.name}
                                className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                <Package className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[#101828] truncate">
                                {item.name}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span>{item.category}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">{item.publicSlug}</span>
                              </div>
                            </div>
                          </div>
                          <StatusIndicator status={item.status} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-[#101828]">Recent Finder Messages</h2>
                      <button
                        type="button"
                        onClick={() => setTab('conversations')}
                        className="text-xs font-semibold text-[#2563EB] hover:underline"
                      >
                        Open inbox
                      </button>
                    </div>
                    {conversations.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No finder messages yet. When someone scans one of your QR tags and sends a
                        message, it will appear here in real time.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {conversations.slice(0, 5).map((conv) => (
                          <button
                            key={conv.id}
                            type="button"
                            onClick={() => {
                              setActiveConvId(conv.id);
                              setTab('conversations');
                            }}
                            className="w-full px-6 py-3.5 text-left hover:bg-[#F8FAFC] transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-[#101828] truncate">
                                {conv.finderLabel}
                              </span>
                              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                {new Date(conv.lastMessageAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="text-xs text-[#2563EB] font-medium truncate">
                                {conv.itemName}
                              </span>
                              {conv.unreadCount > 0 && (
                                <span className="text-[10px] font-mono font-bold text-white bg-[#2563EB] px-1.5 py-0.5 rounded tabular-nums shrink-0">
                                  {conv.unreadCount} new
                                </span>
                              )}
                            </div>
                            {conv.lastMessageBody && (
                              <p className="text-xs text-slate-500 truncate mt-1">
                                {conv.lastMessageBody}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ITEMS TAB */}
          {tab === 'items' && !selectedItem && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#101828]">{t('myItemsTitle')}</h1>
                  <p className="text-sm text-slate-600 mt-1">{t('myItemsSub')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('addNewItem')}</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search items by name, description, or tag ID..."
                    className="w-full pl-10 pr-4 py-2 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 text-xs font-medium bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#101828]"
                  >
                    <option value="all">All Categories</option>
                    {ITEM_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
                    {(['all', ...ITEM_STATUSES] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                          statusFilter === st
                            ? 'bg-white text-[#101828] shadow-xs'
                            : 'text-slate-600 hover:text-[#101828]'
                        }`}
                      >
                        {st === 'all' ? 'All' : st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                  <p className="text-sm font-semibold text-[#101828]">No matching items found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {items.length === 0
                      ? 'Register your first item to generate a unique QR code.'
                      : 'Try adjusting your search query or status filter.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="aspect-[16/10] bg-slate-100 border-b border-slate-100 overflow-hidden relative">
                          {item.photoUrl ? (
                            <img
                              src={item.photoUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                              <Package className="w-8 h-8" />
                              <span className="text-xs">No photo uploaded</span>
                            </div>
                          )}
                        </div>
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                            <span className="truncate">{item.category}</span>
                            <StatusIndicator status={item.status} />
                          </div>
                          <h3 className="font-display text-base font-bold text-[#101828] truncate">
                            {item.name}
                          </h3>
                          <p className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="font-mono">{item.publicSlug}</span>
                            <span className="tabular-nums">
                              {item.conversationCount} {item.conversationCount === 1 ? 'chat' : 'chats'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="px-5 py-3.5 bg-[#F8FAFC] border-t border-slate-200 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Details & QR</span>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-[#101828] rounded-lg hover:bg-slate-200/70 transition-colors"
                            title="Edit item"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ITEM DETAIL & QR STUDIO VIEW */}
          {tab === 'items' && selectedItem && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedItemId(null)}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#101828]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to All Items</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(selectedItem);
                      setModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#101828] bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Item</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(selectedItem.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  {selectedItem.photoUrl ? (
                    <div className="aspect-[16/10] bg-slate-100 border-b border-slate-200">
                      <img
                        src={selectedItem.photoUrl}
                        alt={selectedItem.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-slate-50 border-b border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <Package className="w-10 h-10" />
                      <span className="text-xs">No item photo uploaded</span>
                    </div>
                  )}

                  <div className="p-6 space-y-6">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-500">
                          {selectedItem.category}
                        </span>
                        <StatusIndicator status={selectedItem.status} />
                      </div>
                      <h1 className="font-display text-2xl font-bold text-[#101828] mt-1">
                        {selectedItem.name}
                      </h1>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#101828] mb-2">
                        Update Item Status
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {ITEM_STATUSES.map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleQuickStatusChange(selectedItem, st)}
                            className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                              selectedItem.status === st
                                ? 'bg-[#101828] text-white border-[#101828]'
                                : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-1">Description</div>
                        <p className="text-sm text-[#101828] leading-relaxed whitespace-pre-wrap">
                          {selectedItem.description}
                        </p>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-1">
                          Public Owner Message
                        </div>
                        <p className="text-sm text-[#101828] leading-relaxed whitespace-pre-wrap">
                          {selectedItem.ownerMessage || 'No custom message set.'}
                        </p>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-1">
                          Reward Setting
                        </div>
                        <p className="text-sm font-medium text-[#101828]">
                          {selectedItem.rewardType === 'amount' && selectedItem.rewardAmount
                            ? `Reward Amount: ${selectedItem.rewardAmount}`
                            : selectedItem.rewardType === 'custom' && selectedItem.rewardDescription
                              ? `Custom Reward: ${selectedItem.rewardDescription}`
                              : 'No Reward'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <QrCodeStudio item={selectedItem} onOpenPublicPreview={onOpenPublicPreview} />
                </div>
              </div>
            </div>
          )}

          {/* CONVERSATIONS TAB */}
          {tab === 'conversations' && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#101828]">
                  {t('conversationsTitle')}
                </h1>
                <p className="text-sm text-slate-600 mt-1">{t('conversationsSub')}</p>
              </div>

              {convError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                  {convError}
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
                <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                  {conversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No conversations yet. Finders can contact you from any item’s QR page.
                    </div>
                  ) : (
                    conversations.map((conv) => {
                      const isSelected = conv.id === activeConvId;
                      return (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => setActiveConvId(conv.id)}
                          className={`w-full p-4 text-left transition-colors ${
                            isSelected ? 'bg-[#2563EB]/8' : 'hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-[#101828] truncate">
                              {conv.finderLabel}
                            </span>
                            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                              {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs font-medium text-[#2563EB] truncate">
                              {conv.itemName}
                            </span>
                            {conv.unreadCount > 0 && (
                              <span className="text-[10px] font-mono font-bold text-white bg-[#2563EB] px-1.5 py-0.5 rounded tabular-nums shrink-0">
                                {conv.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="truncate">{conv.lastMessageBody || 'Started conversation'}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0">
                              {conv.blockedByOwner
                                ? 'Blocked'
                                : conv.status === 'resolved'
                                  ? 'Resolved'
                                  : 'Active'}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="lg:col-span-8 flex flex-col h-[540px]">
                  {!activeConversation ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                      <MessageSquare className="w-8 h-8 text-slate-300 mb-3" />
                      <p className="text-sm font-semibold text-[#101828]">Select a conversation</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Choose a thread from the left to reply or manage contact permissions.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC]">
                        <div>
                          <div className="text-sm font-bold text-[#101828]">
                            {activeConversation.finderLabel}
                          </div>
                          <div className="text-xs text-slate-500">
                            Item:{' '}
                            <span className="font-medium text-[#101828]">
                              {activeConversation.itemName}
                            </span>{' '}
                            · Status:{' '}
                            <span className="capitalize font-semibold">{activeConversation.status}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleResolveConversation(activeConversation, true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Returned</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleBlock(activeConversation)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                              activeConversation.blockedByOwner
                                ? 'text-[#101828] bg-slate-100 border-slate-200'
                                : 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                            }`}
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>{activeConversation.blockedByOwner ? 'Unblock' : 'Block Contact'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAbuseModalConvId(activeConversation.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            <span>Report</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-white">
                        {messagesLoading ? (
                          <div className="text-xs text-slate-400 text-center py-8">Loading messages...</div>
                        ) : (
                          messages.map((msg) => {
                            const isOwner = msg.senderRole === 'owner';
                            return (
                              <div
                                key={msg.id}
                                className={`flex flex-col ${isOwner ? 'items-end' : 'items-start'}`}
                              >
                                <div
                                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                    isOwner
                                      ? 'bg-[#2563EB] text-white'
                                      : 'bg-[#F8FAFC] border border-slate-200 text-[#101828]'
                                  }`}
                                >
                                  <p className="whitespace-pre-wrap">{msg.body}</p>
                                </div>
                                <span className="mt-1 text-[10px] text-slate-400 px-1 inline-flex items-center gap-1 tabular-nums">
                                  <span>
                                    {msg.senderLabel} ·{' '}
                                    {new Date(msg.createdAt).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                  {isOwner &&
                                    (msg.readStatus ? (
                                      <CheckCheck className="w-3 h-3 text-[#2563EB]" aria-label="Read" />
                                    ) : (
                                      <Check className="w-3 h-3 text-slate-400" aria-label="Delivered" />
                                    ))}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {activeConversation.blockedByOwner || activeConversation.blockedByFinder ? (
                        <div className="p-4 bg-rose-50 border-t border-rose-200 text-xs font-medium text-rose-700 text-center">
                          {activeConversation.blockedByOwner
                            ? 'You blocked this contact. Unblock them above to resume messaging.'
                            : 'The finder ended and blocked this conversation.'}
                        </div>
                      ) : (
                        <form
                          onSubmit={handleSendOwnerReply}
                          className="p-3.5 border-t border-slate-200 bg-[#F8FAFC] flex items-center gap-2.5"
                        >
                          <input
                            type="text"
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            placeholder="Write a reply (your phone & email stay private)..."
                            className="flex-1 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                          />
                          <button
                            type="submit"
                            disabled={sendingReply || !replyBody.trim()}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send</span>
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {tab === 'notifications' && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#101828]">
                    {t('notificationsTitle')}
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">{t('notificationsSub')}</p>
                </div>

                <div className="flex items-center gap-2.5">
                  {browserAlertPermission !== 'unsupported' && browserAlertPermission !== 'granted' && (
                    <button
                      type="button"
                      onClick={handleRequestBrowserAlerts}
                      className="px-3.5 py-2 text-xs font-semibold text-[#2563EB] bg-[#2563EB]/10 hover:bg-[#2563EB]/15 rounded-xl"
                    >
                      Enable Browser Alerts
                    </button>
                  )}
                  {unreadNotifications > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllNotifsRead}
                      className="px-3.5 py-2 text-xs font-semibold text-[#101828] bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No notifications yet. Activity on your items and chats will appear here.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => handleOpenNotification(notif)}
                      className={`w-full px-6 py-4 text-left flex items-start justify-between gap-4 transition-colors ${
                        notif.isRead ? 'bg-white hover:bg-[#F8FAFC]' : 'bg-[#2563EB]/5 hover:bg-[#2563EB]/10'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[#101828]">
                            {notif.title}
                          </span>
                          {!notif.isRead && (
                            <span className="text-[10px] font-semibold text-[#2563EB]">New</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.body}</p>
                      </div>
                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                        {new Date(notif.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* PROFILE & PRIVACY TAB */}
          {tab === 'profile' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#101828]">
                  {t('profileTitle')}
                </h1>
                <p className="text-sm text-slate-600 mt-1">{t('profileSub')}</p>
              </div>

              <form
                onSubmit={handleSaveProfile}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5"
              >
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#2563EB]/8 border border-[#2563EB]/20 text-xs text-[#101828]">
                  <Lock className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                  <span>
                    Your email, private phone number, and street address are never displayed on any
                    public QR code page or shared with finders.
                  </span>
                </div>

                {profileError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                    {profileError}
                  </div>
                )}
                {profileMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
                    {profileMessage}
                  </div>
                )}

                {/* Profile Image Upload */}
                <div className="flex items-center gap-4">
                  {profileImagePreview ? (
                    <img
                      src={profileImagePreview}
                      alt={fullName}
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                      <ImagePlus className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 space-y-1.5">
                    <div className="text-xs font-semibold text-[#101828]">
                      Profile Photo (Private Account Avatar)
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => profileFileRef.current?.click()}
                        className="text-xs font-semibold text-[#2563EB] hover:underline"
                      >
                        {profileImagePreview ? 'Change photo' : 'Upload photo'}
                      </button>
                      {profileImagePreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileImagePreview(null);
                            setUploadedProfileImageUrl(null);
                            setRemoveProfileImage(true);
                          }}
                          className="text-xs font-semibold text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {profileUploadProgress !== null && (
                      <div className="w-full max-w-xs h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] transition-all"
                          style={{ width: `${profileUploadProgress}%` }}
                        />
                      </div>
                    )}
                    <input
                      ref={profileFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleProfileImageSelect}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                      Full Name (Private)
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                      Public Display Alias (Shown to Finders)
                    </label>
                    <input
                      type="text"
                      required
                      value={displayAlias}
                      onChange={(e) => setDisplayAlias(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                      Account Email (Private)
                    </label>
                    <input
                      type="email"
                      disabled
                      value={user.email}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-xl text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                      Phone Number (Private)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Optional private record"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                    Home / Return Address (Private)
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Optional private record — never shown publicly"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
                  >
                    {profileSaving ? 'Saving...' : 'Save Profile Settings'}
                  </button>
                </div>
              </form>

              <form
                onSubmit={handleUpdatePassword}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-[#101828]">Change Password</h2>
                {passwordError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                    {passwordError}
                  </div>
                )}
                {passwordMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
                    {passwordMessage}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-semibold text-[#101828] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    {t('updatePasswordBtn')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* MY QR CODES TAB */}
          {tab === 'qr-codes' && (
            <QrPreviewGrid
              items={items}
              onAddNew={() => {
                setEditingItem(null);
                setModalOpen(true);
              }}
              onSelectItem={(id) => {
                setSelectedItemId(id);
                setTab('items');
              }}
              onOpenPublicPreview={onOpenPublicPreview}
            />
          )}

          {/* SETTINGS TAB */}
          {tab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#101828]">
                  {t('settingsTitle')}
                </h1>
                <p className="text-sm text-slate-600 mt-1">{t('settingsSub')}</p>
              </div>

              {/* Language Preference */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-5 h-5 text-[#2563EB]" />
                  <h2 className="font-display text-base font-bold text-[#101828]">
                    {t('languageLabel')}
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`py-3 px-4 text-sm font-semibold rounded-xl border transition-colors ${
                      lang === 'en'
                        ? 'bg-[#101828] text-white border-[#101828]'
                        : 'bg-[#F8FAFC] text-[#101828] border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {t('englishLabel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('hi')}
                    className={`py-3 px-4 text-sm font-semibold rounded-xl border transition-colors ${
                      lang === 'hi'
                        ? 'bg-[#101828] text-white border-[#101828]'
                        : 'bg-[#F8FAFC] text-[#101828] border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {t('hindiLabel')}
                  </button>
                </div>
              </div>

              {/* Notifications Preference */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-5 h-5 text-[#2563EB]" />
                  <h2 className="font-display text-base font-bold text-[#101828]">
                    {t('notificationsPrefTitle')}
                  </h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('notificationsPrefDesc')}
                </p>
                <div className="pt-1">
                  {browserAlertPermission === 'granted' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t('alertsEnabledLabel')}</span>
                    </span>
                  ) : browserAlertPermission === 'denied' ? (
                    <span className="text-xs font-medium text-amber-700">
                      {t('alertsBlockedLabel')}
                    </span>
                  ) : browserAlertPermission === 'unsupported' ? (
                    <span className="text-xs font-medium text-slate-500">
                      {t('alertsUnsupportedLabel')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestBrowserAlerts}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl"
                    >
                      {t('enableAlertsBtn')}
                    </button>
                  )}
                </div>
              </div>

              {/* PWA Install */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold text-[#101828]">
                  {t('pwaSectionTitle')}
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">{t('pwaSectionDesc')}</p>
                <div className="pt-1">
                  <PWAInstallButton />
                </div>
              </div>

              {/* Active Security & Privacy Protections */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                  <h2 className="font-display text-base font-bold text-[#101828]">
                    {t('securitySummaryTitle')}
                  </h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('securitySummaryDesc')}
                </p>
              </div>

              {/* Delete Account Danger Zone */}
              <div className="bg-white border border-rose-200 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2.5 text-rose-600">
                  <ShieldAlert className="w-5 h-5" />
                  <h2 className="font-display text-base font-bold">{t('deleteAccountTitle')}</h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('deleteAccountWarn')}
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteAccountPassword('');
                      setDeleteAccountError(null);
                      setDeleteAccountOpen(true);
                    }}
                    className="px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors"
                  >
                    {t('deleteAccountBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="px-4 py-2.5 text-xs font-semibold text-[#101828] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    {t('signOut')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* HELP & SUPPORT TAB */}
          {tab === 'help' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#101828]">{t('helpTitle')}</h1>
                <p className="text-sm text-slate-600 mt-1">{t('helpSub')}</p>
              </div>

              {/* Safe Handover & Minor Guidance */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                  <h2 className="font-display text-base font-bold text-[#101828]">
                    {t('safetyHeadline')}
                  </h2>
                </div>
                <ul className="space-y-2 text-xs text-slate-600 leading-relaxed list-disc pl-5">
                  <li>{t('safetyPoint1')}</li>
                  <li>{t('safetyPoint2')}</li>
                  <li className="font-semibold text-[#101828]">{t('safetyPoint3')}</li>
                  <li>{t('safetyPoint4')}</li>
                </ul>
              </div>

              {/* Support / Abuse Inquiry Form */}
              <form
                onSubmit={handleSubmitSupport}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-[#101828]">
                  Contact Support or Report Safety Concern
                </h2>
                {supportFeedback && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                    {supportFeedback}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                    Topic
                  </label>
                  <select
                    value={supportReason}
                    onChange={(e) => setSupportReason(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
                  >
                    <option value="General Support Question">General Support Question</option>
                    <option value="QR Tag Printing or Scanning Help">
                      QR Tag Printing or Scanning Help
                    </option>
                    <option value="Suspicious Finder or Safety Issue">
                      Suspicious Finder or Safety Issue
                    </option>
                    <option value="Privacy or Account Security Inquiry">
                      Privacy or Account Security Inquiry
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                    Message
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={1000}
                    value={supportDetails}
                    onChange={(e) => setSupportDetails(e.target.value)}
                    placeholder="Describe your question or safety concern..."
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-[#101828] hover:bg-slate-800 rounded-xl"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (4 primary routes, compact < 64px) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 grid grid-cols-4 gap-1"
      >
        <button
          type="button"
          onClick={() => {
            setTab('overview');
            setSelectedItemId(null);
          }}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition-colors ${
            tab === 'overview' ? 'text-[#2563EB]' : 'text-slate-500 hover:text-[#101828]'
          }`}
        >
          <Home className="w-4 h-4 mb-0.5" />
          <span>{t('navHome')}</span>
        </button>

        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-[#101828] transition-colors"
        >
          <QrCode className="w-4 h-4 mb-0.5" />
          <span>{t('navScan')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('conversations')}
          className={`relative flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition-colors ${
            tab === 'conversations' ? 'text-[#2563EB]' : 'text-slate-500 hover:text-[#101828]'
          }`}
        >
          <MessageSquare className="w-4 h-4 mb-0.5" />
          <span>{t('navMessages')}</span>
          {stats.unreadMessages > 0 && (
            <span className="absolute top-0.5 right-4 font-mono text-[9px] font-bold text-white bg-[#2563EB] px-1 rounded tabular-nums">
              {stats.unreadMessages}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition-colors ${
            tab === 'profile' || tab === 'settings' || tab === 'help'
              ? 'text-[#2563EB]'
              : 'text-slate-500 hover:text-[#101828]'
          }`}
        >
          <User className="w-4 h-4 mb-0.5" />
          <span>{t('navProfile')}</span>
        </button>
      </nav>

      <ItemFormModal
        open={modalOpen}
        editingItem={editingItem}
        onClose={() => setModalOpen(false)}
        onSaved={handleItemSaved}
      />

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onMatchSlug={onOpenPublicPreview}
      />

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-[#101828]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-display text-base font-bold text-[#101828]">Delete Registered Item?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This permanently removes the item, its unique QR landing page, and all associated
              conversations.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteItem(deleteConfirmId)}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                Delete Item
              </button>
            </div>
          </div>
        </div>
      )}

      {abuseModalConvId && (
        <div className="fixed inset-0 z-50 bg-[#101828]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitAbuseReport}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-[#101828]">Report Abuse</h3>
            {abuseFeedback && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                {abuseFeedback}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#101828] mb-1.5">Reason</label>
              <select
                value={abuseReason}
                onChange={(e) => setAbuseReason(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
              >
                <option value="Spam or unsolicited solicitation">Spam or unsolicited solicitation</option>
                <option value="Extortion or ransom demand">Extortion or ransom demand</option>
                <option value="Harassment or abusive language">Harassment or abusive language</option>
                <option value="Suspicious phishing link">Suspicious phishing link</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                Additional Details
              </label>
              <textarea
                rows={3}
                value={abuseDetails}
                onChange={(e) => setAbuseDetails(e.target.value)}
                placeholder="Describe what happened..."
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAbuseModalConvId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#101828] rounded-xl"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteAccountOpen && (
        <div className="fixed inset-0 z-50 bg-[#101828]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleDeleteAccount}
            className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-display text-base font-bold text-[#101828]">
                {t('deleteAccountTitle')}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{t('deleteAccountWarn')}</p>
            {deleteAccountError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                {deleteAccountError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                {t('confirmPasswordLabel')}
              </label>
              <input
                type="password"
                required
                value={deleteAccountPassword}
                onChange={(e) => setDeleteAccountPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteAccountOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deletingAccount || !deleteAccountPassword}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-xl"
              >
                {deletingAccount ? 'Deleting...' : t('deleteAccountBtn')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
