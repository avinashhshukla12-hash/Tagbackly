import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Ban,
  Check,
  CheckCheck,
  Flag,
  Globe,
  Info,
  Lock,
  MessageSquare,
  Package,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { api, createWebSocketUrl, getOrCreateFinderToken } from '../lib/api';
import { useLanguage } from '../lib/i18n';
import type { ChatMessage, ItemStatus, PublicTagItem } from '../types';
import { StatusIndicator } from './StatusBadge';

interface PublicQrPageProps {
  slug: string;
  onGoHome: () => void;
}

interface FinderConversationState {
  id: string;
  finderLabel: string;
  status: 'active' | 'resolved' | 'blocked';
  blockedByOwner: boolean;
  blockedByFinder: boolean;
  createdAt: string;
}

export function PublicQrPage({ slug, onGoHome }: PublicQrPageProps) {
  const { lang, setLang, t } = useLanguage();
  const [item, setItem] = useState<PublicTagItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  const [finderToken] = useState(() => getOrCreateFinderToken());
  const [conversation, setConversation] = useState<FinderConversationState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatExpanded, setChatExpanded] = useState(false);

  const [finderLabel, setFinderLabel] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Suspicious or inappropriate content');
  const [reportDetails, setReportDetails] = useState('');
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const contactSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFoundError(null);

    Promise.all([
      api.getPublicItem(slug),
      api.getFinderConversation(slug, finderToken).catch(() => ({ conversation: null, messages: [] })),
    ])
      .then(([itemRes, convRes]) => {
        if (!active) return;
        setItem(itemRes.item);
        if (convRes.conversation) {
          setConversation(convRes.conversation);
          setMessages(convRes.messages);
          setChatExpanded(true);
        }
      })
      .catch((err) => {
        if (!active) return;
        setNotFoundError(err instanceof Error ? err.message : 'Unable to load this TAGBACKLY tag.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, finderToken]);

  useEffect(() => {
    if (!conversation?.id) return;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(createWebSocketUrl());
      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: 'subscribe_conversation',
            conversationId: conversation.id,
            finderToken,
          }),
        );
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            event?: string;
            conversationId?: string;
            payload?:
              | ChatMessage
              | (Partial<FinderConversationState> & { itemStatus?: ItemStatus })
              | { readerRole?: string };
          };
          if (data.conversationId !== conversation.id) return;
          if (data.event === 'message:created' && data.payload) {
            const msg = data.payload as ChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            if (msg.senderRole === 'owner') {
              api.markFinderConversationRead(conversation.id, finderToken).catch(() => {});
            }
          } else if (data.event === 'messages:read' && data.payload) {
            const readPayload = data.payload as { readerRole?: string };
            if (readPayload.readerRole === 'owner') {
              setMessages((prev) =>
                prev.map((m) => (m.senderRole === 'finder' ? { ...m, readStatus: true } : m)),
              );
            }
          } else if (data.event === 'conversation:updated' && data.payload) {
            const convUpdate = data.payload as Partial<FinderConversationState> & {
              itemStatus?: ItemStatus;
            };
            setConversation((prev) => (prev ? { ...prev, ...convUpdate } : prev));
            if (convUpdate.itemStatus) {
              setItem((prev) => (prev ? { ...prev, status: convUpdate.itemStatus! } : prev));
            }
          }
        } catch {
          // Ignore malformed WS frame
        }
      };
    } catch {
      // Ignore WS connection error
    }

    return () => {
      ws?.close();
    };
  }, [conversation?.id, finderToken]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function handleOpenContactPanel() {
    setChatExpanded(true);
    setTimeout(() => {
      contactSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  async function handleStartOrSend(e: React.FormEvent) {
    e.preventDefault();
    if (!messageInput.trim()) return;
    setChatError(null);
    setSending(true);

    try {
      if (!conversation) {
        const res = await api.startFinderConversation(slug, {
          finderToken,
          finderLabel: finderLabel.trim() || 'Finder',
          message: messageInput.trim(),
        });
        setConversation(res.conversation);
        setMessages([res.message]);
        if (res.itemStatus) {
          setItem((prev) => (prev ? { ...prev, status: res.itemStatus! } : prev));
        }
      } else {
        const res = await api.sendFinderMessage(conversation.id, finderToken, messageInput.trim());
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message],
        );
      }
      setMessageInput('');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  }

  async function handleBlockContact() {
    if (!conversation) return;
    setChatError(null);
    try {
      await api.blockByFinder(conversation.id, finderToken);
      setConversation((prev) =>
        prev ? { ...prev, status: 'blocked', blockedByFinder: true } : prev,
      );
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Could not block contact.');
    }
  }

  async function handleReportAbuse(e: React.FormEvent) {
    e.preventDefault();
    setReportFeedback(null);
    try {
      const res = await api.reportAbuse({
        itemSlug: slug,
        conversationId: conversation?.id,
        reporterRole: 'finder',
        reason: reportReason,
        details: reportDetails,
      });
      setReportFeedback(res.message);
      setReportDetails('');
      setTimeout(() => {
        setReportOpen(false);
        setReportFeedback(null);
      }, 1800);
    } catch (err) {
      setReportFeedback(err instanceof Error ? err.message : 'Failed to submit report.');
    }
  }

  const rewardDisplay =
    item && item.rewardType === 'amount' && item.rewardAmount
      ? item.rewardAmount
      : item && item.rewardType === 'custom' && item.rewardDescription
        ? item.rewardDescription
        : item && item.rewardAmount
          ? item.rewardAmount
          : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#101828]">
      <header className="bg-[#101828] text-white border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onGoHome}
            className="font-display text-base font-extrabold tracking-tight text-white whitespace-nowrap"
          >
            TAGBACKLY
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex text-[11px] font-medium text-slate-300 items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>{t('noAppNeeded')}</span>
            </span>
            <div className="inline-flex items-center rounded-lg border border-white/15 bg-white/5 p-0.5 text-[11px] font-semibold">
              <Globe className="w-3 h-3 text-slate-300 mx-1.5" />
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  lang === 'en' ? 'bg-[#2563EB] text-white' : 'text-slate-300'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('hi')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  lang === 'hi' ? 'bg-[#2563EB] text-white' : 'text-slate-300'
                }`}
              >
                हिं
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-4 animate-pulse">
            <div className="h-52 bg-slate-100 rounded-xl" />
            <div className="h-6 bg-slate-100 rounded w-1/2" />
            <div className="h-4 bg-slate-100 rounded w-3/4" />
          </div>
        ) : notFoundError || !item ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <h1 className="font-display text-xl font-bold text-[#101828]">
              {t('tagNotFoundTitle')}
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              {notFoundError || t('tagNotFoundDesc')}
            </p>
            <button
              type="button"
              onClick={onGoHome}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#101828] rounded-xl"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('returnHomeBtn')}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {item.photoUrl ? (
                <div className="aspect-[16/10] bg-slate-100 border-b border-slate-200">
                  <img
                    src={item.photoUrl}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-[16/9] bg-slate-50 border-b border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Package className="w-10 h-10" />
                  <span className="text-xs">Item photo not provided</span>
                </div>
              )}

              <div className="p-6 space-y-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                    <span>{item.category}</span>
                    <StatusIndicator status={item.status} />
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#101828] tracking-tight">
                    {item.name}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Registered by {item.ownerAlias} · Tag ID{' '}
                    <span className="font-mono text-[#101828]">{item.publicSlug}</span>
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 mb-1.5">
                    {t('itemDescriptionLabel')}
                  </div>
                  <p className="text-sm text-[#101828] leading-relaxed whitespace-pre-wrap">
                    {item.description}
                  </p>
                </div>

                {item.ownerMessage && (
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200">
                    <div className="text-xs font-semibold text-[#2563EB] mb-1">
                      {t('ownerMessageLabel')}
                    </div>
                    <p className="text-sm text-[#101828] leading-relaxed whitespace-pre-wrap">
                      {item.ownerMessage}
                    </p>
                  </div>
                )}

                {rewardDisplay && (
                  <div className="p-4 rounded-xl bg-[#8B5CF6]/8 border border-[#8B5CF6]/25 space-y-2">
                    <div className="flex items-center gap-3">
                      <Award className="w-5 h-5 text-[#8B5CF6] shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-[#8B5CF6]">
                          {t('rewardOfferedLabel')}
                        </div>
                        <div className="text-sm font-bold text-[#101828]">{rewardDisplay}</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pl-8">
                      {t('safetyPoint4')} {t('safetyPoint3')}
                    </p>
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleOpenContactPanel}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{conversation ? t('openConversation') : t('contactOwner')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(true)}
                    className="inline-flex items-center justify-center gap-2 py-3.5 px-4 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{t('reportAbuse')}</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Finder Anonymous Messaging Panel */}
            {chatExpanded && (
              <section
                ref={contactSectionRef}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
              >
                <div className="px-6 py-4 bg-[#101828] text-white flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold">
                      {conversation ? 'Private Real-Time Chat' : 'Start Conversation with Owner'}
                    </h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Status:{' '}
                      <span className="capitalize font-semibold text-white">
                        {conversation ? conversation.status : 'Ready'}
                      </span>{' '}
                      · No account registration required
                    </p>
                  </div>
                  {conversation && !conversation.blockedByFinder && !conversation.blockedByOwner && (
                    <button
                      type="button"
                      onClick={handleBlockContact}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:text-white bg-white/10 hover:bg-rose-600 rounded-lg transition-colors shrink-0"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>{t('blockContact')}</span>
                    </button>
                  )}
                </div>

                {/* Browser Session Recovery Notice */}
                <div className="px-5 py-2.5 bg-[#F8FAFC] border-b border-slate-200 flex items-start gap-2.5 text-[11px] text-slate-600">
                  <Info className="w-3.5 h-3.5 text-[#2563EB] shrink-0 mt-0.5" />
                  <span>{t('finderSessionNotice')}</span>
                </div>

                {chatError && (
                  <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                    {chatError}
                  </div>
                )}

                {conversation ? (
                  <>
                    <div className="p-5 space-y-3 max-h-[360px] overflow-y-auto bg-white">
                      {messages.map((msg) => {
                        const isFinder = msg.senderRole === 'finder';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isFinder ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                isFinder
                                  ? 'bg-[#2563EB] text-white'
                                  : 'bg-[#F8FAFC] border border-slate-200 text-[#101828]'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{msg.body}</p>
                            </div>
                            <span className="mt-1 text-[10px] text-slate-400 px-1 inline-flex items-center gap-1 tabular-nums">
                              <span>
                                {isFinder ? 'You' : msg.senderLabel} ·{' '}
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {isFinder &&
                                (msg.readStatus ? (
                                  <CheckCheck className="w-3 h-3 text-[#2563EB]" aria-label="Read" />
                                ) : (
                                  <Check className="w-3 h-3 text-slate-400" aria-label="Sent" />
                                ))}
                            </span>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef} />
                    </div>

                    {conversation.blockedByOwner || conversation.blockedByFinder ? (
                      <div className="p-4 bg-rose-50 border-t border-rose-200 text-xs font-medium text-rose-700 text-center">
                        This conversation has been blocked and can no longer receive messages.
                      </div>
                    ) : (
                      <form
                        onSubmit={handleStartOrSend}
                        className="p-4 bg-[#F8FAFC] border-t border-slate-200 flex items-center gap-2.5"
                      >
                        <input
                          type="text"
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          placeholder="Type a message to the owner..."
                          className="flex-1 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                        />
                        <button
                          type="submit"
                          disabled={sending || !messageInput.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send</span>
                        </button>
                      </form>
                    )}
                  </>
                ) : (
                  <form onSubmit={handleStartOrSend} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                        Your Name or Where You Found It (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={finderLabel}
                        onChange={(e) => setFinderLabel(e.target.value)}
                        placeholder="e.g. Sam · Found at Central Station Cafe"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                        Message to Owner
                      </label>
                      <textarea
                        required
                        rows={3}
                        maxLength={2000}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        placeholder="Let the owner know where you found the item and a safe public place or time to hand it back..."
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending || !messageInput.trim()}
                      className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      <span>{sending ? 'Sending...' : t('sendMessage')}</span>
                    </button>
                  </form>
                )}
              </section>
            )}

            {/* Safe Public Handover & Minor Safety Guidelines */}
            <section className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#101828]">
                <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0" />
                <span>{t('safetyHeadline')}</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600 leading-relaxed list-disc pl-5">
                <li>{t('safetyPoint1')}</li>
                <li>{t('safetyPoint2')}</li>
                <li className="font-semibold text-[#101828]">{t('safetyPoint3')}</li>
              </ul>
              <p className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                {t('privacyFooterNote')}
              </p>
            </section>
          </div>
        )}
      </main>

      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-[#101828]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReportAbuse}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-[#101828]">Report Abuse or Safety Issue</h3>
            {reportFeedback && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                {reportFeedback}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#101828] mb-1.5">Reason</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
              >
                <option value="Suspicious or inappropriate content">Suspicious or inappropriate content</option>
                <option value="Spam or commercial promotion">Spam or commercial promotion</option>
                <option value="Harassment or abusive messages">Harassment or abusive messages</option>
                <option value="Illegal or dangerous item">Illegal or dangerous item</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                Details (Optional)
              </label>
              <textarea
                rows={3}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Share any context..."
                className="w-full px-3 py-2 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
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
    </div>
  );
}
