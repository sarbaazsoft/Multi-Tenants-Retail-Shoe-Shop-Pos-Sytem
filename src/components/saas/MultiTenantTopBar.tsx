import React, { useState } from 'react';
import {
  Globe,
  Shield,
  Store,
  AlertTriangle,
  Wand2,
  FileCode2,
  X,
  CheckCircle2,
  Lock,
  ExternalLink,
} from 'lucide-react';
import type { TenantInfo } from '../../types';
import { api } from '../../services/api';

interface MultiTenantTopBarProps {
  currentMode: 'LANDING' | 'SUPERADMIN' | 'TENANT_ACTIVE' | 'TENANT_SUSPENDED' | 'TENANT_EXPIRED' | 'TENANT_NOT_FOUND' | 'TENANT_ONBOARDING';
  activeTenant: TenantInfo | null;
  requestedSlug: string | null;
  availableTenants: TenantInfo[];
  onNavigateDomain: (target: {
    mode: 'LANDING' | 'SUPERADMIN' | 'TENANT' | 'NOT_FOUND' | 'ONBOARDING';
    slug?: string;
  }) => void;
}

export const MultiTenantTopBar: React.FC<MultiTenantTopBarProps> = ({
  currentMode,
  activeTenant,
  requestedSlug,
  availableTenants,
  onNavigateDomain,
}) => {
  const [manifestModalOpen, setManifestModalOpen] = useState(false);
  const [manifestJson, setManifestJson] = useState<any>(null);
  const [manifestUrl, setManifestUrl] = useState<string>('');
  const [loadingManifest, setLoadingManifest] = useState(false);

  const handleInspectManifest = async () => {
    setManifestModalOpen(true);
    setLoadingManifest(true);
    try {
      if (currentMode === 'SUPERADMIN') {
        const url = '/admin/manifest.webmanifest';
        setManifestUrl(url);
        const res = await fetch(url);
        const data = await res.json();
        setManifestJson(data);
      } else if (activeTenant) {
        const url = `/api/tenants/${activeTenant.slug}/manifest`;
        setManifestUrl(url);
        const data = await api.saas.getManifest(activeTenant.slug);
        setManifestJson(data);
      } else {
        const url = '/manifest.webmanifest';
        setManifestUrl(url);
        const res = await fetch(url);
        const data = await res.json();
        setManifestJson(data);
      }
    } catch (err: any) {
      setManifestJson({ error: err.message });
    } finally {
      setLoadingManifest(false);
    }
  };

  const getCurrentAddressLabel = () => {
    if (currentMode === 'LANDING') return 'https://mypos.com';
    if (currentMode === 'SUPERADMIN') return 'https://mypos.com/admin';
    if (currentMode === 'TENANT_NOT_FOUND') return `https://${requestedSlug || 'notexist'}.mypos.com`;
    if (currentMode === 'TENANT_ONBOARDING') return `https://${activeTenant?.slug || requestedSlug || 'mystore'}.mypos.com/app/${activeTenant?.slug || requestedSlug || 'mystore'}/install`;
    if (activeTenant) return `https://${activeTenant.slug}.mypos.com/app/${activeTenant.slug}`;
    return 'https://mypos.com';
  };

  return (
    <>
      <div className="bg-slate-950 text-slate-200 border-b border-slate-800/90 px-3 py-1.5 text-xs select-none z-50 relative">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Left: Simulated Subdomain Address Bar */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-violet-600/20 border border-violet-500/30 text-violet-300 font-semibold text-[11px]">
              <Globe className="w-3 h-3" />
              SaaS Router
            </span>
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md font-mono text-[11px] text-slate-300">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>{getCurrentAddressLabel()}</span>
            </div>
            {activeTenant && (
              <span
                className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border"
                style={{
                  borderColor: `${activeTenant.themeColor}55`,
                  backgroundColor: `${activeTenant.themeColor}22`,
                  color: '#fff',
                }}
              >
                tenant_id={activeTenant.id} ({activeTenant.status})
              </span>
            )}
          </div>

          {/* Right: Quick Subdomain & Route Switcher */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNavigateDomain({ mode: 'LANDING' })}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                currentMode === 'LANDING'
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>mypos.com (Landing)</span>
            </button>

            {availableTenants.map((t) => {
              const isCurrentStore =
                (currentMode === 'TENANT_ACTIVE' || currentMode === 'TENANT_SUSPENDED' || currentMode === 'TENANT_EXPIRED') &&
                activeTenant?.slug === t.slug;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onNavigateDomain({ mode: 'TENANT', slug: t.slug })}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    isCurrentStore
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  <Store className="w-3 h-3" />
                  <span>{t.slug}.mypos.com</span>
                  {t.status === 'SUSPENDED' && (
                    <span className="px-1 py-0.2 bg-rose-500/30 text-rose-200 rounded text-[9px] font-mono">
                      SUSPENDED
                    </span>
                  )}
                  {(t.status === 'EXPIRED' || t.subscriptionStatus === 'EXPIRED') && t.status !== 'SUSPENDED' && (
                    <span className="px-1 py-0.2 bg-amber-500/30 text-amber-200 rounded text-[9px] font-mono">
                      EXPIRED
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() =>
                onNavigateDomain({
                  mode: 'ONBOARDING',
                  slug: activeTenant?.slug || availableTenants[0]?.slug || 'mystore',
                })
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                currentMode === 'TENANT_ONBOARDING'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
              title="Tenant First-Time Onboarding Wizard (/app/[tenant_slug]/install)"
            >
              <Wand2 className="w-3 h-3" />
              <span>/app/{activeTenant?.slug || 'mystore'}/install</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateDomain({ mode: 'NOT_FOUND', slug: 'notexist' })}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                currentMode === 'TENANT_NOT_FOUND'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
              title="Test Unknown Subdomain 404 Fallback Screen"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>notexist.mypos.com (404)</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateDomain({ mode: 'SUPERADMIN' })}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                currentMode === 'SUPERADMIN'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30'
              }`}
            >
              <Shield className="w-3 h-3" />
              <span>mypos.com/admin</span>
            </button>

            <button
              type="button"
              onClick={handleInspectManifest}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono text-[11px] transition-colors cursor-pointer"
              title="Inspect Active Dynamic PWA Manifest"
            >
              <FileCode2 className="w-3 h-3 text-violet-400" />
              <span className="hidden lg:inline">PWA Manifest</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Dynamic PWA Manifest Inspector Modal */}
      {manifestModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                  <FileCode2 className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Dynamic Scoped PWA Manifest Inspector
                  </h3>
                  <p className="text-xs font-mono text-slate-400">{manifestUrl}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManifestModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4">
              {loadingManifest ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Loading dynamic manifest...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">App Name</span>
                      <span className="text-xs font-semibold text-white mt-0.5 block truncate">
                        {manifestJson?.name || '-'}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">Start URL</span>
                      <span className="text-xs font-mono text-emerald-400 mt-0.5 block truncate">
                        {manifestJson?.start_url || '-'}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">Isolated Scope</span>
                      <span className="text-xs font-mono text-violet-400 mt-0.5 block truncate">
                        {manifestJson?.scope || '-'}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">Theme Color</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20"
                          style={{ backgroundColor: manifestJson?.theme_color || '#0F172A' }}
                        />
                        <span className="text-xs font-mono text-white">
                          {manifestJson?.theme_color || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-300 overflow-x-auto max-h-80">
                    {JSON.stringify(manifestJson, null, 2)}
                  </pre>

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Document &lt;link rel="manifest"&gt; dynamically synced
                    </span>
                    <a
                      href={manifestUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 font-mono"
                    >
                      Open Raw Endpoint <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
