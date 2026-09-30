import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  api,
  getAuthToken,
  removeAuthToken,
  setActiveTenantSlug,
  getActiveTenantSlug,
} from './services/api.ts';
import { Header } from './components/common/Header.tsx';
import { Sidebar } from './components/common/Sidebar.tsx';
import { PosTerminal } from './components/pos/PosTerminal.tsx';
import { ProductManagement } from './components/inventory/ProductManagement.tsx';
import { StockLedgerView } from './components/inventory/StockLedgerView.tsx';
import { PurchaseManagement } from './components/purchases/PurchaseManagement.tsx';
import { SalesReturnView } from './components/returns/SalesReturnView.tsx';
import { CustomerManagement } from './components/customers/CustomerManagement.tsx';
import { ReportsDashboard } from './components/reports/ReportsDashboard.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { SupplierManagement } from './components/suppliers/SupplierManagement.tsx';
import { DashboardOverview } from './components/dashboard/DashboardOverview.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { UserProfileModal } from './components/auth/UserProfileModal.tsx';
import { InstallWizard } from './components/install/InstallWizard.tsx';
import { OfflineToastNotification } from './components/common/OfflineToastNotification.tsx';
import { PublicLayout } from './components/common/PublicLayout.tsx';
import { SammiAssistantView } from './components/chat/SammiAssistantView.tsx';
import { MultiTenantTopBar } from './components/saas/MultiTenantTopBar.tsx';
import { SaasLandingPage } from './components/saas/SaasLandingPage.tsx';
import { UnknownStore404View } from './components/saas/UnknownStore404View.tsx';
import { SuspendedStoreView } from './components/saas/SuspendedStoreView.tsx';
import { SuperAdminControlPanel } from './components/saas/SuperAdminControlPanel.tsx';
import { TenantOnboardingWizard } from './components/saas/TenantOnboardingWizard.tsx';
import type { ActiveExchange, TenantInfo } from './types.ts';

type SaasRouteMode =
  | 'LANDING'
  | 'SUPERADMIN'
  | 'TENANT_ACTIVE'
  | 'TENANT_SUSPENDED'
  | 'TENANT_EXPIRED'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_ONBOARDING';

function resolveTargetTab(requestedTab: string | undefined | null, user: any): string {
  const role = (user?.role || '').toLowerCase();
  const isCashier = role === 'cashier';
  const clean = (requestedTab || '').toLowerCase().trim();

  if (isCashier) {
    if (!clean || clean === 'dashboard' || clean === 'purchases') {
      return 'pos';
    }
    return clean;
  }

  if (!clean || clean === 'dashboard') {
    return 'dashboard';
  }
  return clean;
}

function detectInitialRouteFromLocation(): {
  mode: SaasRouteMode;
  slug: string | null;
  requestedSlugParam: string;
} {
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';
  let requestedSlugParam = searchParams.get('requestedSlug') || '';

  if (!requestedSlugParam && hash.includes('requestedSlug=')) {
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
      requestedSlugParam = hashParams.get('requestedSlug') || '';
    }
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { mode: 'SUPERADMIN', slug: null, requestedSlugParam };
  }

  const installMatch = pathname.match(/^\/app\/([a-z0-9-]+)\/install(?:\/|$)/i);
  if (installMatch) {
    return {
      mode: 'TENANT_ONBOARDING',
      slug: installMatch[1].toLowerCase(),
      requestedSlugParam,
    };
  }

  const appMatch = pathname.match(/^\/app\/([a-z0-9-]+)(?:\/(.*))?$/i);
  if (appMatch) {
    return {
      mode: 'TENANT_ACTIVE',
      slug: appMatch[1].toLowerCase(),
      requestedSlugParam,
    };
  }

  const domainParam = searchParams.get('domain');
  if (domainParam && domainParam.endsWith('.mypos.com')) {
    const sub = domainParam.slice(0, -'.mypos.com'.length).toLowerCase();
    if (sub === 'admin') {
      return { mode: 'SUPERADMIN', slug: null, requestedSlugParam };
    }
    if (sub && sub !== 'www') {
      return { mode: 'TENANT_ACTIVE', slug: sub, requestedSlugParam };
    }
  }

  if (pathname === '/landing' || requestedSlugParam) {
    return { mode: 'LANDING', slug: null, requestedSlugParam };
  }

  // If root `/` is visited, check if user has an active session or explicitly wants root landing
  const storedSlug = getActiveTenantSlug();
  return {
    mode: 'TENANT_ACTIVE',
    slug: storedSlug || 'mystore',
    requestedSlugParam,
  };
}

export default function App() {
  const initialRoute = detectInitialRouteFromLocation();
  const [saasMode, setSaasMode] = useState<SaasRouteMode>(initialRoute.mode);
  const [activeTenant, setActiveTenant] = useState<TenantInfo | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantInfo[]>([]);
  const [requestedSlug, setRequestedSlug] = useState<string | null>(initialRoute.slug);
  const [landingRequestedSlug, setLandingRequestedSlug] = useState<string>(
    initialRoute.requestedSlugParam
  );

  const [currentUser, setCurrentUser] = useState<any | null>(() => {
    try {
      const token = localStorage.getItem('pos_auth_token');
      if (!token || token === 'null' || token === 'undefined') {
        localStorage.removeItem('pos_current_user');
        localStorage.removeItem('pos_auth_token');
        return null;
      }
      const stored = localStorage.getItem('pos_current_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [companySettings, setCompanySettings] = useState<any | null>(() => {
    try {
      const stored = localStorage.getItem('cached_company_settings');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [cachedStoreName, setCachedStoreName] = useState<string>(() => {
    try {
      return localStorage.getItem('cached_store_name') || '';
    } catch {
      return '';
    }
  });

  const [currentTab, setCurrentTab] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('pos_current_user');
      const user = stored ? JSON.parse(stored) : null;
      const pathname = window.location.pathname.replace(/^\/app\/[a-z0-9-]+\/?/i, '').replace(/^\//, '');
      const searchTab = new URLSearchParams(window.location.search).get('tab');
      return resolveTargetTab(searchTab || pathname, user);
    } catch {
      return 'dashboard';
    }
  });

  const [activeExchangeForPos, setActiveExchangeForPos] = useState<ActiveExchange | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedSupplierForPurchase, setSelectedSupplierForPurchase] = useState<{ id?: number; name?: string } | null>(null);

  const [isInstalled, setIsInstalled] = useState<boolean | null>(() => {
    try {
      const cachedInstalled = localStorage.getItem('pos_is_installed');
      if (cachedInstalled !== null) {
        return cachedInstalled === 'true';
      }
      return true;
    } catch {
      return true;
    }
  });
  const [showInstallWizard, setShowInstallWizard] = useState(false);

  const effectiveStoreName =
    activeTenant?.name ||
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    cachedStoreName ||
    'StepSync Footwear';

  const pwaAppName =
    saasMode === 'SUPERADMIN'
      ? 'MyPOS SaaS C-Panel'
      : saasMode === 'LANDING'
      ? 'MyPOS — Multi-Tenant Retail POS Cloud'
      : `${effectiveStoreName} — POS Terminal`;

  // Dynamically update <link rel="manifest"> and <meta name="theme-color"> per tenant or SuperAdmin PWA
  useEffect(() => {
    document.title = pwaAppName;

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) {
      appleTitle.setAttribute('content', pwaAppName);
    }
    const appNameMeta = document.querySelector('meta[name="application-name"]');
    if (appNameMeta) {
      appNameMeta.setAttribute('content', pwaAppName);
    }

    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;

    if (saasMode === 'SUPERADMIN') {
      if (manifestLink) manifestLink.setAttribute('href', '/admin/manifest.webmanifest');
      if (themeMeta) themeMeta.setAttribute('content', '#0F172A');
    } else if (activeTenant && activeTenant.slug) {
      if (manifestLink) {
        manifestLink.setAttribute('href', `/api/tenants/${encodeURIComponent(activeTenant.slug)}/manifest`);
      }
      if (themeMeta) {
        themeMeta.setAttribute('content', activeTenant.themeColor || '#7C3AED');
      }
    } else {
      if (manifestLink) {
        manifestLink.setAttribute('href', `/manifest.webmanifest?store=${encodeURIComponent(effectiveStoreName)}`);
      }
    }
  }, [pwaAppName, effectiveStoreName, saasMode, activeTenant]);

  // Resolve Multi-Tenant Directory & Subdomain Status
  const refreshTenantDirectory = useCallback(async (targetSlug?: string | null, targetMode?: SaasRouteMode) => {
    try {
      const slugToQuery = targetSlug !== undefined ? targetSlug : requestedSlug;
      const res = await api.saas.resolve({
        domain: slugToQuery ? `${slugToQuery}.mypos.com` : undefined,
        slug: slugToQuery || undefined,
      });

      if (Array.isArray(res?.availableTenants)) {
        setAvailableTenants(res.availableTenants);
      }

      const resolution = res?.resolution;
      const effectiveMode = targetMode || saasMode;

      if (effectiveMode === 'LANDING' || effectiveMode === 'SUPERADMIN') {
        return;
      }

      if (effectiveMode === 'TENANT_ONBOARDING') {
        if (resolution?.tenant) {
          setActiveTenant(resolution.tenant);
        }
        return;
      }

      if (resolution?.mode === 'TENANT_NOT_FOUND') {
        setActiveTenant(null);
        setSaasMode('TENANT_NOT_FOUND');
      } else if (resolution?.mode === 'TENANT_SUSPENDED') {
        setActiveTenant(resolution.tenant);
        setSaasMode('TENANT_SUSPENDED');
      } else if (
        resolution?.mode === 'TENANT_EXPIRED' ||
        resolution?.tenant?.status === 'EXPIRED' ||
        resolution?.tenant?.subscriptionStatus === 'EXPIRED'
      ) {
        setActiveTenant(resolution.tenant);
        const storedUserRole = (() => {
          try {
            const raw = localStorage.getItem('pos_current_user');
            if (!raw) return '';
            const parsed = JSON.parse(raw);
            return String(parsed?.originalRole || parsed?.role || '').toUpperCase();
          } catch {
            return '';
          }
        })();
        const isOwnerOrSuper =
          storedUserRole === 'ADMIN' ||
          storedUserRole === 'SUPERADMIN' ||
          window.location.pathname.endsWith('/settings');
        if (isOwnerOrSuper) {
          setSaasMode('TENANT_ACTIVE');
          setCurrentTab('settings');
        } else {
          setSaasMode('TENANT_EXPIRED');
        }
      } else if (resolution?.tenant) {
        setActiveTenant(resolution.tenant);
        setSaasMode('TENANT_ACTIVE');
      }
    } catch (err) {
      console.warn('Tenant resolution warning:', err);
    }
  }, [requestedSlug, saasMode]);

  const initializeApp = useCallback(async (overrideSlug?: string | null, overrideMode?: SaasRouteMode) => {
    setIsInitializing(true);
    try {
      const slugForInit = overrideSlug !== undefined ? overrideSlug : requestedSlug || getActiveTenantSlug() || 'mystore';
      await refreshTenantDirectory(slugForInit, overrideMode);

      const [statusRes, settingsRes] = await Promise.all([
        api.install.status().catch(() => null),
        api.settings.get().catch(() => null),
      ]);

      let installed = true;
      if (statusRes !== null && statusRes.isInstalled !== undefined) {
        installed = Boolean(statusRes.isInstalled);
        try {
          localStorage.setItem('pos_is_installed', String(installed));
        } catch {}
      }
      setIsInstalled(installed);

      if (settingsRes?.settings) {
        setCompanySettings(settingsRes.settings);
        try {
          localStorage.setItem('cached_company_settings', JSON.stringify(settingsRes.settings));
        } catch {}
        const resolvedName =
          settingsRes.settings.name ||
          settingsRes.settings.company_name ||
          settingsRes.settings.companyName;
        if (resolvedName) {
          setCachedStoreName(resolvedName);
          try {
            localStorage.setItem('cached_store_name', resolvedName);
          } catch {}
        }
      }

      const isInstallUrl =
        window.location.pathname === '/installationWizard' ||
        window.location.pathname === '/install' ||
        window.location.search.includes('install=true');

      if (isInstallUrl) {
        setShowInstallWizard(true);
      } else {
        setShowInstallWizard(false);
      }

      // Verify existing JWT token & check if user belongs to the active tenant
      const token = getAuthToken();
      if (!token || token === 'null' || token === 'undefined') {
        setCurrentUser(null);
      } else {
        const userRes = await api.auth.me().catch(() => null);
        if (userRes?.user) {
          const dbRole = (userRes.user.role || '').toUpperCase();
          // If switching to a different tenant store than the user's JWT tenant, prompt login for that store (unless SUPERADMIN)
          if (
            slugForInit &&
            userRes.user.slug &&
            userRes.user.slug !== slugForInit &&
            dbRole !== 'SUPERADMIN'
          ) {
            setCurrentUser(null);
          } else if (dbRole === 'CASHIER') {
            const cashierUser = {
              ...userRes.user,
              role: 'CASHIER',
              originalRole: 'CASHIER',
              isSimulatedCashier: false,
            };
            setCurrentUser(cashierUser);
            try {
              localStorage.setItem('pos_current_user', JSON.stringify(cashierUser));
            } catch {}
          } else {
            const adminUser = {
              ...userRes.user,
              role: dbRole === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN',
              originalRole: dbRole === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN',
              isSimulatedCashier: false,
            };
            setCurrentUser(adminUser);
            try {
              localStorage.setItem('pos_current_user', JSON.stringify(adminUser));
            } catch {}
          }
        } else if (navigator.onLine) {
          removeAuthToken();
          setCurrentUser(null);
        }
      }
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setIsInitializing(false);
    }
  }, [requestedSlug, refreshTenantDirectory]);

  useEffect(() => {
    initializeApp();
  }, []);

  // Automatically restrict access to POS/Dashboard if any API request reports SUBSCRIPTION_EXPIRED
  useEffect(() => {
    const handleSubscriptionExpired = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      setActiveTenant((prev) =>
        prev
          ? {
              ...prev,
              status: 'EXPIRED',
              subscriptionStatus: 'EXPIRED',
              ...(detail?.subscriptionEndDate ? { subscriptionEndDate: detail.subscriptionEndDate } : {}),
            }
          : prev
      );
      if (saasMode !== 'SUPERADMIN' && saasMode !== 'LANDING') {
        setSaasMode('TENANT_SUSPENDED');
      }
    };
    window.addEventListener('tenant:subscription-expired', handleSubscriptionExpired);
    return () => window.removeEventListener('tenant:subscription-expired', handleSubscriptionExpired);
  }, [saasMode]);

  // Listen for real-time subscription expiry or suspension events from API middleware
  useEffect(() => {
    const handleSubExpired = () => {
      if (saasMode !== 'SUPERADMIN' && saasMode !== 'LANDING') {
        setSaasMode('TENANT_EXPIRED');
        refreshTenantDirectory(requestedSlug, 'TENANT_EXPIRED');
      }
    };
    window.addEventListener('pos:subscription-expired', handleSubExpired);
    return () => window.removeEventListener('pos:subscription-expired', handleSubExpired);
  }, [saasMode, requestedSlug, refreshTenantDirectory]);

  // Navigate between Multi-Tenant Subdomains & Routes
  const handleNavigateDomain = async (target: {
    mode: 'LANDING' | 'SUPERADMIN' | 'TENANT' | 'NOT_FOUND' | 'ONBOARDING';
    slug?: string;
  }) => {
    if (target.mode === 'LANDING') {
      setSaasMode('LANDING');
      setActiveTenant(null);
      setRequestedSlug(null);
      setActiveTenantSlug(null);
      window.history.pushState({}, '', '/landing');
      return;
    }

    if (target.mode === 'SUPERADMIN') {
      setSaasMode('SUPERADMIN');
      setActiveTenant(null);
      setRequestedSlug(null);
      setActiveTenantSlug(null);
      window.history.pushState({}, '', '/admin');
      return;
    }

    if (target.mode === 'NOT_FOUND') {
      const missingSlug = target.slug || 'notexist';
      setRequestedSlug(missingSlug);
      setActiveTenant(null);
      setSaasMode('TENANT_NOT_FOUND');
      window.history.pushState({}, '', `/?domain=${encodeURIComponent(missingSlug)}.mypos.com`);
      return;
    }

    if (target.mode === 'ONBOARDING') {
      const targetSlug = target.slug || activeTenant?.slug || 'mystore';
      setRequestedSlug(targetSlug);
      setActiveTenantSlug(targetSlug);
      setSaasMode('TENANT_ONBOARDING');
      window.history.pushState({}, '', `/app/${targetSlug}/install`);
      await refreshTenantDirectory(targetSlug, 'TENANT_ONBOARDING');
      return;
    }

    if (target.mode === 'TENANT') {
      const targetSlug = target.slug || 'mystore';
      setRequestedSlug(targetSlug);
      setActiveTenantSlug(targetSlug);
      setSaasMode('TENANT_ACTIVE');
      window.history.pushState({}, '', `/app/${targetSlug}`);
      await initializeApp(targetSlug, 'TENANT_ACTIVE');
    }
  };

  const handleTabChange = (targetTab: string) => {
    const valid = resolveTargetTab(targetTab, currentUser);
    setCurrentTab(valid);
    const prefix = activeTenant?.slug ? `/app/${activeTenant.slug}` : '';
    window.history.replaceState({}, '', `${prefix}/${valid}`);
  };

  useEffect(() => {
    const role = (currentUser?.role || '').toLowerCase();
    const isCashier = role === 'cashier';
    if (isCashier) {
      if (currentTab === 'purchases' || currentTab === 'dashboard') {
        setCurrentTab('pos');
      }
    }
  }, [currentUser, currentTab]);

  const handleLogout = () => {
    removeAuthToken();
    try {
      localStorage.removeItem('pos_current_user');
    } catch {}
    setCurrentUser(null);
    setCurrentTab('dashboard');
    if (activeTenant?.slug) {
      window.history.replaceState({}, '', `/app/${activeTenant.slug}/login`);
    } else {
      window.history.replaceState({}, '', '/');
    }
  };

  const handleSwitchRole = (newRole: 'ADMIN' | 'CASHIER') => {
    setCurrentUser((prev: any) => {
      if (!prev) return prev;
      const trueRole = (prev.originalRole || prev.role || '').toUpperCase();
      if (trueRole !== 'ADMIN' && trueRole !== 'SUPERADMIN') {
        return prev;
      }
      const updated = {
        ...prev,
        role: newRole,
        originalRole: trueRole,
        isSimulatedCashier: newRole === 'CASHIER',
      };
      try {
        localStorage.setItem('pos_current_user', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    if (newRole === 'CASHIER') {
      setCurrentTab('pos');
    } else {
      setCurrentTab('dashboard');
    }
  };

  const handleSettingsUpdated = async (updatedSettings?: any) => {
    try {
      if (updatedSettings) {
        setCompanySettings(updatedSettings);
        try {
          localStorage.setItem('cached_company_settings', JSON.stringify(updatedSettings));
        } catch {}
      }
      const [settingsRes, statusRes] = await Promise.all([
        api.settings.get().catch(() => null),
        api.install.status().catch(() => null),
      ]);
      if (settingsRes?.settings) {
        setCompanySettings(settingsRes.settings);
      }
      if (statusRes) {
        setIsInstalled(statusRes.isInstalled);
      }
      await refreshTenantDirectory(activeTenant?.slug);
    } catch (err) {
      console.error(err);
    }
  };

  // Keyboard Shortcuts for Physical Counter Navigation & POS Operations
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (saasMode !== 'TENANT_ACTIVE') return;
      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'].includes(e.key)) {
        e.preventDefault();
      }

      const role = (currentUser?.role || '').toLowerCase();
      const isCashier = role === 'cashier';

      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleTabChange('suppliers');
        return;
      }

      switch (e.key) {
        case 'F1':
          handleTabChange('pos');
          break;
        case 'F2':
          handleTabChange('inventory');
          break;
        case 'F3':
          if (!isCashier) handleTabChange('purchases');
          break;
        case 'F4':
          handleTabChange('returns');
          break;
        case 'F5':
          handleTabChange('customers');
          break;
        case 'F6':
          handleTabChange('reports');
          break;
        case 'F7':
          handleTabChange('settings');
          break;
        case 'F8':
          handleTabChange('pos');
          window.dispatchEvent(new CustomEvent('pos:delete-sale'));
          break;
        case 'F9':
          handleTabChange('pos');
          window.dispatchEvent(new CustomEvent('pos:print-receipt'));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [currentUser, saasMode]);

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-100 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans antialiased transition-colors duration-200">
      {/* MULTI-TENANT SUBDOMAIN & ROUTE SWITCHER TOP BAR */}
      <MultiTenantTopBar
        currentMode={saasMode}
        activeTenant={activeTenant}
        requestedSlug={requestedSlug}
        availableTenants={availableTenants}
        onNavigateDomain={handleNavigateDomain}
      />

      {/* 1. ROOT DOMAIN SAAS LANDING PAGE (`mypos.com`) */}
      {saasMode === 'LANDING' && (
        <SaasLandingPage
          initialRequestedSlug={landingRequestedSlug}
          availableTenants={availableTenants}
          onOpenStore={(slug) => handleNavigateDomain({ mode: 'TENANT', slug })}
          onOpenSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
          onOpenOnboarding={(slug) => handleNavigateDomain({ mode: 'ONBOARDING', slug })}
          onTestUnknownSubdomain={(slug) => handleNavigateDomain({ mode: 'NOT_FOUND', slug })}
        />
      )}

      {/* 2. SUPERADMIN CONTROL PANEL (`mypos.com/admin`) */}
      {saasMode === 'SUPERADMIN' && (
        <SuperAdminControlPanel
          currentUser={currentUser}
          onUserAuthenticated={(user) => {
            setCurrentUser(user);
          }}
          onLogout={handleLogout}
          onOpenStore={(slug) => handleNavigateDomain({ mode: 'TENANT', slug })}
          onOpenOnboarding={(slug) => handleNavigateDomain({ mode: 'ONBOARDING', slug })}
          onTenantsUpdated={() => refreshTenantDirectory(requestedSlug, 'SUPERADMIN')}
        />
      )}

      {/* 3. UNKNOWN STORE FALLBACK SCREEN (404 TENANT: e.g., `notexist.mypos.com`) */}
      {saasMode === 'TENANT_NOT_FOUND' && (
        <UnknownStore404View
          requestedSlug={requestedSlug || 'notexist'}
          onClaimSlug={(slugToClaim) => {
            setLandingRequestedSlug(slugToClaim);
            setSaasMode('LANDING');
            window.history.pushState(
              {},
              '',
              `/landing?requestedSlug=${encodeURIComponent(slugToClaim)}#pricing`
            );
          }}
          onSwitchToStore={(slug) => handleNavigateDomain({ mode: 'TENANT', slug })}
          onGoToSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
        />
      )}

      {/* 4. SUSPENDED OR EXPIRED STORE SCREEN (`mystore.mypos.com` when status = SUSPENDED or EXPIRED) */}
      {(saasMode === 'TENANT_SUSPENDED' || saasMode === 'TENANT_EXPIRED') && (
        <SuspendedStoreView
          tenant={activeTenant}
          requestedSlug={requestedSlug || ''}
          onGoToLanding={() => handleNavigateDomain({ mode: 'LANDING' })}
          onGoToSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
          onOpenStoreSettings={() => {
            setSaasMode('TENANT_ACTIVE');
            setCurrentTab('settings');
            const prefix = activeTenant?.slug ? `/app/${activeTenant.slug}` : '';
            window.history.replaceState({}, '', `${prefix}/settings`);
          }}
        />
      )}

      {/* 5. TENANT FIRST-TIME ONBOARDING WIZARD (`/app/[tenant_slug]/install`) */}
      {saasMode === 'TENANT_ONBOARDING' && (
        <TenantOnboardingWizard
          slug={activeTenant?.slug || requestedSlug || currentUser?.slug || 'mystore'}
          isRequiredFirstLogin={
            Boolean(currentUser?.role === 'ADMIN' && (currentUser?.onboardingCompleted === false || activeTenant?.onboardingCompleted === false))
          }
          onCompleted={async (completedSlug, user, _token, savedSettings) => {
            if (user) {
              const roleUpper = (user.role || 'ADMIN').toUpperCase();
              const updatedUser = {
                ...user,
                role: roleUpper,
                originalRole: roleUpper,
                onboardingCompleted: true,
                isSimulatedCashier: false,
              };
              setCurrentUser(updatedUser);
              try {
                localStorage.setItem('pos_current_user', JSON.stringify(updatedUser));
              } catch {}
            } else if (currentUser) {
              const updatedUser = { ...currentUser, onboardingCompleted: true };
              setCurrentUser(updatedUser);
              try {
                localStorage.setItem('pos_current_user', JSON.stringify(updatedUser));
              } catch {}
            }
            if (savedSettings) {
              setCompanySettings(savedSettings);
              try {
                localStorage.setItem('cached_company_settings', JSON.stringify(savedSettings));
              } catch {}
            }
            setActiveTenant((prev) => (prev ? { ...prev, onboardingCompleted: true } : prev));
            setIsInstalled(true);
            setCurrentTab('dashboard');
            await handleNavigateDomain({ mode: 'TENANT', slug: completedSlug });
          }}
          onCancel={() =>
            handleNavigateDomain({
              mode: 'TENANT',
              slug: activeTenant?.slug || requestedSlug || 'mystore',
            })
          }
        />
      )}

      {/* 6. ACTIVE TENANT POS & INVENTORY SUITE (`mystore.mypos.com` / `/app/[tenant_slug]`) */}
      {saasMode === 'TENANT_ACTIVE' && (
        <>
          {isInitializing ? (
            <PublicLayout
              storeName={effectiveStoreName}
              badgeText="Connecting..."
              badgeVariant="connecting"
              subtitle="Footwear Retail POS & Inventory Suite"
              dbText="PostgreSQL • Tenant Scoped"
            >
              <div
                id="app-initial-loading-card"
                className="bg-white/95 dark:bg-[#131B2E]/95 backdrop-blur-md rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/30 dark:border-purple-800/60 flex flex-col items-center max-w-sm w-full mx-4 text-center animate-in fade-in zoom-in-95 duration-200"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-purple-600/30 ring-2 ring-indigo-400/30">
                  <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {effectiveStoreName}
                </h2>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                  Loading {effectiveStoreName} Workspace...
                </p>
              </div>
            </PublicLayout>
          ) : showInstallWizard ? (
            <InstallWizard
              isAlreadyInstalled={Boolean(isInstalled)}
              onInstalled={({ user, settings }) => {
                if (user) {
                  const dbRole = (user?.role || 'ADMIN').toUpperCase();
                  const normalizedUser = {
                    ...user,
                    role: dbRole,
                    originalRole: dbRole,
                    isSimulatedCashier: false,
                  };
                  setCurrentUser(normalizedUser);
                }
                if (settings) {
                  setCompanySettings(settings);
                }
                setIsInstalled(true);
                setShowInstallWizard(false);
                initializeApp();
              }}
              onCancelToLogin={() => {
                setShowInstallWizard(false);
              }}
            />
          ) : !currentUser ? (
            <AuthModal
              companySettings={{
                ...companySettings,
                name: effectiveStoreName,
                slug: activeTenant?.slug || requestedSlug || companySettings?.slug || 'tj-shoes',
              }}
              onSuccess={(user) => {
                const dbRole = (user?.role || 'ADMIN').toUpperCase();
                const normalizedUser = {
                  ...user,
                  role: dbRole,
                  originalRole: dbRole,
                  isSimulatedCashier: false,
                };
                setCurrentUser(normalizedUser);
                try {
                  localStorage.setItem('pos_current_user', JSON.stringify(normalizedUser));
                  localStorage.setItem('pos_is_installed', 'true');
                } catch {}
                if (dbRole === 'SUPERADMIN') {
                  handleNavigateDomain({ mode: 'SUPERADMIN' });
                  return;
                }
                const targetStoreSlug = user?.slug || activeTenant?.slug || requestedSlug || 'mystore';
                // Redirect Store Owner to required Initial Store Setup on first login if setup is incomplete
                if (
                  dbRole === 'ADMIN' &&
                  (user?.onboardingCompleted === false || activeTenant?.onboardingCompleted === false)
                ) {
                  handleNavigateDomain({ mode: 'ONBOARDING', slug: targetStoreSlug });
                  return;
                }
                const slugPrefix = user?.slug ? `/app/${user.slug}` : '';
                if (dbRole.toLowerCase() === 'cashier') {
                  setCurrentTab('pos');
                  window.history.replaceState({}, '', `${slugPrefix}/pos`);
                } else {
                  setCurrentTab('dashboard');
                  window.history.replaceState({}, '', `${slugPrefix}/dashboard`);
                }
                initializeApp(user?.slug);
              }}
            />
          ) : (currentUser?.originalRole || currentUser?.role || '').toUpperCase() === 'ADMIN' &&
            (currentUser?.onboardingCompleted === false || activeTenant?.onboardingCompleted === false) ? (
            <TenantOnboardingWizard
              slug={activeTenant?.slug || currentUser?.slug || requestedSlug || 'mystore'}
              isRequiredFirstLogin={true}
              onCompleted={async (completedSlug, user, _token, savedSettings) => {
                if (user) {
                  const roleUpper = (user.role || 'ADMIN').toUpperCase();
                  const updatedUser = {
                    ...user,
                    role: roleUpper,
                    originalRole: roleUpper,
                    onboardingCompleted: true,
                    isSimulatedCashier: false,
                  };
                  setCurrentUser(updatedUser);
                  try {
                    localStorage.setItem('pos_current_user', JSON.stringify(updatedUser));
                  } catch {}
                } else if (currentUser) {
                  const updatedUser = { ...currentUser, onboardingCompleted: true };
                  setCurrentUser(updatedUser);
                  try {
                    localStorage.setItem('pos_current_user', JSON.stringify(updatedUser));
                  } catch {}
                }
                if (savedSettings) {
                  setCompanySettings(savedSettings);
                  try {
                    localStorage.setItem('cached_company_settings', JSON.stringify(savedSettings));
                  } catch {}
                }
                setActiveTenant((prev) => (prev ? { ...prev, onboardingCompleted: true } : prev));
                setIsInstalled(true);
                setCurrentTab('dashboard');
                await handleNavigateDomain({ mode: 'TENANT', slug: completedSlug });
              }}
              onCancel={() => {}}
            />
          ) : (
            <div className="flex w-full min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 transition-colors">
              <Sidebar
                currentTab={currentTab}
                onTabChange={(tab) => handleTabChange(tab)}
                currentUser={currentUser}
                companySettings={{
                  ...companySettings,
                  name: effectiveStoreName,
                }}
                onLogout={handleLogout}
                mobileOpen={mobileMenuOpen}
                onCloseMobile={() => setMobileMenuOpen(false)}
                onOpenProfile={() => setIsProfileModalOpen(true)}
              />

              <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto bg-[#F8FAFC] dark:bg-[#0A0E1A]">
                <Header
                  currentTab={currentTab}
                  onTabChange={(tab) => handleTabChange(tab)}
                  currentUser={currentUser}
                  companySettings={{
                    ...companySettings,
                    name: effectiveStoreName,
                  }}
                  onLogout={handleLogout}
                  onToggleMobileMenu={() => setMobileMenuOpen(true)}
                  onOpenProfile={() => setIsProfileModalOpen(true)}
                  onSwitchRole={handleSwitchRole}
                />

                <main className="flex-1 min-w-0 overflow-x-hidden bg-[#F8FAFC] dark:bg-[#0A0E1A] transition-colors">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${activeTenant?.slug || 'default'}-${currentTab}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="w-full h-full"
                    >
                      {currentTab === 'dashboard' &&
                        ((currentUser?.role || '').toLowerCase() === 'cashier' ? (
                          <PosTerminal
                            currentUser={currentUser}
                            companySettings={companySettings}
                            initialExchange={activeExchangeForPos}
                            onClearInitialExchange={() => setActiveExchangeForPos(null)}
                          />
                        ) : (
                          <DashboardOverview
                            currentUser={currentUser}
                            companySettings={companySettings}
                            onNavigate={(tab) => handleTabChange(tab)}
                          />
                        ))}

                      {currentTab === 'pos' && (
                        <PosTerminal
                          currentUser={currentUser}
                          companySettings={companySettings}
                          initialExchange={activeExchangeForPos}
                          onClearInitialExchange={() => setActiveExchangeForPos(null)}
                        />
                      )}

                      {currentTab === 'inventory' && (
                        <ProductManagement
                          currentUser={currentUser}
                          companySettings={companySettings}
                        />
                      )}

                      {currentTab === 'ledger' && <StockLedgerView />}

                      {currentTab === 'purchases' &&
                        ((currentUser?.role || '').toLowerCase() === 'cashier' ? (
                          <PosTerminal
                            currentUser={currentUser}
                            companySettings={companySettings}
                            initialExchange={activeExchangeForPos}
                            onClearInitialExchange={() => setActiveExchangeForPos(null)}
                          />
                        ) : (
                          <PurchaseManagement
                            currentUser={currentUser}
                            companySettings={companySettings}
                            initialSupplierId={selectedSupplierForPurchase?.id}
                            initialSupplierName={selectedSupplierForPurchase?.name}
                            onNavigateToSuppliers={() => handleTabChange('suppliers')}
                          />
                        ))}

                      {currentTab === 'suppliers' && (
                        <SupplierManagement
                          currentUser={currentUser}
                          companySettings={companySettings}
                          onNavigateToPurchase={(supId, supName) => {
                            if ((currentUser?.role || '').toLowerCase() !== 'cashier') {
                              setSelectedSupplierForPurchase(
                                supId || supName ? { id: supId, name: supName } : null
                              );
                              handleTabChange('purchases');
                            }
                          }}
                        />
                      )}

                      {currentTab === 'returns' && (
                        <SalesReturnView
                          currentUser={currentUser}
                          companySettings={companySettings}
                          onStartExchange={(exchange) => {
                            setActiveExchangeForPos(exchange);
                            handleTabChange('pos');
                          }}
                        />
                      )}

                      {currentTab === 'customers' && (
                        <CustomerManagement companySettings={companySettings} />
                      )}

                      {currentTab === 'reports' && (
                        <ReportsDashboard
                          currentUser={currentUser}
                          companySettings={companySettings}
                        />
                      )}

                      {currentTab === 'settings' && (
                        <SettingsView
                          currentUser={currentUser}
                          companySettings={{
                            ...companySettings,
                            appKey: companySettings?.appKey || activeTenant?.appKey,
                            subscriptionPlan: companySettings?.subscriptionPlan || activeTenant?.subscriptionPlan,
                            subscriptionStartDate: companySettings?.subscriptionStartDate || activeTenant?.subscriptionStartDate,
                            subscriptionEndDate: companySettings?.subscriptionEndDate || activeTenant?.subscriptionEndDate,
                            subscriptionStatus: companySettings?.subscriptionStatus || activeTenant?.subscriptionStatus,
                          }}
                          onSettingsUpdated={handleSettingsUpdated}
                          onOpenInstallWizard={() => {
                            handleNavigateDomain({
                              mode: 'ONBOARDING',
                              slug: activeTenant?.slug || 'mystore',
                            });
                          }}
                        />
                      )}

                      {currentTab === 'assistant' && (
                        <SammiAssistantView
                          storeName={effectiveStoreName}
                          currentUser={currentUser}
                          companySettings={companySettings}
                          onNavigateTab={(tab) => handleTabChange(tab)}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </main>

                <footer className="px-4 py-2.5 border border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg shadow-lg transition-colors duration-500 text-center text-xs font-medium text-slate-800 dark:text-slate-100 tracking-wide shrink-0 no-print select-none">
                  Designed &amp; Developed by{' '}
                  <a
                    href="https://portpolio-eight-pi.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-slate-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline transition-colors"
                  >
                    SarbaazSoft
                  </a>{' '}
                  © 2026 • Tenant: <span className="font-mono">{activeTenant?.slug || 'mystore'}.mypos.com</span>
                </footer>
              </div>
            </div>
          )}
        </>
      )}

      {currentUser && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          storeName={effectiveStoreName}
          onUserUpdated={(updatedUser) => {
            setCurrentUser(updatedUser);
          }}
        />
      )}

      <OfflineToastNotification
        currencySymbol={companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.'}
      />
    </div>
  );
}
