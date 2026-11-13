import { AlertTriangle, CheckCircle2, Eye, MessageSquare, ShieldCheck } from 'lucide-react';
import type { ItemStatus } from '../types';

const STATUS_META: Record<
  ItemStatus,
  { label: string; textClass: string; Icon: typeof ShieldCheck }
> = {
  SAFE: {
    label: 'SAFE',
    textClass: 'text-[#2563EB]',
    Icon: ShieldCheck,
  },
  LOST: {
    label: 'LOST',
    textClass: 'text-rose-600',
    Icon: AlertTriangle,
  },
  FOUND: {
    label: 'FOUND',
    textClass: 'text-amber-600',
    Icon: Eye,
  },
  CHATTING: {
    label: 'CHATTING',
    textClass: 'text-[#8B5CF6]',
    Icon: MessageSquare,
  },
  RETURNED: {
    label: 'RETURNED',
    textClass: 'text-emerald-600',
    Icon: CheckCircle2,
  },
};

export function StatusIndicator({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.SAFE;
  const Icon = meta.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${meta.textClass} whitespace-nowrap shrink-0`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
