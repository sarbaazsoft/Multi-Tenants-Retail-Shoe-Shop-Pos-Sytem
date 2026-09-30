import React from 'react';
import {
  AlertOctagon,
  Store,
  ArrowRight,
  ShieldAlert,
  Globe,
  Sparkles,
  Lock,
  CheckCircle2,
} from 'lucide-react';

interface UnknownStoreFallbackProps {
  slug: string;
  isSuspended?: boolean;
  storeName?: string;
  onCreateAccountForSlug: (requestedSlug: string) => void;
  onNavigateToLanding: () => void;
  onNavigateToSuperAdmin: () => void;
  onSwitchToActiveStore: (slug: string) => void;
}

export const UnknownStoreFallback: React.FC<UnknownStoreFallbackProps> = ({
  slug,
  isSuspended = false,
  storeName,
  onCreateAccountForSlug,
  onNavigateToLanding,
  onNavigateToSuperAdmin,
  onSwitchToActiveStore,
}) => {
  const cleanSlug = slug || 'notexist';
  const targetCtaUrl = `https://mypos.com#pricing?requestedSlug=${encodeURIComponent(cleanSlug)}`;

  if (isSuspended) {
    return (
      <div className="min-h-[calc(100vh-44px)] bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900/90 border border-rose-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-56 h-56 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-rose-400 block">
                HTTP 403 • Middleware Access Revoked
              </span>
              <h1 className="text-2xl font-bold text-white">Store Suspended</h1>
            </div>
          </div>

          <p className="text-slate-300 text-base leading-relaxed mb-6">
            Access to{' '}
            <span className="font-mono font-semibold text-white bg-slate-800 px-2 py-0.5 rounded">
              {cleanSlug}.mypos.com
            </span>{' '}
            ({storeName || cleanSlug}) has been suspended by platform administration. All POS
            terminal sessions and API queries for this tenant are currently locked.
          </p>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 mb-6 text-xs font-mono text-slate-400 space-y-1.5">
            <div className="flex justify-between">
              <span>SUBDOMAIN:</span>
              <span className="text-rose-400">{cleanSlug}.mypos.com</span>
            </div>
            <div className="flex justify-between">
              <span>TENANT STATUS:</span>
              <span className="text-rose-400 font-bold">SUSPENDED</span>
            </div>
            <div className="flex justify-between">
              <span>ENFORCEMENT:</span>
              <span className="text-slate-300">Edge Middleware + JWT Guard</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onNavigateToSuperAdmin}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/25 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              Open SuperAdmin C-Panel to Re-Activate
            </button>
            <button
              onClick={() => onSwitchToActiveStore('stepsync')}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition cursor-pointer"
            >
              Switch to Active Store
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-44px)] bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 md:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-28 -right-28 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-28 -left-28 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Status Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
            <AlertOctagon className="w-3.5 h-3.5" />
            404 TENANT • UNKNOWN SUBDOMAIN
          </div>
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            https://{cleanSlug}.mypos.com
          </span>
        </div>

        {/* Main 404 Heading & Required Copy */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center text-amber-400 shrink-0">
            <Store className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
              Store Not Found
            </h1>
            <p className="text-base md:text-lg text-slate-300 leading-relaxed">
              The store <span className="font-mono font-semibold text-amber-300">'{cleanSlug}'</span>{' '}
              does not exist or has been removed.
            </p>
          </div>
        </div>

        {/* Subdomain Availability Card */}
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-5 mb-7">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Subdomain Available for Instant Registration
            </span>
            <span className="text-xs font-mono text-slate-400">
              {cleanSlug}.mypos.com
            </span>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Want to launch your retail footwear POS terminal on{' '}
            <strong className="text-slate-200">{cleanSlug}.mypos.com</strong>? Claim this subdomain
            now with dedicated tenant database isolation, custom brand PWA manifest, and barcode
            inventory management.
          </p>
        </div>

        {/* High-Visibility CTA Button required by spec */}
        <div className="space-y-3">
          <a
            href={targetCtaUrl}
            onClick={(e) => {
              e.preventDefault();
              onCreateAccountForSlug(cleanSlug);
            }}
            className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-base shadow-xl shadow-amber-500/20 transition transform hover:-translate-y-0.5 cursor-pointer"
          >
            <Sparkles className="w-5 h-5" />
            <span>Create POS Account for '{cleanSlug}'</span>
            <ArrowRight className="w-5 h-5" />
          </a>

          <div className="text-center">
            <span className="text-[11px] font-mono text-slate-500">
              Redirects to: {targetCtaUrl}
            </span>
          </div>
        </div>

        {/* Secondary Navigation Actions */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            onClick={onNavigateToLanding}
            className="text-slate-400 hover:text-white font-medium transition cursor-pointer"
          >
            ← Back to mypos.com Landing Page
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSwitchToActiveStore('stepsync')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition cursor-pointer"
            >
              Visit stepsync.mypos.com
            </button>
            <button
              onClick={onNavigateToSuperAdmin}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-medium transition cursor-pointer"
            >
              SuperAdmin C-Panel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
