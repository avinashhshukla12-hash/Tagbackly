import { useState } from 'react';
import { ArrowRight, Camera, Globe, Lock, QrCode, Search, ShieldCheck, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useLanguage } from '../lib/i18n';
import { ITEM_CATEGORIES } from '../types';
import { LandingVisual } from './LandingVisuals';
import { PWAInstallButton } from './PWAInstallButton';
import { QrScannerModal } from './QrScannerModal';

interface LandingPageProps {
  isAuthenticated: boolean;
  onGoAuth: (mode: 'login' | 'signup') => void;
  onGoDashboard: () => void;
  onOpenTagSlug: (slug: string) => void;
}

export function LandingPage({
  isAuthenticated,
  onGoAuth,
  onGoDashboard,
  onOpenTagSlug,
}: LandingPageProps) {
  const { lang, setLang, t } = useLanguage();
  const [lookupSlug, setLookupSlug] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);

  function handleLookupSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = lookupSlug.trim();
    if (!trimmed) {
      setLookupError('Enter a tag code or paste a TAGBACKLY URL.');
      return;
    }
    const extracted = trimmed.includes('/t/')
      ? trimmed.split('/t/').pop()?.split(/[?#]/)[0] || ''
      : trimmed;
    if (!extracted) {
      setLookupError('Could not recognize that tag code.');
      return;
    }
    setLookupError(null);
    onOpenTagSlug(extracted);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#101828]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#F8FAFC]/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-extrabold tracking-tight text-[#101828] whitespace-nowrap shrink-0 font-display"
          >
            TAGBACKLY
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#how-it-works"
              className="hover:text-[#101828] transition-colors whitespace-nowrap shrink-0"
            >
              {t('howItWorks')}
            </a>
            <a
              href="#categories"
              className="hover:text-[#101828] transition-colors whitespace-nowrap shrink-0"
            >
              {t('categories')}
            </a>
            <a
              href="#privacy"
              className="hover:text-[#101828] transition-colors whitespace-nowrap shrink-0"
            >
              {t('privacy')}
            </a>
            <a
              href="#scan-lookup"
              className="hover:text-[#101828] transition-colors whitespace-nowrap shrink-0"
            >
              {t('scanTag')}
            </a>
          </nav>

          <div className="shrink-0">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onGoDashboard}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#101828] hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                {t('openDashboard')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onGoAuth('login')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                {t('ownerSignIn')}
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split Section */}
        <section className="max-w-[1200px] mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 flex flex-col justify-center"
            >
              <p className="text-sm font-semibold text-[#2563EB] tracking-tight mb-3">
                {t('tagline')}
              </p>
              <h1
                className="font-display font-extrabold tracking-tight text-[#101828] leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)', textWrap: 'balance' }}
              >
                {t('brandMessage')}
              </h1>
              <p className="mt-5 text-base md:text-lg text-slate-600 leading-relaxed max-w-xl">
                {t('heroDescription')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={onGoDashboard}
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
                  >
                    <span>{t('goToOwnerDashboard')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onGoAuth('signup')}
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
                  >
                    <span>{t('createFreeAccount')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#101828] bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Camera className="w-4 h-4 text-[#2563EB]" />
                  <span>{t('scanQrTag')}</span>
                </button>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <PWAInstallButton compact />
                <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                  <Globe className="w-3.5 h-3.5 text-slate-400 mx-2" />
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      lang === 'en' ? 'bg-[#101828] text-white' : 'text-slate-600 hover:text-[#101828]'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('hi')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      lang === 'hi' ? 'bg-[#101828] text-white' : 'text-slate-600 hover:text-[#101828]'
                    }`}
                  >
                    हिं
                  </button>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
                <span>Browser-native QR scan</span>
                <span aria-hidden="true">·</span>
                <span>Zero app install for finders</span>
                <span aria-hidden="true">·</span>
                <span>Private contact relay</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6"
            >
              <div className="relative h-full min-h-[300px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-slate-200 bg-[#101828]">
                <LandingVisual variant="hero" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#101828]/85 via-[#101828]/35 to-transparent p-6">
                  <p className="text-xs font-medium text-slate-200">
                    Unique QR recovery tags for wallets, bags, electronics, keys, and documents.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-t border-slate-200 bg-white py-20">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="max-w-2xl mb-14">
              <p className="text-xs font-semibold text-[#2563EB] mb-2">{t('workflowLabel')}</p>
              <h2
                className="font-display font-bold tracking-tight text-[#101828] text-3xl md:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                {t('workflowHeading')}
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-6 border border-slate-200 rounded-2xl overflow-hidden bg-[#F8FAFC] flex flex-col">
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <LandingVisual variant="step1" />
                </div>
                <div className="p-7 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-[#101828] font-display">
                      {t('step1Title')}
                    </h3>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                      {t('step1Desc')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 grid grid-cols-1 gap-8">
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-[#F8FAFC] grid grid-cols-1 sm:grid-cols-5">
                  <div className="sm:col-span-2 aspect-[4/3] sm:aspect-auto bg-slate-100">
                    <LandingVisual variant="step2" />
                  </div>
                  <div className="sm:col-span-3 p-6 flex flex-col justify-center">
                    <h3 className="text-lg font-bold text-[#101828] font-display">
                      {t('step2Title')}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                      {t('step2Desc')}
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-[#F8FAFC] grid grid-cols-1 sm:grid-cols-5">
                  <div className="sm:col-span-2 aspect-[4/3] sm:aspect-auto bg-slate-100">
                    <LandingVisual variant="step3" />
                  </div>
                  <div className="sm:col-span-3 p-6 flex flex-col justify-center">
                    <h3 className="text-lg font-bold text-[#101828] font-display">
                      {t('step3Title')}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                      {t('step3Desc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Supported Categories */}
        <section id="categories" className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold text-[#8B5CF6] mb-2">{t('coverageLabel')}</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#101828]">
                {t('coverageHeading')}
              </h2>
              <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                {t('coverageDesc')}
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ITEM_CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-center min-h-[72px]"
                >
                  <span className="text-sm font-semibold text-[#101828]">{category}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy Section */}
        <section id="privacy" className="bg-[#101828] text-[#F8FAFC] py-20">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7">
                <p className="text-xs font-semibold text-[#8B5CF6] mb-2">{t('privacyLabel')}</p>
                <h2
                  className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white"
                  style={{ textWrap: 'balance' }}
                >
                  {t('privacyHeading')}
                </h2>
                <p className="mt-4 text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl">
                  {t('privacyDesc')}
                </p>
              </div>
              <div className="lg:col-span-5 grid grid-cols-1 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-start gap-4">
                  <Lock className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">Opaque QR Identifiers</h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Every QR link uses a randomized tag slug containing zero personal identifiers.
                    </p>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-start gap-4">
                  <ShieldCheck className="w-5 h-5 text-[#8B5CF6] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">One-Click Block & Abuse Reporting</h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Both owners and finders can block unwanted contacts or report abuse anytime.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Direct Tag Lookup & In-App Scanner */}
        <section id="scan-lookup" className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 md:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2563EB] mb-2">
                <QrCode className="w-4 h-4" />
                <span>{t('lookupPrompt')}</span>
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-[#101828]">
                {t('lookupHeading')}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Use your phone’s normal camera, launch the built-in browser QR scanner, or enter the
                tag ID printed beneath the label (e.g. <span className="font-mono text-[#101828]">tb-4f91a2...</span>).
              </p>
            </div>
            <div className="lg:col-span-6 space-y-3">
              <form onSubmit={handleLookupSubmit} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={lookupSlug}
                    onChange={(e) => setLookupSlug(e.target.value)}
                    placeholder={t('lookupPlaceholder')}
                    className="w-full pl-10 pr-4 py-3 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-3 text-sm font-semibold text-white bg-[#101828] hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  {t('openTag')}
                </button>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[#2563EB] bg-[#2563EB]/10 hover:bg-[#2563EB]/15 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <Camera className="w-4 h-4" />
                  <span>{t('scanCamera')}</span>
                </button>
              </form>
              {lookupError && <p className="text-xs text-rose-600">{lookupError}</p>}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-sm font-semibold text-[#101828] font-display">
            TAGBACKLY <span className="font-normal text-slate-500">· {t('tagline')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setSafetyModalOpen(true)}
              className="font-semibold text-[#2563EB] hover:underline"
            >
              {t('safetyHeadline')}
            </button>
            <span>{t('brandMessage')}</span>
          </div>
        </div>
      </footer>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onMatchSlug={onOpenTagSlug}
      />

      {safetyModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#101828]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                <h3 className="font-display text-base font-bold text-[#101828]">
                  {t('safetyHeadline')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSafetyModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-[#101828] rounded-lg"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed list-disc pl-4">
              <li>{t('safetyPoint1')}</li>
              <li>{t('safetyPoint2')}</li>
              <li className="font-semibold text-[#101828]">{t('safetyPoint3')}</li>
              <li>{t('safetyPoint4')}</li>
            </ul>
            <button
              type="button"
              onClick={() => setSafetyModalOpen(false)}
              className="w-full py-2.5 text-xs font-semibold text-white bg-[#101828] hover:bg-slate-800 rounded-xl"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
