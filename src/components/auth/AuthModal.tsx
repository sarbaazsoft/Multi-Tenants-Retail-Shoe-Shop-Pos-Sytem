import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Lock,
  Mail,
  User,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Store,
  ArrowRight,
  Database,
  Sun,
  Moon,
} from 'lucide-react';
import { api, setAuthToken } from '../../services/api.ts';
import { useTheme } from '../../context/ThemeContext.tsx';
import { ShowroomBackground } from '../common/ShowroomBackground.tsx';
import { PublicHeader } from '../common/PublicHeader.tsx';
import { PublicFooter } from '../common/PublicFooter.tsx';
import { useScrollActiveTab } from '../../hooks/useScrollActiveTab.ts';

interface AuthModalProps {
  onSuccess: (user: any) => void;
  companySettings: any;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onSuccess,
  companySettings,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [tab, setTab] = useState<'login' | 'forgot' | 'reset'>('login');
  const { containerRef: authTabContainerRef } = useScrollActiveTab<HTMLDivElement>(tab, {
    padding: 16,
    behavior: 'smooth',
  });

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const activeSlug = (companySettings?.slug || 'tj-shoes').trim().toLowerCase();

  const [storeCredentials, setStoreCredentials] = useState<{
    owner: { name: string; email: string; password: string; role: string };
    cashier: { name: string; email: string; password: string; role: string };
  } | null>(null);

  // Hidden by default for a few ms, then fades in smoothly
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEmail('');
    setPassword('');
    setErrorMessage(null);
    setInfoMessage(null);

    api.auth
      .getStoreCredentials(activeSlug)
      .then((res) => {
        if (!cancelled && res?.owner && res?.cashier) {
          setStoreCredentials({
            owner: res.owner,
            cashier: res.cashier,
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const storeName =
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    'Shoe Shop POS & Inventory';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.auth.login({ email, password, tenantSlug: activeSlug });
      setAuthToken(res.token);
      onSuccess(res.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = async (roleType: 'owner' | 'cashier' | 'superadmin') => {
    setErrorMessage(null);
    setInfoMessage(null);
    if (roleType === 'superadmin') {
      setEmail('superadmin@mypos.com');
      setPassword('superadmin123');
      return;
    }
    let creds = storeCredentials;
    if (!creds) {
      try {
        const res = await api.auth.getStoreCredentials(activeSlug);
        if (res?.owner && res?.cashier) {
          creds = { owner: res.owner, cashier: res.cashier };
          setStoreCredentials(creds);
        }
      } catch {}
    }

    if (roleType === 'owner') {
      const ownerEmail =
        creds?.owner?.email ||
        (activeSlug === 'tj-shoes'
          ? 'owner@shoepos.com'
          : activeSlug === 'mystore'
          ? 'admin@mystore.com'
          : activeSlug === 'apex-boots'
          ? 'admin@apexboots.pk'
          : companySettings?.email || `admin@${activeSlug}.mypos.com`);
      const ownerPassword =
        creds?.owner?.password ||
        (activeSlug === 'tj-shoes' || activeSlug === 'mystore' || activeSlug === 'apex-boots'
          ? 'admin123'
          : `${activeSlug}@2026`);
      setEmail(ownerEmail);
      setPassword(ownerPassword);
    } else {
      const cashierEmail =
        creds?.cashier?.email ||
        (activeSlug === 'tj-shoes'
          ? 'cashier@shoepos.com'
          : activeSlug === 'mystore'
          ? 'cashier@mystore.com'
          : activeSlug === 'apex-boots'
          ? 'cashier@apexboots.pk'
          : `cashier@${activeSlug}.mypos.com`);
      const cashierPassword =
        creds?.cashier?.password ||
        (activeSlug === 'tj-shoes' || activeSlug === 'mystore' || activeSlug === 'apex-boots'
          ? 'cashier123'
          : `${activeSlug}@cashier`);
      setEmail(cashierEmail);
      setPassword(cashierPassword);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.auth.forgotPassword({ email });
      setInfoMessage(`Password reset token generated: ${res.resetToken}`);
      setResetToken(res.resetToken);
      setTab('reset');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to request reset token.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await api.auth.resetPassword({ email, token: resetToken, newPassword });
      setInfoMessage('Password has been reset successfully! You can now log in.');
      setTab('login');
      setPassword(newPassword);
    } catch (err: any) {
      setErrorMessage(err.message || 'Password reset failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-900 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans selection:bg-purple-600 selection:text-white transition-colors duration-200">
      {/* Showroom Background Image Layer (80% visible / opacity-80) */}
      <ShowroomBackground />

      {/* Top Application Bar with backdrop blur */}
      <PublicHeader storeName={storeName} />

      {/* Main Content Area - Centered Login Form Card */}
      <main className="relative z-10 w-full flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="w-full"
          >
            <div className="app-card bg-white/95 dark:bg-gradient-to-b dark:from-slate-900/95 dark:via-indigo-950/90 dark:to-slate-900/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 shadow-2xl shadow-purple-950/10 dark:shadow-[0_10px_35px_rgba(15,23,42,0.8),0_0_25px_rgba(147,51,234,0.2)] rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-slate-800 dark:text-slate-100 transition-colors">
              {/* Store Icon Header */}
              <div className="text-center mb-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-600/30 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 dark:border-purple-400/50">
                  <Store className="w-6 h-6" />
                </div>
                <h2 id="auth-store-name" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {storeName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-1 font-medium">
                  Authorized Personnel Counter Terminal &bull; POS Access
                </p>
              </div>

              {/* Card Tabs Navigation - Responsive Scrollable Underline Navigation */}
              <div 
                ref={authTabContainerRef}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                className="flex items-center justify-between border-b border-slate-200/80 dark:border-purple-900/60 mb-6 overflow-x-auto no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden"
              >
                <button
                  id="auth-tab-login"
                  type="button"
                  data-active={tab === 'login'}
                  data-tab="login"
                  onClick={() => {
                    setTab('login');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                    tab === 'login'
                      ? 'active text-purple-600 dark:text-purple-400 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                  }`}
                >
                  <Fingerprint className={`w-4 h-4 transition-colors duration-200 ${tab === 'login' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span>Sign In</span>
                  {tab === 'login' && (
                    <motion.div
                      layoutId="authActiveUnderline"
                      className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </button>

                <button
                  id="auth-tab-forgot"
                  type="button"
                  data-active={tab === 'forgot' || tab === 'reset'}
                  data-tab="forgot"
                  onClick={() => {
                    setTab('forgot');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                    tab === 'forgot' || tab === 'reset'
                      ? 'active text-purple-600 dark:text-purple-400 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                  }`}
                >
                  <KeyRound className={`w-4 h-4 transition-colors duration-200 ${tab === 'forgot' || tab === 'reset' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span>Reset PIN</span>
                  {(tab === 'forgot' || tab === 'reset') && (
                    <motion.div
                      layoutId="authActiveUnderline"
                      className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </button>

                {/* Scroll End Buffer Spacer: Ensures the last tab is 100% visible and never clipped */}
                <div className="tab-end-spacer shrink-0 w-6 sm:w-8 h-1 pointer-events-none self-stretch" aria-hidden="true" role="presentation" />
              </div>

              {/* Dynamic Header */}
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {tab === 'login' && 'Sign in to Terminal'}
                  {tab === 'forgot' && 'Reset Terminal PIN / Password'}
                  {tab === 'reset' && 'Create New Password'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5">
                  {tab === 'login' && 'Enter your authorized email and password to access POS operations.'}
                  {tab === 'forgot' && 'Provide your registered email to receive an instant recovery code.'}
                  {tab === 'reset' && 'Enter your reset verification token and choose a new password.'}
                </p>
              </div>

              {/* Alerts */}
              {errorMessage && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>
              )}

              {infoMessage && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{infoMessage}</span>
                </div>
              )}

              {/* TAB 1: LOGIN FORM */}
              {tab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Email or Terminal ID
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="login-email-input"
                        type="email"
                        required
                        placeholder="admin@shoepos.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-4 transition outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Counter PIN / Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setTab('forgot');
                          setErrorMessage(null);
                        }}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200 transition cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="login-password-input"
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-sans py-2.5 pl-[2.125rem] pr-9 transition outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600 dark:text-purple-200/80 font-medium">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-purple-300 dark:border-purple-600 dark:bg-[#0E1628] text-purple-600 accent-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Keep logged in</span>
                    </label>
                    <span className="text-[11px] text-slate-400 dark:text-purple-300/60 font-mono">
                      JWT Auth &bull; PBKDF2
                    </span>
                  </div>

                  <button
                    id="login-submit-btn"
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)] font-bold text-xs sm:text-sm transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying Credentials...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Terminal</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* Quick Multi-Tenant Store Credentials Helper */}
                  <div className="pt-3 border-t border-slate-200/80 dark:border-purple-900/50 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-purple-200/70 font-mono font-semibold">
                        Quick Store Login ({activeSlug}):
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-purple-300/60 font-mono">
                        1-Click Fill
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        id="quick-fill-owner-btn"
                        type="button"
                        onClick={() => handleQuickFill('owner')}
                        className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-900/40 dark:hover:bg-purple-800/60 border border-purple-200/80 dark:border-purple-700/60 text-left transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-purple-800 dark:text-purple-200 text-[11px]">
                            Store Owner
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-200/70 dark:bg-purple-800 text-purple-900 dark:text-purple-100 font-mono font-bold">
                            ADMIN
                          </span>
                        </div>
                        <div className="text-[10px] text-purple-700/80 dark:text-purple-300/80 font-mono truncate mt-0.5">
                          {storeCredentials?.owner?.email ||
                            (activeSlug === 'tj-shoes'
                              ? 'owner@shoepos.com'
                              : activeSlug === 'mystore'
                              ? 'admin@mystore.com'
                              : activeSlug === 'apex-boots'
                              ? 'admin@apexboots.pk'
                              : `admin@${activeSlug}.mypos.com`)}
                        </div>
                      </button>

                      <button
                        id="quick-fill-cashier-btn"
                        type="button"
                        onClick={() => handleQuickFill('cashier')}
                        className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-700/80 border border-slate-200/90 dark:border-slate-700 text-left transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                            Store Cashier
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono font-bold">
                            CASHIER
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                          {storeCredentials?.cashier?.email ||
                            (activeSlug === 'tj-shoes'
                              ? 'cashier@shoepos.com'
                              : activeSlug === 'mystore'
                              ? 'cashier@mystore.com'
                              : activeSlug === 'apex-boots'
                              ? 'cashier@apexboots.pk'
                              : `cashier@${activeSlug}.mypos.com`)}
                        </div>
                      </button>
                    </div>

                    <button
                      id="quick-fill-superadmin-btn"
                      type="button"
                      onClick={() => handleQuickFill('superadmin')}
                      className="w-full px-3 py-2 rounded-xl bg-amber-50/90 hover:bg-amber-100/90 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2 text-left transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-amber-900 dark:text-amber-200 text-[11px] whitespace-nowrap">
                          Platform SuperAdmin
                        </span>
                        <span className="text-[10px] text-amber-700 dark:text-amber-300/80 font-mono truncate">
                          superadmin@mypos.com
                        </span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200/80 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-mono font-bold shrink-0">
                        SUPERADMIN
                      </span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: FORGOT PASSWORD FORM */}
              {tab === 'forgot' && (
                <form onSubmit={handleForgot} className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 leading-relaxed font-medium">
                    Enter the email address registered with your terminal account. A one-time verification token will be generated to reset your credentials.
                  </p>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Account Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="admin@shoepos.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-4 transition outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        setErrorMessage(null);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isLoading ? 'Requesting Token...' : 'Generate Reset Token'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: RESET PASSWORD FORM */}
              {tab === 'reset' && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Verification Reset Token
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="e.g. 7F3A9C12"
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white font-mono uppercase text-xs sm:text-sm rounded-xl py-2.5 pl-[2.125rem] pr-3 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        placeholder="Enter new password (min 6 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white text-xs sm:text-sm rounded-xl py-2.5 pl-[2.125rem] pr-3 outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        setErrorMessage(null);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isLoading ? 'Updating...' : 'Set Password & Sign In'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Global Public Footer */}
      <PublicFooter storeName={storeName} />
    </div>
  );
};

