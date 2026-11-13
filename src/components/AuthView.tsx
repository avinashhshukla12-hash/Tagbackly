import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Info,
  KeyRound,
  Phone,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { api, setStoredToken } from '../lib/api';
import { useLanguage } from '../lib/i18n';
import type { UserProfile } from '../types';

export type AuthMode = 'login' | 'signup' | 'forgot';

interface AuthViewProps {
  initialMode: AuthMode;
  onSuccess: (user: UserProfile) => void;
  onBackHome: () => void;
}

function sanitizeTenDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }
  return digits.slice(0, 10);
}

export function AuthView({ initialMode, onSuccess, onBackHome }: AuthViewProps) {
  const { lang, setLang, t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [mobileDigits, setMobileDigits] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [codePreviewNotice, setCodePreviewNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isPhoneValid = mobileDigits.length === 10;
  const signupPasswordsMatch =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const signupPasswordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const resetPasswordsMatch =
    newPassword.length > 0 &&
    confirmNewPassword.length > 0 &&
    newPassword === confirmNewPassword;
  const resetPasswordsMismatch =
    confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setStatusMessage(null);
    setCodePreviewNotice(null);
    setResetStep('request');
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setResetCode('');
  }

  async function handleLoginOrSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    if (!isPhoneValid) {
      setError('Please enter a valid 10-digit +91 mobile number.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Password and Confirm Password do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const normalizedPhone = `+91${mobileDigits}`;
      if (mode === 'signup') {
        const res = await api.signup({
          fullName,
          phone: normalizedPhone,
          password,
          confirmPassword,
        });
        setStoredToken(res.token);
        onSuccess(res.user);
      } else {
        const res = await api.login({ phone: normalizedPhone, password });
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

    if (!isPhoneValid) {
      setError('Please enter a valid 10-digit +91 mobile number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.forgotPassword(`+91${mobileDigits}`);
      setStatusMessage(res.message);
      if (res.verificationCodePreview) {
        setCodePreviewNotice(
          `Server verification code: ${res.verificationCodePreview} (valid ${res.expiresInMinutes ?? 15} min)`,
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

    if (!isPhoneValid) {
      setError('Please enter a valid 10-digit +91 mobile number.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New Password and Confirm Password do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.resetPassword({
        phone: `+91${mobileDigits}`,
        code: resetCode.trim(),
        newPassword,
        confirmPassword: confirmNewPassword,
      });
      setMode('login');
      setPassword('');
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setCodePreviewNotice(null);
      setStatusMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function renderMobileInput() {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold text-[#101828]">
            {t('mobileNumberLabel')}
          </label>
          <span
            className={`font-mono text-[11px] tabular-nums ${
              isPhoneValid ? 'text-emerald-600 font-semibold' : 'text-slate-400'
            }`}
          >
            {mobileDigits.length}/10
          </span>
        </div>
        <div className="flex items-center bg-[#F8FAFC] border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#2563EB]/25 focus-within:border-[#2563EB]">
          <div className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 border-r border-slate-200 text-xs font-mono font-bold text-[#101828] shrink-0">
            <Phone className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>+91</span>
          </div>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            maxLength={10}
            value={mobileDigits}
            onChange={(e) => setMobileDigits(sanitizeTenDigits(e.target.value))}
            placeholder={t('mobileNumberPlaceholder')}
            className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-transparent focus:outline-none text-[#101828]"
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">{t('mobileDigitsHint')}</p>
      </div>
    );
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
                    placeholder="Aarav Sharma"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                  />
                </div>
              )}

              {renderMobileInput()}

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
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'}
                    className="w-full pl-10 pr-10 py-2.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                    {t('confirmPasswordInputLabel')}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className={`w-full pl-10 pr-10 py-2.5 text-sm bg-[#F8FAFC] border rounded-xl focus:outline-none focus:ring-2 ${
                        signupPasswordsMismatch
                          ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                          : signupPasswordsMatch
                            ? 'border-emerald-400 focus:ring-emerald-500/20 focus:border-emerald-500'
                            : 'border-slate-200 focus:ring-[#2563EB]/25 focus:border-[#2563EB]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {signupPasswordsMismatch && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-rose-600">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('passwordsMismatchLabel')}</span>
                    </p>
                  )}
                  {signupPasswordsMatch && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('passwordsMatchLabel')}</span>
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  !isPhoneValid ||
                  (mode === 'signup' && (password.length < 8 || password !== confirmPassword))
                }
                className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                {mode === 'signup' ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
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
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2 leading-relaxed">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{t('smsOtpUnavailableNotice')}</span>
              </div>

              {renderMobileInput()}

              <button
                type="submit"
                disabled={submitting || !isPhoneValid}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#101828] hover:bg-slate-800 disabled:opacity-50 rounded-xl transition-colors"
              >
                {submitting ? 'Generating code...' : t('sendResetCodeBtn')}
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
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                  {t('newPasswordLabel')}
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

              <div>
                <label className="block text-xs font-semibold text-[#101828] mb-1.5">
                  {t('confirmNewPasswordLabel')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className={`w-full px-3.5 py-2.5 text-sm bg-[#F8FAFC] border rounded-xl focus:outline-none focus:ring-2 ${
                    resetPasswordsMismatch
                      ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                      : resetPasswordsMatch
                        ? 'border-emerald-400 focus:ring-emerald-500/20 focus:border-emerald-500'
                        : 'border-slate-200 focus:ring-[#2563EB]/25 focus:border-[#2563EB]'
                  }`}
                />
                {resetPasswordsMismatch && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-rose-600">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('passwordsMismatchLabel')}</span>
                  </p>
                )}
                {resetPasswordsMatch && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('passwordsMatchLabel')}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  submitting ||
                  resetCode.length !== 6 ||
                  newPassword.length < 8 ||
                  newPassword !== confirmNewPassword
                }
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
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
