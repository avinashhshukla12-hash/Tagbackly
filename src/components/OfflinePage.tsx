import { RefreshCw, WifiOff } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

export function OfflinePage({ onRetry }: { onRetry?: () => void }) {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-10">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[#101828] flex items-center justify-center mx-auto">
          <WifiOff className="w-6 h-6" />
        </div>
        <div className="font-display text-sm font-extrabold tracking-tight text-[#101828]">
          TAGBACKLY
        </div>
        <h1 className="font-display text-xl font-bold text-[#101828]">{t('offlineTitle')}</h1>
        <p className="text-sm text-slate-600 leading-relaxed">{t('offlineDesc')}</p>
        <button
          type="button"
          onClick={onRetry ?? (() => window.location.reload())}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{t('retryConnection')}</span>
        </button>
      </div>
    </div>
  );
}
