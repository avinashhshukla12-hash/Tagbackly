import { useState } from 'react';
import { ArrowLeft, Globe, KeyRound, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { api, setStoredToken } from '../lib/api';
import { useLanguage } from '../lib/i18n';
import type { UserProfile } from '../types';

export type AuthMode = 'login' | 'signup' | 'forgot';

interface AuthViewProps {
  initialMode: AuthMode;
  onSuccess: (user: UserProfile) => void;
  onBackHome: () => void;
}

export function AuthView({ initialMode, onSuccess, onBackHome }: AuthViewProps) {
  const { lang, setLang, t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [codePreviewNotice, setCodePreviewNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setStatusMessage(null);
    setCodePreviewNotice(null);
    setResetStep('request');
  }

  async function handleLoginOrSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        const res = await api.signup({ fullName, email, password });
        setStoredToken(res.token);
        onSuccess(res.user);
      } else {
        const res = await api.login({ email, password });
        setStoredToken(res.token);
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setCodePreviewNotice(null);
    setSubmitting(true);

    try {
      const res = await api.forgotPassword(email);
      setStatusMessage(res.message);
      if (res.verificationCodePreview) {
        setCodePreviewNotice(
          `Verification code issued: ${res.verificationCodePreview} (valid ${res.expiresInMinutes ?? 15} min)`,
        );
      }
      setResetStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initiate password reset.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setSubmitting(true);

    try {
      const res = await api.resetPassword({
        email,
        code: resetCode,
        newPassword,
      });
      setMode('login');
      setPassword('');
      setResetCode('');
      setNewPassword('');
      setCodePreviewNotice(null);
      setStatusMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between px-4 py-8">
      <div className="max-w-md w-full mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#101828] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backToHome')}</span>
          </button>

          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            <Globe className="w-3.5 h-3.5 text-slate-400 mx-1.5" />
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2 py-1 rounded-lg transition-colors ${
                lang === 'en' ? 'bg-[#101828] text-white' : 'text-slate-600'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('hi')}
              className={`px-2 py-1 rounded-lg transition-colors ${
                lang === 'hi' ? 'bg-[#101828] text-white' : 'text-slate-600'
              }`}
            >
              हिं
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8">
          <div className="mb-6">
            <div className="font-display text-lg font-extrabold tracking-tight text-[#101828]">
              TAGBACKLY
            </div>
            <h1 className="font-display text-2xl font-bold text-[#101828] mt-3">
              {mode === 'login' && t('loginTitle')}
              {mode === 'signup' && t('signupTitle')}
              {mode === 'forgot' && t('forgotTitle')}
            </h1>
            <p className="text-sm text-slate-600 mt-1.5">
              {mode === 'login' && t('loginSub')}
              {mode === 'signup' && t('signupSub')}
              {mode === 'forgot' &&
                (resetStep === 'request' ? t('forgotRequestSub') : t('forgotConfirmSub'))}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          {statusMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              {statusMessage}
            </div>
          )}

          {codePreviewNotice && (
            <div className="mb-5 p-3.5 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 text-xs font-mono text-[#101828]">
              {codePreviewNotice}
            </div>
          )}

          {mode !== 'forgot' ? (
            <form onSubmit={handleLoginOrSignup} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                    {t('fullNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                  {t('emailLabel')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#101828]">
                    {t('passwordLabel')}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      {t('forgotPasswordLink')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
              >
                {mode === 'signup' ? <UserPlus className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                <span>
                  {submitting
                    ? 'Please wait...'
                    : mode === 'signup'
                      ? t('createAccountBtn')
                      : t('signInBtn')}
                </span>
              </button>
            </form>
          ) : resetStep === 'request' ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                  Account Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#101828] hover:bg-slate-800 disabled:opacity-60 rounded-xl transition-colors"
              >
                {submitting ? 'Sending code...' : t('sendResetCodeBtn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
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
                  placeholder="Minimum 8 characters"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
              >
                {submitting ? 'Updating...' : t('updatePasswordBtn')}
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200 text-center text-xs text-slate-600">
            {mode === 'login' && (
              <>
                New to TAGBACKLY?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-semibold text-[#2563EB] hover:underline"
                >
                  Create an account
                </button>
              </>
            )}
            {mode === 'signup' && (
              <>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-[#2563EB] hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-semibold text-[#2563EB] hover:underline"
              >
                Return to Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-8">
        TAGBACKLY · Lost things deserve a way back.
      </p>
    </div>
  );
}
