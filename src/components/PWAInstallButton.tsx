import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useLanguage } from '../lib/i18n';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { t } = useLanguage();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          className={`inline-flex items-center gap-1.5 font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t('installApp')}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={`inline-flex items-center gap-1.5 font-semibold text-[#101828] bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>{isIOS ? t('installOnIOS') : t('installApp')}</span>
        </button>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-50 bg-[#101828]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#101828]">
                {t('installTagbackly')}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 text-slate-400 hover:text-[#101828] rounded-lg"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-1.5">
                <div className="font-semibold text-[#101828] flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>{t('iosGuideTitle')}</span>
                </div>
                <p>{t('iosStep1')}</p>
                <p>{t('iosStep2')}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-1.5">
                <div className="font-semibold text-[#101828]">{t('androidGuideTitle')}</div>
                <p>{t('androidStep')}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 text-xs font-semibold text-white bg-[#101828] hover:bg-slate-800 rounded-xl"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
