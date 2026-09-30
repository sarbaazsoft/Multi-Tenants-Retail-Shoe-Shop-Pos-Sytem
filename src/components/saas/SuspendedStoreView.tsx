import React from 'react';
import { ShieldOff, Lock, ArrowLeft, Shield, KeyRound, Calendar, Clock } from 'lucide-react';
import type { TenantInfo } from '../../types';

interface SuspendedStoreViewProps {
  tenant: TenantInfo | null;
  requestedSlug: string;
  isExpired?: boolean;
  onGoToLanding: () => void;
  onGoToSuperAdmin: () => void;
  onOpenStoreSettings?: () => void;
}

export const SuspendedStoreView: React.FC<SuspendedStoreViewProps> = ({
  tenant,
  requestedSlug,
  isExpired = false,
  onGoToLanding,
  onGoToSuperAdmin,
  onOpenStoreSettings,
}) => {
  const slug = tenant?.slug || requestedSlug || 'store';
  const storeName = tenant?.name || slug;
  const expired =
    isExpired ||
    tenant?.subscriptionStatus === 'EXPIRED' ||
    tenant?.status === 'EXPIRED' ||
    Boolean(tenant?.subscriptionEndDate && new Date(tenant.subscriptionEndDate).getTime() < Date.now());

  const formattedExpiry = tenant?.subscriptionEndDate
    ? new Date(tenant.subscriptionEndDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'N/A';

  const planLabel =
    tenant?.subscriptionPlan === '6_MONTHS' ? '6 Months' : 'Yearly';

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono uppercase">
            <Lock className="w-3.5 h-3.5" />
            {expired ? 'HTTP 403 • Subscription Expired' : 'HTTP 403 • Store Suspended'}
          </span>
          <span className="text-xs font-mono text-slate-400">{slug}.mypos.com</span>
        </div>

        <div className="w-14 h-14 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mb-6">
          {expired ? (
            <Clock className="w-7 h-7 text-rose-400" />
          ) : (
            <ShieldOff className="w-7 h-7 text-rose-400" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          {expired ? 'Subscription Key Expired' : 'Store Suspended'}
        </h1>

        {expired ? (
          <div className="mb-6 space-y-3">
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm font-semibold">
              Your subscription key has expired. Please contact support to renew.
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              POS &amp; Dashboard access for <span className="font-semibold text-white">{storeName}</span> (
              <span className="font-mono text-rose-300">{slug}.mypos.com</span>) is restricted until the store subscription key is renewed by platform administration.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            Access to <span className="font-semibold text-white">{storeName}</span> (
            <span className="font-mono text-rose-300">{slug}.mypos.com</span>) has been temporarily suspended by the platform SuperAdmin. All POS terminals, inventory APIs, and staff sessions for this tenant are locked.
          </p>
        )}

        {/* Subscription & App Key Summary Card */}
        {tenant && (
          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4 mb-5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                App Key:
              </span>
              <span className="font-mono font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                {tenant.appKey || 'APP-KEY-PENDING'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Plan &amp; Expiry Date:
              </span>
              <span className="font-mono text-slate-200">
                {planLabel} • {formattedExpiry}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Subscription Status:</span>
              <span className="font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                {expired ? 'EXPIRED' : tenant.subscriptionStatus || tenant.status}
              </span>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 text-xs text-slate-400 mb-6">
          If you are the store owner or platform administrator, you can renew the subscription key or reactivate this tenant immediately from the <strong className="text-slate-200">SuperAdmin Control Panel</strong> (<span className="font-mono">mypos.com/admin</span>).
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {expired && onOpenStoreSettings && (
            <button
              type="button"
              onClick={onOpenStoreSettings}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              Store Owner: Renew in Settings
            </button>
          )}
          <button
            type="button"
            onClick={onGoToSuperAdmin}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            <Shield className="w-4 h-4" />
            {expired ? 'Renew Key in SuperAdmin' : 'Reactivate in SuperAdmin'}
          </button>
          <button
            type="button"
            onClick={onGoToLanding}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Root Domain
          </button>
        </div>
      </div>
    </div>
  );
};
