import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  Store,
  CheckCircle2,
  XCircle,
  Power,
  Plus,
  RefreshCw,
  ExternalLink,
  Wand2,
  Lock,
  LogOut,
  TrendingUp,
  Package,
  Clock,
  KeyRound,
  FileCode2,
  Mail,
  AlertCircle,
  Eye,
  EyeOff,
  Fingerprint,
  ArrowRight,
  LayoutDashboard,
  Search,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Database,
  Keyboard,
  Calendar,
  Check,
  Sparkles,
  Globe,
  Download,
  Trash2,
  RotateCcw,
  Copy,
} from 'lucide-react';
import { api, setAuthSession } from '../../services/api';
import { ShowroomBackground } from '../common/ShowroomBackground';
import { PublicHeader } from '../common/PublicHeader';
import { PublicFooter } from '../common/PublicFooter';
import { UserAvatar } from '../common/UserAvatar';
import { ThemeDropdown } from '../common/ThemeDropdown';
import { StatCard, triggerStatRecount } from '../common/StatCard';
import { useTheme } from '../../context/ThemeContext';
import { toTitleCaseLive, toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat';
import type { SuperAdminStoreRow, StoreRequestRecord, User } from '../../types';

interface SuperAdminControlPanelProps {
  currentUser: User | null;
  onUserAuthenticated: (user: User, token: string) => void;
  onLogout: () => void;
  onOpenStore: (slug: string) => void;
  onOpenOnboarding: (slug: string) => void;
  onTenantsUpdated: () => void;
}

type SuperAdminTab = 'dashboard' | 'stores' | 'requests' | 'revenue' | 'manifests';

export const SuperAdminControlPanel: React.FC<SuperAdminControlPanelProps> = ({
  currentUser,
  onUserAuthenticated,
  onLogout,
  onOpenStore,
  onOpenOnboarding,
  onTenantsUpdated,
}) => {
  const { theme, toggleTheme } = useTheme();
  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';

  // Login / Reset form state when not authenticated as SUPERADMIN
  const [authTab, setAuthTab] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('superadmin@mypos.com');
  const [password, setPassword] = useState('superadmin123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Dashboard Layout & Sidebar State (aligned with Store Sidebar & Header)
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED'>('ALL');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('superadmin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('superadmin_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Control panel state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    totalStores: 0,
    activeStores: 0,
    suspendedStores: 0,
    pendingRequests: 0,
    totalPlatformRevenue: 0,
    totalPlatformProducts: 0,
  });
  const [stores, setStores] = useState<SuperAdminStoreRow[]>([]);
  const [storeRequests, setStoreRequests] = useState<StoreRequestRecord[]>([]);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [exportingStoreId, setExportingStoreId] = useState<number | null>(null);
  const [exportingPlatform, setExportingPlatform] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<SuperAdminStoreRow | null>(null);
  const [deletingStore, setDeletingStore] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Newly provisioned credentials banner
  const [provisionedBanner, setProvisionedBanner] = useState<{
    storeName: string;
    slug: string;
    subdomain: string;
    adminEmail: string;
    initialPassword: string;
    appKey?: string;
    subscriptionPlan?: string;
    subscriptionStartDate?: string;
    subscriptionEndDate?: string;
    subscriptionStatus?: string;
    onboardingUrl: string;
    manifestUrl: string;
  } | null>(null);

  // Create Store Modal (Store Name, Owner Name, Owner Email, Password, Subdomain Slug, Subscription Plan)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [newSubscriptionPlan, setNewSubscriptionPlan] = useState<'6_MONTHS' | 'YEARLY'>('YEARLY');
  const [showNewOwnerPassword, setShowNewOwnerPassword] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);

  // Edit Store Subscription & App Key Modal
  const [storeToEditSub, setStoreToEditSub] = useState<SuperAdminStoreRow | null>(null);
  const [editSubPlan, setEditSubPlan] = useState<'6_MONTHS' | 'YEARLY'>('YEARLY');
  const [editSubEndDate, setEditSubEndDate] = useState<string>('');
  const [editSubStatus, setEditSubStatus] = useState<'ACTIVE' | 'EXPIRED' | 'SUSPENDED'>('ACTIVE');
  const [savingSub, setSavingSub] = useState(false);
  const [regeneratingKeyId, setRegeneratingKeyId] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.superAdmin.getOverview();
      if (data.metrics) setMetrics(data.metrics);
      if (Array.isArray(data.stores)) setStores(data.stores);
      if (Array.isArray(data.storeRequests)) setStoreRequests(data.storeRequests);
    } catch (err: any) {
      setError(err.message || 'Failed to load SuperAdmin overview.');
    } finally {
      setLoading(false);
      triggerStatRecount();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadOverview();
    }
  }, [isSuperAdmin, loadOverview]);

  // Keyboard shortcuts (Ctrl+B to toggle sidebar, F1-F5 for tabs)
  useEffect(() => {
    if (!isSuperAdmin) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapse();
        return;
      }
      if (['F1', 'F2', 'F3', 'F4', 'F5'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'F1') setActiveTab('stores');
        if (e.key === 'F2') setActiveTab('requests');
        if (e.key === 'F3') setCreateModalOpen(true);
        if (e.key === 'F4') setActiveTab('revenue');
        if (e.key === 'F5') setActiveTab('manifests');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSuperAdmin, toggleCollapse]);

  const handleSuperAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setAuthLoading(true);
    try {
      const res = await api.auth.login({
        email,
        password,
        tenantSlug: 'admin',
      });
      if (res.user?.role !== 'SUPERADMIN') {
        throw new Error('Access denied: This account does not have SUPERADMIN privileges.');
      }
      setAuthSession(res.token, res.user);
      onUserAuthenticated(res.user, res.token);
    } catch (err: any) {
      setAuthError(err.message || 'SuperAdmin login failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSuperAdminForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const res = await api.auth.forgotPassword({ email });
      setAuthInfo(`Password reset token generated: ${res.resetToken}`);
      setResetToken(res.resetToken);
      setAuthTab('reset');
    } catch (err: any) {
      setAuthError(err.message || 'Failed to request reset token.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSuperAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      await api.auth.resetPassword({ email, token: resetToken, newPassword });
      setAuthInfo('SuperAdmin password has been reset successfully! You can now sign in.');
      setAuthTab('login');
      setPassword(newPassword);
    } catch (err: any) {
      setAuthError(err.message || 'Password reset failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const triggerSqlDownload = (filename: string, sqlContent: string) => {
    const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `store-backup-${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleToggleStoreStatus = async (store: SuperAdminStoreRow) => {
    const nextStatus = store.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setTogglingId(store.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.toggleTenantStatus(store.id, nextStatus);
      setSuccessMessage(
        res.message ||
          `Store '${store.name}' (${store.subdomain}) is now ${nextStatus}.`
      );
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle tenant status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleExportStoreSql = async (store: SuperAdminStoreRow) => {
    setExportingStoreId(store.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.exportTenantSql(store.id);
      triggerSqlDownload(res.filename, res.sql);
      setSuccessMessage(
        `Exported SQL backup '${res.filename}' for ${store.name} (${res.totalRows} database rows).`
      );
    } catch (err: any) {
      setError(err.message || `Failed to export SQL for store '${store.name}'.`);
    } finally {
      setExportingStoreId(null);
    }
  };

  const handleExportPlatformSql = async () => {
    setExportingPlatform(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.exportPlatformSql();
      triggerSqlDownload(res.filename, res.sql);
      setSuccessMessage(
        `Exported complete platform SQL backup '${res.filename}' (${res.totalRows} total rows across all stores).`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to export platform SQL backup.');
    } finally {
      setExportingPlatform(false);
    }
  };

  const handleConfirmDeleteStore = async () => {
    if (!storeToDelete) return;
    const targetStore = storeToDelete;
    setDeletingStore(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.deleteTenant(targetStore.id);
      const msg =
        res.message || `Store '${targetStore.name}' (${targetStore.subdomain}) has been permanently deleted.`;
      setStores((prev) => prev.filter((s) => s.id !== targetStore.id));
      setStoreToDelete(null);
      setSuccessMessage(msg);
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete store tenant.');
    } finally {
      setDeletingStore(false);
    }
  };

  const handleApproveRequest = async (reqItem: StoreRequestRecord) => {
    setApprovingId(reqItem.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.approveRequest(reqItem.id);
      if (res.provisioned) {
        setProvisionedBanner(res.provisioned);
      }
      setSuccessMessage(
        res.message ||
          ((reqItem as any).request_type === 'RENEWAL'
            ? `Approved subscription renewal for '${reqItem.store_name}' (${reqItem.requested_slug}.mypos.com).`
            : `Approved & provisioned store '${reqItem.store_name}' (${reqItem.requested_slug}.mypos.com).`)
      );
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to approve store request.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectRequest = async (reqItem: StoreRequestRecord) => {
    setUpdatingRequestId(reqItem.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.superAdmin.rejectRequest(reqItem.id);
      setSuccessMessage(`Store request '${reqItem.store_name}' marked as REJECTED.`);
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to reject store request.');
    } finally {
      setUpdatingRequestId(null);
    }
  };

  const handleReopenRequest = async (reqItem: StoreRequestRecord) => {
    setUpdatingRequestId(reqItem.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.superAdmin.updateRequest(reqItem.id, { status: 'PENDING' });
      setSuccessMessage(`Store request '${reqItem.store_name}' reopened as PENDING.`);
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to reopen store request.');
    } finally {
      setUpdatingRequestId(null);
    }
  };

  const handleDeleteRequest = async (reqItem: StoreRequestRecord) => {
    setDeletingRequestId(reqItem.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.superAdmin.deleteRequest(reqItem.id);
      setStoreRequests((prev) =>
        prev.filter(
          (r) =>
            r.id !== reqItem.id &&
            !(
              r.requested_slug?.toLowerCase() === reqItem.requested_slug?.toLowerCase() &&
              r.store_name?.toLowerCase() === reqItem.store_name?.toLowerCase()
            )
        )
      );
      setMetrics((prev) => ({
        ...prev,
        pendingRequests:
          reqItem.status === 'PENDING' ? Math.max(0, prev.pendingRequests - 1) : prev.pendingRequests,
      }));
      setSuccessMessage(`Store request for '${reqItem.store_name}' permanently deleted.`);
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete store request.');
    } finally {
      setDeletingRequestId(null);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingStore(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.createTenant({
        storeName: toTitleCaseTrimmed(newStoreName),
        slug: toLowerTrimmed(newSlug),
        ownerName: toTitleCaseTrimmed(newOwnerName),
        ownerEmail: toLowerTrimmed(newOwnerEmail),
        password: newOwnerPassword,
        subscriptionPlan: newSubscriptionPlan,
      });
      if (res.provisioned) {
        setProvisionedBanner(res.provisioned);
      }
      setSuccessMessage(
        `Store '${toTitleCaseTrimmed(newStoreName)}' provisioned with App Key ${res.provisioned?.appKey || ''}!`
      );
      setCreateModalOpen(false);
      setNewStoreName('');
      setNewSlug('');
      setNewOwnerName('');
      setNewOwnerEmail('');
      setNewOwnerPassword('');
      setNewSubscriptionPlan('YEARLY');
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to provision new store.');
    } finally {
      setCreatingStore(false);
    }
  };

  const handleOpenEditSubscription = (store: SuperAdminStoreRow) => {
    setStoreToEditSub(store);
    setEditSubPlan(store.subscriptionPlan === '6_MONTHS' ? '6_MONTHS' : 'YEARLY');
    const rawEnd = store.subscriptionEndDate ? new Date(store.subscriptionEndDate) : new Date();
    const formattedDateInput = !Number.isNaN(rawEnd.getTime())
      ? rawEnd.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setEditSubEndDate(formattedDateInput);
    const currentStatus = (store.subscriptionStatus || store.status || 'ACTIVE').toUpperCase();
    setEditSubStatus(
      currentStatus === 'EXPIRED'
        ? 'EXPIRED'
        : currentStatus === 'SUSPENDED'
        ? 'SUSPENDED'
        : 'ACTIVE'
    );
  };

  const handleRegenerateStoreKey = async (store: SuperAdminStoreRow) => {
    setRegeneratingKeyId(store.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.regenerateTenantKey(store.id);
      const newKey = res?.tenant?.appKey || '';
      setSuccessMessage(
        res.message || `Regenerated App Key for '${store.name}': ${newKey}`
      );
      if (storeToEditSub && storeToEditSub.id === store.id && newKey) {
        setStoreToEditSub({
          ...storeToEditSub,
          appKey: newKey,
        });
      }
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate store App Key.');
    } finally {
      setRegeneratingKeyId(null);
    }
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeToEditSub) return;
    setSavingSub(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const endIso = editSubEndDate ? new Date(`${editSubEndDate}T23:59:59.999Z`).toISOString() : undefined;
      const res = await api.superAdmin.updateTenantSubscription(storeToEditSub.id, {
        subscriptionPlan: editSubPlan,
        subscriptionEndDate: endIso,
        subscriptionStatus: editSubStatus,
      });
      setSuccessMessage(
        res.message || `Updated subscription and expiry date for '${storeToEditSub.name}'.`
      );
      setStoreToEditSub(null);
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update store subscription.');
    } finally {
      setSavingSub(false);
    }
  };

  // Render SuperAdmin Dedicated Login Screen aligned with Store Auth Page if not logged in as SUPERADMIN
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-900 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans selection:bg-purple-600 selection:text-white transition-colors duration-200">
        {/* Showroom Background Image Layer (aligned with Store Auth Page) */}
        <ShowroomBackground />

        {/* Top Application Bar with backdrop blur */}
        <PublicHeader
          storeName="MyPOS SaaS C-Panel"
          badgeText="Control Plane Online"
          badgeVariant="online"
          subtitle="Multi-Tenant Retail POS Cloud • SuperAdmin Access"
          dbText="PostgreSQL 16 • Control Plane"
        />

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
                {/* SuperAdmin Icon Header */}
                <div className="text-center mb-6">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-600/30 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 dark:border-purple-400/50">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h2
                    id="superadmin-auth-title"
                    className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight"
                  >
                    MyPOS SaaS C-Panel
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-1 font-medium">
                    Platform SuperAdmin Control Plane &bull; <span className="font-mono">mypos.com/admin</span>
                  </p>
                </div>

                {/* Card Tabs Navigation - Responsive Scrollable Underline Navigation */}
                <div
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  className="flex items-center justify-between border-b border-slate-200/80 dark:border-purple-900/60 mb-6 overflow-x-auto no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden"
                >
                  <button
                    id="superadmin-tab-login"
                    type="button"
                    data-active={authTab === 'login'}
                    onClick={() => {
                      setAuthTab('login');
                      setAuthError(null);
                      setAuthInfo(null);
                    }}
                    className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                      authTab === 'login'
                        ? 'active text-purple-600 dark:text-purple-400 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                    }`}
                  >
                    <Fingerprint
                      className={`w-4 h-4 transition-colors duration-200 ${
                        authTab === 'login'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span>Sign In</span>
                    {authTab === 'login' && (
                      <motion.div
                        layoutId="superAdminAuthActiveUnderline"
                        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                  </button>

                  <button
                    id="superadmin-tab-forgot"
                    type="button"
                    data-active={authTab === 'forgot' || authTab === 'reset'}
                    onClick={() => {
                      setAuthTab('forgot');
                      setAuthError(null);
                      setAuthInfo(null);
                    }}
                    className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                      authTab === 'forgot' || authTab === 'reset'
                        ? 'active text-purple-600 dark:text-purple-400 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                    }`}
                  >
                    <KeyRound
                      className={`w-4 h-4 transition-colors duration-200 ${
                        authTab === 'forgot' || authTab === 'reset'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span>Reset PIN</span>
                    {(authTab === 'forgot' || authTab === 'reset') && (
                      <motion.div
                        layoutId="superAdminAuthActiveUnderline"
                        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                  </button>
                </div>

                {/* Dynamic Header */}
                <div className="mb-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    {authTab === 'login' && 'Sign in to SuperAdmin C-Panel'}
                    {authTab === 'forgot' && 'Reset SuperAdmin PIN / Password'}
                    {authTab === 'reset' && 'Create New SuperAdmin Password'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5">
                    {authTab === 'login' &&
                      'Enter your SUPERADMIN credentials to manage tenant stores, toggle suspensions, and approve store requests.'}
                    {authTab === 'forgot' &&
                      'Provide your SuperAdmin email to generate an instant verification recovery code.'}
                    {authTab === 'reset' &&
                      'Enter your reset verification token and choose a new SuperAdmin password.'}
                  </p>
                </div>

                {/* Alerts */}
                {authError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{authError}</span>
                  </div>
                )}

                {authInfo && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{authInfo}</span>
                  </div>
                )}

                {/* TAB 1: LOGIN FORM */}
                {authTab === 'login' && (
                  <form onSubmit={handleSuperAdminLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        SuperAdmin Email or ID
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          id="superadmin-email-input"
                          type="email"
                          required
                          placeholder="superadmin@mypos.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-4 transition outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Master PIN / Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthTab('forgot');
                            setAuthError(null);
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
                          id="superadmin-password-input"
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
                        JWT Auth &bull; SUPERADMIN
                      </span>
                    </div>

                    <button
                      id="superadmin-login-submit-btn"
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)] font-bold text-xs sm:text-sm transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {authLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Verifying SUPERADMIN JWT...</span>
                        </>
                      ) : (
                        <>
                          <span>Sign In to SuperAdmin C-Panel</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    {/* Quick SuperAdmin & Store Credentials Helper (Aligned with Store Auth Page) */}
                    <div className="pt-3 border-t border-slate-200/80 dark:border-purple-900/50 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-purple-200/70 font-mono font-semibold">
                          Quick C-Panel Login (mypos.com/admin):
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-purple-300/60 font-mono">
                          1-Click Fill
                        </span>
                      </div>

                      <button
                        id="superadmin-quick-fill-btn"
                        type="button"
                        onClick={() => {
                          setEmail('superadmin@mypos.com');
                          setPassword('superadmin123');
                          setAuthError(null);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-900/40 dark:hover:bg-purple-800/60 border border-purple-200/80 dark:border-purple-700/60 text-left transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-purple-800 dark:text-purple-200 text-[11px]">
                            Platform SuperAdmin
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-200/70 dark:bg-purple-800 text-purple-900 dark:text-purple-100 font-mono font-bold">
                            SUPERADMIN
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-purple-700/80 dark:text-purple-300/80 font-mono mt-0.5">
                          <span className="truncate">superadmin@mypos.com</span>
                          <span>PIN: superadmin123</span>
                        </div>
                      </button>

                      <div className="pt-1 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-purple-300/70">
                        <div className="flex items-center gap-1.5">
                          <span>Switch to Store:</span>
                          <button
                            type="button"
                            onClick={() => onOpenStore('tj-shoes')}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-purple-100 dark:bg-slate-800 dark:hover:bg-purple-900/50 text-slate-700 dark:text-purple-200 font-bold transition cursor-pointer"
                          >
                            tj-shoes
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenStore('mystore')}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-purple-100 dark:bg-slate-800 dark:hover:bg-purple-900/50 text-slate-700 dark:text-purple-200 font-bold transition cursor-pointer"
                          >
                            mystore
                          </button>
                        </div>
                        <a
                          href="/admin/manifest.webmanifest"
                          target="_blank"
                          rel="noreferrer"
                          className="text-purple-600 dark:text-purple-300 hover:underline inline-flex items-center gap-1"
                        >
                          <span>PWA Manifest</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </form>
                )}

                {/* TAB 2: FORGOT PASSWORD FORM */}
                {authTab === 'forgot' && (
                  <form onSubmit={handleSuperAdminForgot} className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-purple-200/70 leading-relaxed font-medium">
                      Enter your SuperAdmin email address. A one-time verification token will be generated to reset your master credentials.
                    </p>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        SuperAdmin Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          placeholder="superadmin@mypos.com"
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
                          setAuthTab('login');
                          setAuthError(null);
                        }}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                      >
                        Back to Sign In
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {authLoading ? 'Requesting Token...' : 'Generate Reset Token'}
                      </button>
                    </div>
                  </form>
                )}

                {/* TAB 3: RESET PASSWORD FORM */}
                {authTab === 'reset' && (
                  <form onSubmit={handleSuperAdminResetPassword} className="space-y-4">
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
                          setAuthTab('login');
                          setAuthError(null);
                        }}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {authLoading ? 'Updating...' : 'Save New Password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </main>

        {/* Bottom Global Footer */}
        <PublicFooter
          storeName="MyPOS SaaS C-Panel"
          subtitle="Multi-Tenant Retail POS & Inventory Control Plane"
        />
      </div>
    );
  }

  // Filter stores & requests based on search query and status filter
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredStores = stores.filter((s) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'EXPIRED') {
        if (s.status !== 'EXPIRED' && s.subscriptionStatus !== 'EXPIRED') return false;
      } else if (s.status !== statusFilter && s.subscriptionStatus !== statusFilter) {
        return false;
      }
    }
    if (!normalizedSearch) return true;
    return (
      s.name.toLowerCase().includes(normalizedSearch) ||
      s.slug.toLowerCase().includes(normalizedSearch) ||
      s.subdomain.toLowerCase().includes(normalizedSearch) ||
      (s.appKey || '').toLowerCase().includes(normalizedSearch) ||
      (s.ownerName || '').toLowerCase().includes(normalizedSearch) ||
      (s.ownerEmail || '').toLowerCase().includes(normalizedSearch)
    );
  });

  const filteredRequests = storeRequests.filter((r) => {
    if (requestStatusFilter !== 'ALL' && r.status !== requestStatusFilter) return false;
    if (!normalizedSearch) return true;
    return (
      r.store_name.toLowerCase().includes(normalizedSearch) ||
      r.requested_slug.toLowerCase().includes(normalizedSearch) ||
      r.owner_name.toLowerCase().includes(normalizedSearch) ||
      r.owner_email.toLowerCase().includes(normalizedSearch)
    );
  });

  const pendingRequestsCount = storeRequests.filter((r) => r.status === 'PENDING').length;

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const sidebarSections = [
    {
      header: 'TENANT & STORE CONTROL',
      items: [
        {
          id: 'stores' as SuperAdminTab,
          label: 'Deployed Stores',
          icon: Store,
          shortcut: 'F1',
          badge: String(stores.length),
        },
        {
          id: 'requests' as SuperAdminTab,
          label: 'Store Requests',
          icon: Clock,
          shortcut: 'F2',
          badge: pendingRequestsCount > 0 ? String(pendingRequestsCount) : undefined,
          badgeTone: 'amber',
        },
      ],
    },
    {
      header: 'PLATFORM & ANALYTICS',
      items: [
        {
          id: 'revenue' as SuperAdminTab,
          label: 'Platform Revenue',
          icon: TrendingUp,
          shortcut: 'F4',
        },
        {
          id: 'manifests' as SuperAdminTab,
          label: 'Scoped Manifests',
          icon: FileCode2,
          shortcut: 'F5',
        },
      ],
    },
  ];

  const renderSuperAdminSidebar = (isMobile: boolean = false) => {
    const collapsed = !isMobile && isCollapsed;

    return (
      <div
        className={`w-full h-full max-h-screen flex flex-col bg-white/95 dark:bg-[#0D1322] backdrop-blur-lg text-slate-700 dark:text-slate-100 select-none border-r border-indigo-500/20 shadow-lg rounded-none overflow-y-auto overflow-x-hidden sidebar-scrollbar transition-colors ${
          collapsed ? 'px-2' : ''
        }`}
      >
        {/* TOP: Brand Header aligned with top Header bar (exact h-[3.6rem] with matching border-b) */}
        <div
          className={`h-[3.6rem] flex items-center justify-between border-b border-indigo-500/20 shrink-0 ${
            collapsed ? 'px-2 justify-center' : 'px-3.5 sm:px-4'
          }`}
        >
          <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center w-full' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm border border-purple-400/30">
              <Shield className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-xs font-bold text-slate-900 dark:text-white truncate tracking-tight leading-tight">
                  MyPOS SaaS C-Panel
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-indigo-200/70 font-medium truncate mt-0.5">
                  SuperAdmin Control Plane
                </p>
              </div>
            )}
          </div>

          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              aria-label="Close Mobile Navigation"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {!isMobile && !collapsed && (
            <button
              type="button"
              onClick={toggleCollapse}
              className="p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-white/10 transition cursor-pointer"
              title="Collapse sidebar (Ctrl+B)"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}

          {!isMobile && collapsed && (
            <button
              type="button"
              onClick={toggleCollapse}
              className="p-1 text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-white/10 transition cursor-pointer"
              title="Expand sidebar (Ctrl+B)"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* TOP ITEM: Dashboard Overview */}
        <div className={`pt-2.5 pb-1 ${collapsed ? 'px-1' : 'px-3'}`}>
          <div className="relative">
            <motion.button
              type="button"
              onClick={() => {
                setActiveTab('dashboard');
                if (isMobile) setMobileMenuOpen(false);
              }}
              whileTap={{ scale: 0.98 }}
              className={`relative w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
              } rounded-xl text-xs font-semibold cursor-pointer group transition-colors duration-150 ${
                activeTab === 'dashboard'
                  ? 'text-white font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50/70 dark:hover:bg-purple-950/30'
              }`}
            >
              {activeTab === 'dashboard' && (
                <motion.div
                  layoutId={isMobile ? 'superAdminMobilePill' : 'superAdminActiveNavPill'}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 dark:from-purple-600 dark:to-indigo-600 border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}

              <div className="relative z-10 flex items-center gap-3">
                <LayoutDashboard
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                    activeTab === 'dashboard'
                      ? 'text-white'
                      : 'text-slate-500 dark:text-slate-400 group-hover:scale-110'
                  }`}
                />
                {!collapsed && <span>Dashboard</span>}
              </div>
            </motion.button>
          </div>
        </div>

        {/* MIDDLE: Navigation Sections */}
        <div className={`py-1 space-y-2.5 ${collapsed ? 'px-1' : 'px-3'}`}>
          {sidebarSections.map((section) => (
            <div key={section.header} className="space-y-1">
              {!collapsed ? (
                <div className="text-[10px] font-bold text-slate-400 dark:text-indigo-300/70 uppercase tracking-wider px-2 py-0.5">
                  {section.header}
                </div>
              ) : (
                <div className="w-8 h-px bg-indigo-500/20 mx-auto my-2" />
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <div key={item.id} className="relative">
                      <motion.button
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          if (isMobile) setMobileMenuOpen(false);
                        }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative w-full flex items-center ${
                          collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                        } rounded-xl text-xs font-medium cursor-pointer group transition-colors duration-150 ${
                          isActive
                            ? 'text-white font-bold'
                            : 'text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50/70 dark:hover:bg-purple-950/30'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId={isMobile ? 'superAdminMobilePill' : 'superAdminActiveNavPill'}
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 dark:from-purple-600 dark:to-indigo-600 border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)]"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}

                        <div className="relative z-10 flex items-center gap-3 truncate">
                          <ItemIcon
                            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                              isActive
                                ? 'text-white'
                                : 'text-slate-500 dark:text-slate-400 group-hover:translate-x-0.5'
                            }`}
                          />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </div>

                        {!collapsed && (
                          <div className="relative z-10 flex items-center gap-1.5">
                            {item.badge && (
                              <span
                                className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                                  isActive
                                    ? 'bg-white/25 text-white'
                                    : item.badgeTone === 'amber'
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                                    : 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                            {item.shortcut && (
                              <kbd
                                className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md transition ${
                                  isActive
                                    ? 'bg-white/20 text-white border border-white/30'
                                    : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-indigo-500/20'
                                }`}
                              >
                                {item.shortcut}
                              </kbd>
                            )}
                          </div>
                        )}
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Action: Provision Store */}
          <div className="space-y-1 pt-1">
            {!collapsed && (
              <div className="text-[10px] font-bold text-slate-400 dark:text-indigo-300/70 uppercase tracking-wider px-2 py-0.5">
                PROVISIONING &amp; STORES
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateModalOpen(true);
                if (isMobile) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
              } rounded-xl text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50/80 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 border border-purple-200/80 dark:border-purple-800/50 transition cursor-pointer`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Plus className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                {!collapsed && <span className="truncate">Provision New Store</span>}
              </div>
              {!collapsed && (
                <kbd className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-white dark:bg-white/10 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700/50">
                  F3
                </kbd>
              )}
            </button>

            {/* Quick Store Jump List */}
            {!collapsed && stores.length > 0 && (
              <div className="pt-1.5 space-y-1">
                {stores.slice(0, 5).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      onOpenStore(st.slug);
                      if (isMobile) setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-slate-100/80 dark:hover:bg-white/5 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: st.status === 'ACTIVE' ? '#10B981' : '#F43F5E',
                        }}
                      />
                      <span className="truncate font-semibold">{st.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-purple-500">
                      /{st.slug}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM: SuperAdmin Profile, PWA Manifest, Theme & Database Status (identical to Store Sidebar) */}
        <div
          className={`border-t border-indigo-500/20 space-y-2 bg-slate-50/40 dark:bg-[#090E18] backdrop-blur-md mt-auto transition-colors ${
            collapsed ? 'p-2 pt-3' : 'p-3.5 pt-3'
          }`}
        >
          {/* User Card */}
          <div
            className={`flex items-center rounded-xl bg-white/80 dark:bg-[#131B2E] border border-indigo-500/20 transition shadow-xs ${
              collapsed ? 'justify-center p-2 relative' : 'justify-between p-2'
            }`}
          >
            <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
              <div className="relative shrink-0">
                <UserAvatar
                  name={currentUser?.name || 'Platform SuperAdmin'}
                  avatarUrl={currentUser?.avatarUrl}
                  role="ADMIN"
                  size="sm"
                />
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0D1322]" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {currentUser?.name || 'Platform SuperAdmin'}
                  </div>
                  <div className="text-[10px] text-purple-600 dark:text-purple-300 font-mono font-semibold truncate">
                    SUPERADMIN • mypos.com
                  </div>
                </div>
              )}
            </div>

            {!collapsed && (
              <div className="text-emerald-500 dark:text-emerald-400">
                <Check className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* Dedicated SuperAdmin PWA Manifest Link */}
          <a
            href="/admin/manifest.webmanifest"
            target="_blank"
            rel="noreferrer"
            className={`w-full flex items-center rounded-xl bg-indigo-50/60 hover:bg-indigo-100/80 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 transition cursor-pointer group shadow-xs ${
              collapsed ? 'justify-center p-2 relative' : 'justify-between px-2.5 py-1.5'
            }`}
            title="Inspect Dedicated SuperAdmin PWA Manifest (/admin/manifest.webmanifest)"
          >
            <div className="flex items-center gap-2">
              <FileCode2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              {!collapsed && <span className="text-[11px] font-bold">POS Admin PWA</span>}
            </div>
            {!collapsed && (
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white dark:bg-[#070B14] text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                /admin/
              </span>
            )}
          </a>

          {/* Theme Toggle & Database Connected Status */}
          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              onClick={toggleTheme}
              className={`w-full flex items-center rounded-lg bg-slate-100/80 hover:bg-slate-200/80 dark:bg-[#0E1628] dark:hover:bg-[#131D33] border border-indigo-500/20 text-[11px] text-slate-700 dark:text-slate-200 transition cursor-pointer ${
                collapsed ? 'justify-center p-2' : 'justify-between px-2 py-1.5'
              }`}
              title={`Current theme: ${theme}. Click to toggle`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {theme === 'dark' ? (
                  <Moon className="w-3 h-3 text-purple-400 shrink-0" />
                ) : (
                  <Sun className="w-3 h-3 text-purple-600 shrink-0" />
                )}
                {!collapsed && <span>Theme</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white dark:bg-[#070B14] text-slate-600 dark:text-cyan-300 border border-indigo-500/20">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              )}
            </button>

            <div
              className={`flex items-center rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-500/20 text-[10.5px] ${
                collapsed ? 'justify-center p-2' : 'justify-between px-2 py-1'
              }`}
            >
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-1 truncate">
                    <Database className="w-3 h-3 shrink-0" />
                    Control Plane: Online
                  </span>
                )}
              </div>
              {!collapsed && (
                <span className="text-[9.5px] font-mono text-emerald-600 dark:text-emerald-400">PostgreSQL</span>
              )}
            </div>

            {!collapsed && (
              <div className="flex items-center justify-between px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Keyboard className="w-3 h-3 text-slate-400" />
                  <span>Shortcuts:</span>
                </div>
                <span className="font-mono text-slate-600 dark:text-slate-300 font-semibold">F1 - F5 • Ctrl+B</span>
              </div>
            )}

            {!collapsed && (
              <div className="px-2 pt-1 border-t border-indigo-500/15 flex items-center justify-between text-[9.5px] text-slate-400 dark:text-slate-500">
                <span>MyPOS SaaS C-Panel</span>
                <span className="font-mono">v1.0.0</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex w-full min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 transition-colors">
      {/* DESKTOP FIXED SIDEBAR WITH SMOOTH SPRING WIDTH TRANSITION */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 72 : 256 }}
        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
        className="hidden lg:flex shrink-0 h-screen sticky top-0 z-30 no-print overflow-hidden rounded-none shadow-lg border-r border-indigo-500/20"
      >
        {renderSuperAdminSidebar(false)}
      </motion.aside>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative w-72 max-w-[85vw] h-full max-h-screen shadow-2xl z-10 overflow-hidden rounded-none border-r border-indigo-500/20"
            >
              {renderSuperAdminSidebar(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RIGHT COLUMN: TOP HEADER + MAIN WORKSPACE + FOOTER (Aligned with Store Page) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A]">
        {/* STICKY TOP HEADER BAR (Exact h-[3.6rem] aligned with Store Header.tsx) */}
        <header className="h-[3.6rem] sticky top-0 z-20 bg-white/95 dark:bg-[#0D1322]/95 backdrop-blur-lg border-b border-indigo-500/20 px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0 shadow-2xs transition-colors">
          {/* Left: Mobile Menu Button + Active Section Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              aria-label="Open Navigation Drawer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-mono font-bold">
                <Shield className="w-3.5 h-3.5" />
                mypos.com/admin
              </span>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {activeTab === 'dashboard' && 'SuperAdmin Executive Dashboard'}
                {activeTab === 'stores' && 'Deployed Stores & Middleware Control'}
                {activeTab === 'requests' && 'Pending Store Requests Queue'}
                {activeTab === 'revenue' && 'Platform Sales & Catalog Telemetry'}
                {activeTab === 'manifests' && 'Scoped Tenant PWA Manifests'}
              </h2>
            </div>
          </div>

          {/* Center: Quick Filter Search Input (aligned with Store Header Quick Search) */}
          <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 dark:text-purple-300/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stores, subdomains (mystore.mypos.com), or owners..."
                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-100/90 dark:bg-[#131B2E] border border-slate-200/90 dark:border-indigo-500/30 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-purple-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Actions, Theme Dropdown, User Profile & Sign Out */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportPlatformSql}
              disabled={exportingPlatform}
              title="Export All Stores & Platform Database to .SQL File"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/30 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {exportingPlatform ? 'Exporting SQL...' : 'Export All SQL'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-xs shadow-purple-600/20 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add New Store</span>
            </button>

            <button
              type="button"
              onClick={loadOverview}
              disabled={loading}
              title="Refresh platform telemetry"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-[#131B2E] dark:hover:bg-[#1A263D] border border-slate-200/80 dark:border-indigo-500/20 text-slate-600 dark:text-slate-200 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600 dark:text-purple-400' : ''}`} />
            </button>

            <ThemeDropdown />

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-indigo-500/20">
              <UserAvatar
                name={currentUser?.name || 'Platform SuperAdmin'}
                avatarUrl={currentUser?.avatarUrl}
                role="ADMIN"
                size="sm"
              />
              <div className="hidden xl:block text-left">
                <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {currentUser?.name || 'SuperAdmin'}
                </div>
                <div className="text-[10px] font-mono text-purple-600 dark:text-purple-300 font-semibold">
                  SUPERADMIN
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/30 text-xs font-bold transition cursor-pointer"
              title="Sign Out of SuperAdmin C-Panel"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA (Aligned with Store DashboardOverview.tsx) */}
        <main className="flex-1 min-w-0 overflow-x-hidden bg-[#F8FAFC] dark:bg-[#0A0E1A] transition-colors">
          <div className="p-4 sm:p-6 lg:p-7 space-y-6 max-w-7xl mx-auto select-none">
            {/* DASHBOARD HEADER ROW */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {activeTab === 'dashboard' && 'Dashboard'}
                  {activeTab === 'stores' && 'Deployed Stores Directory'}
                  {activeTab === 'requests' && 'Store Requests & 1-Click Provisioning'}
                  {activeTab === 'revenue' && 'Platform Revenue & SKU Telemetry'}
                  {activeTab === 'manifests' && 'Scoped Store & Admin PWA Manifests'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Welcome back, {currentUser?.name || 'Platform SuperAdmin'}! Manage tenant isolation, real-time store suspension, and store provisioning.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#0E1628] border border-slate-200/90 dark:border-[#1A263D] text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>{formattedDate}</span>
                </div>
                <button
                  type="button"
                  onClick={loadOverview}
                  disabled={loading}
                  title="Refresh metrics & recount stats"
                  className="p-1.5 rounded-xl bg-white hover:text-purple-600 border border-slate-200/90 shadow-2xs dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 text-slate-500 cursor-pointer transition active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      loading ? 'animate-spin text-purple-600 dark:text-purple-300' : 'text-slate-500 dark:text-purple-300'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Error Alert Banner */}
            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-200 font-mono font-bold cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Success Notification Banner */}
            {successMessage && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{successMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-mono font-bold cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Newly Provisioned Store Credentials Banner */}
            {provisionedBanner && (
              <div className="app-card bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-500/40 rounded-2xl p-5 sm:p-6 shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-base">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Store Provisioned: {provisionedBanner.storeName} ({provisionedBanner.subdomain})
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Isolated tenant schema initialized and initial Store Owner credentials generated:
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs">
                      <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 text-slate-800 dark:text-white shadow-2xs">
                        <KeyRound className="w-3.5 h-3.5 inline mr-1.5 text-emerald-600 dark:text-emerald-400" />
                        Admin Email: <strong>{provisionedBanner.adminEmail}</strong>
                      </span>
                      <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 text-slate-800 dark:text-white shadow-2xs">
                        Initial Password: <strong>{provisionedBanner.initialPassword}</strong>
                      </span>
                      {provisionedBanner.appKey && (
                        <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 shadow-2xs">
                          App Key: <strong>{provisionedBanner.appKey}</strong>
                        </span>
                      )}
                      {provisionedBanner.subscriptionEndDate && (
                        <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-2xs">
                          Plan: <strong>{provisionedBanner.subscriptionPlan === '6_MONTHS' ? '6 Months' : 'Yearly'}</strong> • Expires:{' '}
                          <strong>
                            {new Date(provisionedBanner.subscriptionEndDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenOnboarding(provisionedBanner.slug)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span>Launch Onboarding (/app/{provisionedBanner.slug}/install)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStore(provisionedBanner.slug)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 text-xs font-bold transition cursor-pointer"
                    >
                      <Store className="w-4 h-4" />
                      <span>Open Store POS</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ROW 1: 5 KPI METRIC CARDS WITH ANIMATED COUNTER (Aligned with Store DashboardOverview) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <StatCard
                id="superadmin-stat-total-stores"
                title="Deployed Stores"
                value={metrics.totalStores}
                icon={Store}
                iconColor="blue"
                sparkline="blue"
                trendIndicator={{
                  value: `${metrics.activeStores} Active`,
                  direction: 'up',
                  label: 'tenants',
                }}
                loading={loading}
                delay={0}
                duration={1000}
              />

              <StatCard
                id="superadmin-stat-active-stores"
                title="Active Tenants"
                value={metrics.activeStores}
                icon={CheckCircle2}
                iconColor="emerald"
                sparkline="emerald"
                trendIndicator={{
                  value: 'Online',
                  direction: 'up',
                  label: 'middleware',
                }}
                loading={loading}
                delay={0}
                duration={1000}
              />

              <StatCard
                id="superadmin-stat-suspended-stores"
                title="Suspended Stores"
                value={metrics.suspendedStores}
                icon={AlertCircle}
                iconColor="rose"
                sparkline="rose"
                valueClassName={metrics.suspendedStores > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
                trendIndicator={
                  metrics.suspendedStores > 0
                    ? { value: `${metrics.suspendedStores}`, direction: 'down', label: 'revoked' }
                    : { value: '0', direction: 'neutral', label: 'none suspended' }
                }
                loading={loading}
                delay={0}
                duration={1000}
              />

              <StatCard
                id="superadmin-stat-pending-requests"
                title="Pending Requests"
                value={metrics.pendingRequests}
                icon={Clock}
                iconColor="purple"
                sparkline="purple"
                trendIndicator={{
                  value: '1-Click',
                  direction: 'up',
                  label: 'provisioning',
                }}
                loading={loading}
                delay={0}
                duration={1000}
              />

              <StatCard
                id="superadmin-stat-platform-revenue"
                title="Platform Sales"
                value={Math.round(metrics.totalPlatformRevenue)}
                prefix="Rs. "
                icon={TrendingUp}
                iconColor="sky"
                sparkline="sky"
                trendIndicator={{
                  value: `${metrics.totalPlatformProducts.toLocaleString()} SKUs`,
                  direction: 'up',
                  label: 'catalog',
                }}
                loading={loading}
                delay={0}
                duration={1000}
              />
            </div>

            {/* SECTION 1: DEPLOYED STORES & REAL-TIME MIDDLEWARE ACCESS CONTROL */}
            {(activeTab === 'dashboard' || activeTab === 'stores' || activeTab === 'revenue') && (
              <div className="app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl overflow-hidden shadow-xs transition-colors">
                <div className="px-5 sm:px-6 py-4 border-b border-slate-200/80 dark:border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Store className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Deployed Stores &amp; Real-Time Middleware Access Control</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Toggling a store&apos;s status immediately revokes or restores access at the subdomain and JWT middleware level.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-[#131B2E] p-1 border border-slate-200/80 dark:border-indigo-500/20 text-xs">
                      {(['ALL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] as const).map((statusOpt) => (
                        <button
                          key={statusOpt}
                          type="button"
                          onClick={() => setStatusFilter(statusOpt)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                            statusFilter === statusOpt
                              ? 'bg-white dark:bg-purple-600 text-purple-700 dark:text-white shadow-2xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                          }`}
                        >
                          {statusOpt}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-500/30">
                      {filteredStores.length} Tenants
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 dark:border-indigo-500/20 text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-[#0D1322]/60">
                        <th className="py-3.5 px-5">Store / Subdomain</th>
                        <th className="py-3.5 px-4">Owner &amp; Currency</th>
                        <th className="py-3.5 px-4">Subscription &amp; App Key</th>
                        <th className="py-3.5 px-4 text-right">Products</th>
                        <th className="py-3.5 px-4 text-right">Total Sales</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-5 text-right">Real-Time Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-indigo-500/15 text-sm">
                      {filteredStores.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                            No stores match your current filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredStores.map((store) => {
                          const effectiveStatus =
                            store.subscriptionStatus === 'EXPIRED' || store.status === 'EXPIRED'
                              ? 'EXPIRED'
                              : store.status === 'SUSPENDED' || store.subscriptionStatus === 'SUSPENDED'
                              ? 'SUSPENDED'
                              : 'ACTIVE';
                          const isActive = effectiveStatus === 'ACTIVE';
                          const isExpired = effectiveStatus === 'EXPIRED';
                          return (
                            <tr
                              key={store.id}
                              className="hover:bg-slate-50/90 dark:hover:bg-white/[0.03] transition-colors"
                            >
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs"
                                    style={{ backgroundColor: store.themeColor || '#7C3AED' }}
                                  >
                                    {store.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                      <span>{store.name}</span>
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700">
                                        ID #{store.id}
                                      </span>
                                    </div>
                                    <div className="text-xs font-mono text-purple-600 dark:text-indigo-300 font-semibold">
                                      {store.subdomain}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-4 px-4">
                                <div className="text-xs text-slate-800 dark:text-slate-200 font-bold">
                                  {store.ownerName}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                  {store.ownerEmail} • {store.currency}
                                </div>
                                <div className="text-[10.5px] font-medium mt-0.5 text-slate-500 dark:text-slate-400">
                                  {store.onboardingCompleted ? (
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                      ● Initial Setup Complete
                                    </span>
                                  ) : (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      ● Pending Owner Setup
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-4 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-bold text-slate-800 dark:text-purple-200 select-all">
                                    <KeyRound className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0" />
                                    {store.appKey || 'APP-KEY-N/A'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (store.appKey && navigator.clipboard) {
                                        navigator.clipboard.writeText(store.appKey).catch(() => {});
                                        setSuccessMessage(`Copied App Key for ${store.name}: ${store.appKey}`);
                                      }
                                    }}
                                    className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-purple-600 dark:hover:text-white cursor-pointer"
                                    title="Copy App Key"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={regeneratingKeyId === store.id}
                                    onClick={() => handleRegenerateStoreKey(store)}
                                    className="p-1 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 cursor-pointer disabled:opacity-50"
                                    title="Regenerate Unique App Key"
                                  >
                                    <RefreshCw
                                      className={`w-3 h-3 ${regeneratingKeyId === store.id ? 'animate-spin text-purple-600' : ''}`}
                                    />
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-mono">
                                  <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-500/30 font-bold">
                                    {store.subscriptionPlan === '6_MONTHS' ? '6 Months' : 'Yearly'}
                                  </span>
                                  <span
                                    className={`${
                                      isExpired
                                        ? 'text-amber-600 dark:text-amber-400 font-bold'
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    Exp:{' '}
                                    {store.subscriptionEndDate
                                      ? new Date(store.subscriptionEndDate).toLocaleDateString('en-US', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                        })
                                      : 'N/A'}
                                  </span>
                                </div>
                              </td>

                              <td className="py-4 px-4 text-right font-mono">
                                <div className="text-sm font-bold text-slate-900 dark:text-white">
                                  {store.productCount.toLocaleString()}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {store.totalStockUnits.toLocaleString()} units
                                </div>
                              </td>

                              <td className="py-4 px-4 text-right font-mono">
                                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                  {store.currency} {Math.round(store.totalSales).toLocaleString()}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {store.salesCount} invoices
                                </div>
                              </td>

                              <td className="py-4 px-4 text-center">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                                    isActive
                                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                                      : isExpired
                                      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                                      : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      isActive
                                        ? 'bg-emerald-500'
                                        : isExpired
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                    }`}
                                  />
                                  {effectiveStatus}
                                </span>
                              </td>

                              <td className="py-4 px-5 text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  {/* Manage Subscription & App Key */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditSubscription(store)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-500/30 text-xs font-bold transition-colors cursor-pointer"
                                    title="Edit Subscription Plan, Expiry Date & App Key"
                                  >
                                    <KeyRound className="w-3.5 h-3.5" />
                                    <span>Subscription</span>
                                  </button>

                                  {/* Activate / Suspend Toggle */}
                                  <button
                                    type="button"
                                    disabled={togglingId === store.id}
                                    onClick={() => handleToggleStoreStatus(store)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                      isActive
                                        ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                                    }`}
                                    title={
                                      isActive
                                        ? 'Suspend Store Immediately at Middleware Level'
                                        : 'Activate Store Access'
                                    }
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>
                                      {togglingId === store.id
                                        ? 'Updating...'
                                        : isActive
                                        ? 'Suspend'
                                        : 'Activate'}
                                    </span>
                                  </button>

                                  {/* Export Store Data to SQL File */}
                                  <button
                                    type="button"
                                    disabled={exportingStoreId === store.id}
                                    onClick={() => handleExportStoreSql(store)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/15 dark:hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-500/30 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                    title={`Export ${store.name} Database to .SQL Backup File`}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>{exportingStoreId === store.id ? 'Exporting...' : 'Export SQL'}</span>
                                  </button>

                                  {/* Delete Store Button */}
                                  <button
                                    type="button"
                                    onClick={() => setStoreToDelete(store)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
                                    title={`Delete Store '${store.name}' and all its isolated records`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span className="hidden xl:inline">Delete</span>
                                  </button>

                                  {/* Initial Store Setup / Onboarding */}
                                  <button
                                    type="button"
                                    onClick={() => onOpenOnboarding(store.slug)}
                                    className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-slate-700 transition-colors cursor-pointer"
                                    title={`Open Initial Store Setup (/app/${store.slug}/install)`}
                                  >
                                    <Wand2 className="w-4 h-4" />
                                  </button>

                                  {/* Open Store POS */}
                                  <button
                                    type="button"
                                    onClick={() => onOpenStore(store.slug)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                  >
                                    <span>Open POS</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECTION 2: STORE REQUESTS MANAGEMENT & 1-CLICK PROVISIONING */}
            {(activeTab === 'dashboard' || activeTab === 'requests') && (
              <div className="app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl overflow-hidden shadow-xs transition-colors">
                <div className="px-5 sm:px-6 py-4 border-b border-slate-200/80 dark:border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span>Store Requests Management &amp; 1-Click Provisioning</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Approve, reject, reopen, or delete incoming store requests. Approving automatically creates the Store Tenant and Owner account.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-[#131B2E] p-1 border border-slate-200/80 dark:border-indigo-500/20 text-xs">
                      {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((reqOpt) => (
                        <button
                          key={reqOpt}
                          type="button"
                          onClick={() => setRequestStatusFilter(reqOpt)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                            requestStatusFilter === reqOpt
                              ? 'bg-white dark:bg-purple-600 text-purple-700 dark:text-white shadow-2xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                          }`}
                        >
                          {reqOpt}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                      {pendingRequestsCount} Pending
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 dark:border-indigo-500/20 text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-[#0D1322]/60">
                        <th className="py-3.5 px-5">Requested Store</th>
                        <th className="py-3.5 px-4">Desired Subdomain</th>
                        <th className="py-3.5 px-4">Owner Details</th>
                        <th className="py-3.5 px-4">Plan</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-5 text-right">Manage Request Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-indigo-500/15 text-sm">
                      {filteredRequests.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                            No store requests match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRequests.map((reqItem) => {
                          const isPending = reqItem.status === 'PENDING';
                          const isRejected = reqItem.status === 'REJECTED';
                          return (
                            <tr
                              key={reqItem.id}
                              className="hover:bg-slate-50/90 dark:hover:bg-white/[0.03] transition-colors"
                            >
                              <td className="py-4 px-5 font-bold text-slate-900 dark:text-white">
                                <div className="flex items-center gap-2">
                                  <span>{reqItem.store_name}</span>
                                  {(reqItem as any).request_type === 'RENEWAL' && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                                      RENEWAL
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4 font-mono text-xs text-purple-600 dark:text-violet-300 font-semibold">
                                {reqItem.requested_slug}.mypos.com
                              </td>
                              <td className="py-4 px-4">
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                  {reqItem.owner_name}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                  {reqItem.owner_email} {reqItem.owner_phone ? `• ${reqItem.owner_phone}` : ''}
                                </div>
                                {(reqItem as any).notes && (
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                                    &ldquo;{(reqItem as any).notes}&rdquo;
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 font-semibold">
                                {reqItem.plan}
                              </td>
                              <td className="py-4 px-4 text-center">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold ${
                                    reqItem.status === 'PENDING'
                                      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                                      : reqItem.status === 'APPROVED'
                                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                                      : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                                  }`}
                                >
                                  {reqItem.status}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  {isPending && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={approvingId === reqItem.id}
                                        onClick={() => handleApproveRequest(reqItem)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>
                                          {approvingId === reqItem.id
                                            ? 'Processing...'
                                            : (reqItem as any).request_type === 'RENEWAL'
                                            ? 'Approve & Extend'
                                            : 'Approve & Provision'}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={updatingRequestId === reqItem.id}
                                        onClick={() => handleRejectRequest(reqItem)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-slate-700 text-xs font-bold transition-colors cursor-pointer"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                        <span>Reject</span>
                                      </button>
                                    </>
                                  )}

                                  {isRejected && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={approvingId === reqItem.id}
                                        onClick={() => handleApproveRequest(reqItem)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Approve Anyway</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={updatingRequestId === reqItem.id}
                                        onClick={() => handleReopenRequest(reqItem)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                                        title="Reopen request as PENDING"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Reopen</span>
                                      </button>
                                    </>
                                  )}

                                  {reqItem.status === 'APPROVED' && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenStore(reqItem.requested_slug)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-purple-700 dark:text-emerald-300 border border-purple-200/80 dark:border-slate-700 text-xs font-mono font-bold cursor-pointer"
                                    >
                                      <Store className="w-3.5 h-3.5" />
                                      <span>Open /app/{reqItem.requested_slug}</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    disabled={deletingRequestId === reqItem.id}
                                    onClick={() => handleDeleteRequest(reqItem)}
                                    className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/30 transition-colors cursor-pointer disabled:opacity-50"
                                    title="Delete Store Request"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECTION 3: SCOPED PWA MANIFEST REGISTRY VIEW */}
            {activeTab === 'manifests' && (
              <div className="app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-indigo-500/20 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Multi-PWA Scoped Manifest Registry</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Each tenant store and the SuperAdmin Control Panel has an isolated Web App Manifest and scope.
                    </p>
                  </div>
                  <a
                    href="/admin/manifest.webmanifest"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 text-xs font-mono font-bold"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>/admin/manifest.webmanifest</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stores.map((st) => (
                    <div
                      key={st.id}
                      className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0"
                          style={{ backgroundColor: st.themeColor || '#7C3AED' }}
                        >
                          {st.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {st.name} — POS
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            start_url: /app/{st.slug}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-indigo-500/15 text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">
                          theme: {st.themeColor || '#7C3AED'}
                        </span>
                        <a
                          href={st.manifestUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-purple-600 dark:text-purple-300 hover:underline inline-flex items-center gap-1 font-bold"
                        >
                          <span>Inspect JSON</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* FOOTER (Aligned with Store Page Footer) */}
        <footer className="px-4 py-2.5 border-t border-indigo-500/20 bg-white/95 dark:bg-white/5 backdrop-blur-lg shadow-lg transition-colors duration-500 text-center text-xs font-medium text-slate-800 dark:text-slate-100 tracking-wide shrink-0 no-print select-none">
          Designed &amp; Developed by{' '}
          <a
            href="https://portpolio-eight-pi.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-slate-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline transition-colors"
          >
            SarbaazSoft
          </a>{' '}
          © 2026 • Control Plane: <span className="font-mono">mypos.com/admin</span>
        </footer>
      </div>

      {/* Add New Store Modal (Strictly Minimal Required Fields Only) */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="app-card bg-white dark:bg-[#111827] border border-slate-200 dark:border-purple-800/70 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 dark:text-white">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Add New Store
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Simultaneously creates the Store Tenant entity and primary Owner User account. Store defaults (invoices, barcodes, address &amp; taxes) are configured by the Owner on first login.
            </p>

            <form onSubmit={handleCreateStore} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Store Name *
                </label>
                <input
                  type="text"
                  required
                  value={newStoreName}
                  onChange={(e) => {
                    const formatted = toTitleCaseLive(e.target.value);
                    setNewStoreName(formatted);
                    if (!newSlug) {
                      setNewSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-')
                          .replace(/-+/g, '-')
                          .replace(/^-|-$/g, '')
                      );
                    }
                  }}
                  placeholder="Apex Footwear"
                  className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Owner Name *
                </label>
                <input
                  type="text"
                  required
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(toTitleCaseLive(e.target.value))}
                  placeholder="Bilal Ahmed"
                  className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Owner Email *
                </label>
                <input
                  type="email"
                  required
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  placeholder="owner@apex.mypos.com"
                  className="app-input w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewOwnerPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={newOwnerPassword}
                    onChange={(e) => setNewOwnerPassword(e.target.value)}
                    placeholder="Set initial Owner login password"
                    className="app-input w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono outline-none focus:border-purple-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewOwnerPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    title={showNewOwnerPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewOwnerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subdomain Slug *
                </label>
                <div className="flex items-center rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 overflow-hidden">
                  <input
                    type="text"
                    required
                    value={newSlug}
                    onChange={(e) =>
                      setNewSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-')
                          .replace(/-+/g, '-')
                          .replace(/^-|-$/g, '')
                      )
                    }
                    placeholder="storename"
                    className="w-full px-3.5 py-2.5 bg-transparent text-slate-900 dark:text-white text-sm font-mono outline-none"
                  />
                  <span className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono border-l border-slate-200 dark:border-purple-800/60">
                    .mypos.com
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subscription Plan *
                </label>
                <select
                  value={newSubscriptionPlan}
                  onChange={(e) => setNewSubscriptionPlan(e.target.value as '6_MONTHS' | 'YEARLY')}
                  className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-semibold outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value="6_MONTHS">6 Months Plan</option>
                  <option value="YEARLY">Yearly Plan (1 Year)</option>
                </select>
                <div className="mt-2 p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/50 text-[11px] font-mono text-slate-600 dark:text-purple-200 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    Auto App Key: <strong>APP-KEY-XXXX-XXXX</strong>
                  </span>
                  <span>
                    Expires:{' '}
                    <strong>
                      {(() => {
                        const d = new Date();
                        if (newSubscriptionPlan === '6_MONTHS') {
                          d.setMonth(d.getMonth() + 6);
                        } else {
                          d.setFullYear(d.getFullYear() + 1);
                        }
                        return d.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        });
                      })()}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingStore}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  {creatingStore ? 'Creating Store...' : 'Create Store & Owner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Store Subscription & App Key Modal */}
      {storeToEditSub && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="app-card bg-white dark:bg-[#111827] border border-slate-200 dark:border-purple-800/70 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 dark:text-white">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Subscription &amp; App Key
                  </h3>
                  <p className="text-xs font-mono text-purple-600 dark:text-purple-300">
                    {storeToEditSub.name} ({storeToEditSub.subdomain})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStoreToEditSub(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubscription} className="space-y-4 mt-4">
              {/* App Key Display & Regenerate */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-purple-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Assigned Store App Key
                  </span>
                  <button
                    type="button"
                    disabled={regeneratingKeyId === storeToEditSub.id}
                    onClick={() => handleRegenerateStoreKey(storeToEditSub)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${regeneratingKeyId === storeToEditSub.id ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {regeneratingKeyId === storeToEditSub.id ? 'Regenerating...' : 'Regenerate Key'}
                    </span>
                  </button>
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs font-bold text-purple-700 dark:text-purple-300">
                  <span className="select-all">{storeToEditSub.appKey || 'APP-KEY-ACTIVE'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (storeToEditSub.appKey && navigator.clipboard) {
                        navigator.clipboard.writeText(storeToEditSub.appKey).catch(() => {});
                        setSuccessMessage(`Copied App Key: ${storeToEditSub.appKey}`);
                      }
                    }}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-purple-600 dark:hover:text-white cursor-pointer"
                    title="Copy App Key"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Subscription Plan Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subscription Plan
                </label>
                <select
                  value={editSubPlan}
                  onChange={(e) => {
                    const nextPlan = e.target.value as '6_MONTHS' | 'YEARLY';
                    setEditSubPlan(nextPlan);
                    const d = new Date();
                    if (nextPlan === '6_MONTHS') {
                      d.setMonth(d.getMonth() + 6);
                    } else {
                      d.setFullYear(d.getFullYear() + 1);
                    }
                    setEditSubEndDate(d.toISOString().slice(0, 10));
                    setEditSubStatus('ACTIVE');
                  }}
                  className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-semibold outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value="6_MONTHS">6 Months</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              {/* Manual Expiry Date & Quick Renewal Presets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Subscription Expiry Date
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 6);
                        setEditSubPlan('6_MONTHS');
                        setEditSubEndDate(d.toISOString().slice(0, 10));
                        setEditSubStatus('ACTIVE');
                      }}
                      className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-mono font-bold cursor-pointer"
                    >
                      +6 Months
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setFullYear(d.getFullYear() + 1);
                        setEditSubPlan('YEARLY');
                        setEditSubEndDate(d.toISOString().slice(0, 10));
                        setEditSubStatus('ACTIVE');
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-mono font-bold cursor-pointer"
                    >
                      +1 Year
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  required
                  value={editSubEndDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditSubEndDate(val);
                    if (val) {
                      const chosen = new Date(`${val}T23:59:59.999Z`);
                      if (chosen.getTime() < Date.now()) {
                        setEditSubStatus('EXPIRED');
                      } else if (editSubStatus === 'EXPIRED') {
                        setEditSubStatus('ACTIVE');
                      }
                    }
                  }}
                  className="app-input w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono outline-none focus:border-purple-600"
                />
              </div>

              {/* Subscription Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subscription Status
                </label>
                <select
                  value={editSubStatus}
                  onChange={(e) =>
                    setEditSubStatus(e.target.value as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED')
                  }
                  className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-semibold outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStoreToEditSub(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSub}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingSub ? 'Saving...' : 'Save Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Store Modal */}
      {storeToDelete && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="app-card bg-white dark:bg-[#111827] border border-rose-200 dark:border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 dark:text-white">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Delete Store Tenant?
                  </h3>
                  <div className="text-xs font-mono text-rose-600 dark:text-rose-300">
                    {storeToDelete.subdomain} (ID #{storeToDelete.id})
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setStoreToDelete(null);
                  setError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              You are about to permanently delete <strong>{storeToDelete.name}</strong> and all of its isolated records ({storeToDelete.productCount} products, {storeToDelete.salesCount} sales invoices, staff accounts, and settings). You can export an SQL backup before deleting.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleExportStoreSql(storeToDelete)}
                disabled={exportingStoreId === storeToDelete.id}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/15 dark:hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 text-xs font-bold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {exportingStoreId === storeToDelete.id ? 'Exporting...' : 'Export SQL First'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStoreToDelete(null);
                    setError(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingStore}
                  onClick={handleConfirmDeleteStore}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingStore ? 'Deleting...' : 'Delete Permanently'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Top-Right Toast Notification for Immediate Action Feedback */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            className="fixed top-16 right-4 z-50 max-w-md bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-400/40 flex items-center gap-3 text-xs font-bold"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="flex-1">{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="p-1 rounded-lg hover:bg-white/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
