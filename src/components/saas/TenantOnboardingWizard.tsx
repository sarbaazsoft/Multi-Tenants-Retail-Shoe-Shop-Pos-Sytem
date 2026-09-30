import React, { useState, useEffect } from 'react';
import {
  Building2,
  Palette,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Smartphone,
  Package,
  Upload,
  ReceiptText,
  Barcode,
  Percent,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  Sparkles,
  Lock,
} from 'lucide-react';
import { api, setAuthSession } from '../../services/api';
import { ShowroomBackground } from '../common/ShowroomBackground';
import { PublicHeader } from '../common/PublicHeader';
import { PublicFooter } from '../common/PublicFooter';
import { toTitleCaseLive, toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat';
import type { User } from '../../types';

interface TenantOnboardingWizardProps {
  slug: string;
  onCompleted: (slug: string, user?: User | null, token?: string | null, settings?: any) => void;
  onCancel: () => void;
  isRequiredFirstLogin?: boolean;
}

interface StarterProductInput {
  name: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
}

const PRESET_COLORS = [
  { name: 'Royal Violet', hex: '#7C3AED' },
  { name: 'Emerald Retail', hex: '#059669' },
  { name: 'Indigo Pro', hex: '#4F46E5' },
  { name: 'Crimson Boutique', hex: '#E11D48' },
  { name: 'Amber Craft', hex: '#D97706' },
  { name: 'Ocean Cyan', hex: '#0284C7' },
];

export const TenantOnboardingWizard: React.FC<TenantOnboardingWizardProps> = ({
  slug,
  onCompleted,
  onCancel,
  isRequiredFirstLogin = false,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  // 1. Invoice Prefix, Barcode Prefix / Settings & Inventory Defaults
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [purchasePrefix, setPurchasePrefix] = useState('PUR-');
  const [barcodePrefix, setBarcodePrefix] = useState('0108923');
  const [lowStockLimit, setLowStockLimit] = useState(5);
  const [pricingMode, setPricingMode] = useState<'FIXED' | 'NEGOTIABLE'>('FIXED');

  // 2. Store Contact Details & Address
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // 3. Tax Rates, Currency & Receipt Footer Notes
  const [currency, setCurrency] = useState('PKR');
  const [taxRate, setTaxRate] = useState<number>(0);
  const [taxId, setTaxId] = useState('');
  const [strn, setStrn] = useState('');
  const [invoiceFooter, setInvoiceFooter] = useState(
    'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.'
  );

  // 4. Optional PWA Brand Theme & Starter Catalog
  const [themeColor, setThemeColor] = useState('#7C3AED');
  const [backgroundColor, setBackgroundColor] = useState('#0F172A');
  const [logoUrl, setLogoUrl] = useState('/pwa-512x512.png');
  const [adminPassword, setAdminPassword] = useState('');
  const [initialProducts, setInitialProducts] = useState<StarterProductInput[]>([]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.saas
      .getOnboarding(slug)
      .then((res) => {
        if (!mounted) return;
        const t = res.tenant;
        if (t) {
          setStoreName(t.name || '');
          setOwnerName(t.ownerName || 'Store Owner');
          setOwnerEmail(t.ownerEmail || '');
          setPhone(t.ownerPhone || '');
          setAddress(t.address || '');
          setTaxId(t.taxId || '');
          setStrn(t.strn || '');
          setTaxRate(Number(t.taxRate) || 0);
          setCurrency(t.currency || 'PKR');
          setInvoicePrefix(t.invoicePrefix || 'INV-');
          setPurchasePrefix(t.purchasePrefix || 'PUR-');
          setBarcodePrefix(t.barcodePrefix || '0108923');
          setInvoiceFooter(
            t.invoiceFooter ||
              'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.'
          );
          setLowStockLimit(Number(t.lowStockLimit) || 5);
          setPricingMode(t.pricingMode === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED');
          setThemeColor(t.themeColor || '#7C3AED');
          setBackgroundColor(t.backgroundColor || '#0F172A');
          setLogoUrl(t.logoUrl || '/pwa-512x512.png');
          setAlreadyCompleted(Boolean(t.onboardingCompleted || (t as any).isLocked));
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to load store onboarding configuration.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [slug]);

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddProductRow = () => {
    setInitialProducts((prev) => [
      ...prev,
      {
        name: '',
        brand: 'StepSync',
        category: 'Sneakers',
        size: '42',
        color: 'Black',
        purchasePrice: 2200,
        sellingPrice: 3800,
        stock: 12,
      },
    ]);
  };

  const handleRemoveProductRow = (idx: number) => {
    setInitialProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFinishOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (alreadyCompleted) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.saas.completeOnboarding(slug, {
        storeName: toTitleCaseTrimmed(storeName),
        address: toTitleCaseTrimmed(address),
        phone: phone.trim(),
        email: toLowerTrimmed(ownerEmail),
        taxId: taxId.trim(),
        strn: strn.trim(),
        taxRate,
        currency,
        invoicePrefix: invoicePrefix.trim(),
        purchasePrefix: purchasePrefix.trim(),
        barcodePrefix: barcodePrefix.trim(),
        invoiceFooter: toTitleCaseTrimmed(invoiceFooter),
        lowStockLimit,
        pricingMode,
        themeColor,
        backgroundColor,
        logoUrl,
        adminPassword: adminPassword.trim() || undefined,
        initialProducts: initialProducts
          .filter((p) => p.name.trim().length > 0)
          .map((p) => ({
            ...p,
            name: toTitleCaseTrimmed(p.name),
            brand: toTitleCaseTrimmed(p.brand),
            category: toTitleCaseTrimmed(p.category),
            color: toTitleCaseTrimmed(p.color),
          })),
      });

      setAlreadyCompleted(true);
      if (res.token && res.user) {
        setAuthSession(res.token, res.user);
      }
      onCompleted(slug, res.user, res.token, res.settings);
    } catch (err: any) {
      setError(err.message || 'Failed to save initial store setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-900 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <ShowroomBackground />

      <PublicHeader
        storeName={`${storeName || slug} — Initial Store Setup`}
        badgeText={alreadyCompleted ? 'Setup Locked' : 'Owner Onboarding'}
        badgeVariant={alreadyCompleted ? 'locked' : 'setup'}
        subtitle={
          alreadyCompleted
            ? 'Initial Store Setup & POS Defaults Sealed'
            : 'First-Time Store Owner Configuration'
        }
        dbText="PostgreSQL • Tenant Isolated"
      />

      <main className="relative z-10 w-full flex-1 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="app-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 rounded-3xl p-10 text-center shadow-2xl">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                Loading Initial Store Setup...
              </div>
            </div>
          ) : alreadyCompleted ? (
            <div
              id="tenant-onboarding-locked-card"
              className="app-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-emerald-200/80 dark:border-emerald-800/70 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-700/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-bold mb-1.5">
                      <Lock className="w-3 h-3" />
                      <span>Initial Store Setup &amp; POS Defaults Locked</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      Initial Store Setup &amp; POS Defaults
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Store setup for <strong>{storeName || slug}</strong> has already been completed by the Store Owner. To protect active POS invoice sequences, barcode standards, currency, and counter pricing rules, Initial Store Setup &amp; POS Defaults is permanently locked.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onCancel}
                  className="self-start sm:self-center inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md transition cursor-pointer shrink-0"
                >
                  <span>Open Store POS Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Locked POS Defaults Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                    <span>Store Identity</span>
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {storeName || slug}
                  </div>
                  <div className="text-xs font-mono text-purple-600 dark:text-purple-300 truncate">
                    {ownerName}
                  </div>
                  {phone && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      Tel: {phone}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                    <span>Document &amp; Barcode Prefixes</span>
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    Invoice: <span className="text-purple-600 dark:text-purple-300">{invoicePrefix}</span> • Purchase:{' '}
                    <span className="text-purple-600 dark:text-purple-300">{purchasePrefix}</span>
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    Barcode Prefix: <span className="text-emerald-600 dark:text-emerald-400">{barcodePrefix}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Low Stock Alert: {lowStockLimit} Pairs
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                    <span>Pricing &amp; Currency Policy</span>
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {pricingMode === 'NEGOTIABLE'
                      ? 'Negotiable Price Policy (NEGOTIABLE)'
                      : 'Fixed Retail Price Policy (FIXED)'}
                  </div>
                  <div className="text-xs font-mono text-slate-700 dark:text-slate-300">
                    Currency: <strong>{currency}</strong> • Sales Tax: <strong>{taxRate}%</strong>
                  </div>
                  {taxId && (
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      Tax ID: {taxId}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Commissioning Guard Active:</strong> Initial Store Setup &amp; POS Defaults is locked after first-time owner setup. Contact details, receipt logo, and printer hardware can be managed inside the Owner Portal under <strong>Settings</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shrink-0 cursor-pointer transition"
                >
                  Return to Dashboard →
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Top Welcome & Required Setup Notice */}
              <div className="app-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-600/25">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-semibold text-purple-600 dark:text-purple-300">
                        Welcome, {ownerName}
                      </div>
                      <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        Initial Store Setup &amp; POS Defaults
                      </h1>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        Configure your store&apos;s invoice &amp; barcode prefixes, contact address, and tax/receipt rules to unlock your full Owner Portal (Staff Management, Catalog, Sales, Returns &amp; Purchases).
                      </p>
                    </div>
                  </div>

                  {alreadyCompleted && !isRequiredFirstLogin && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="self-start sm:self-center px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer shrink-0"
                    >
                      Return to Dashboard →
                    </button>
                  )}
                </div>

                {/* 3-Step Interactive Progress Tabs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-5 pt-5 border-t border-slate-200/80 dark:border-purple-900/50">
                  {[
                    {
                      num: 1,
                      title: '1. Invoices, Barcodes & Contact',
                      subtitle: 'Prefixes, Address & Phone',
                      icon: Barcode,
                    },
                    {
                      num: 2,
                      title: '2. Taxes & Receipt Footer',
                      subtitle: 'Tax Rate, NTN/STRN & Notes',
                      icon: ReceiptText,
                    },
                    {
                      num: 3,
                      title: '3. Branding & Quick Launch',
                      subtitle: 'PWA Theme & Optional SKUs',
                      icon: Palette,
                    },
                  ].map((s) => {
                    const Icon = s.icon;
                    const active = step === s.num;
                    const done = step > s.num;
                    return (
                      <button
                        key={s.num}
                        type="button"
                        onClick={() => setStep(s.num as 1 | 2 | 3)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-purple-50/90 dark:bg-purple-950/50 border-purple-500 shadow-sm'
                            : done
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-500/40'
                            : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-300">
                            {done ? 'CONFIGURED' : `STEP 0${s.num}`}
                          </span>
                          {done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Icon className="w-4 h-4 text-purple-600 dark:text-purple-300" />
                          )}
                        </div>
                        <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                          {s.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {s.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="mb-5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs font-medium shadow-md">
                  {error}
                </div>
              )}

              <form
                onSubmit={handleFinishOnboarding}
                className="app-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-900 dark:text-slate-100"
              >
                {/* STEP 1: INVOICE PREFIX, BARCODE SETTINGS & STORE CONTACT / ADDRESS */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Barcode className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span>Invoice Prefix, Barcode Settings &amp; Store Contact Details</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Configure numbering prefixes for POS sales/purchases, barcode generation defaults, and your store&apos;s physical address.
                      </p>
                    </div>

                    {/* Numbering & Barcode Settings */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-purple-900/40 space-y-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                        Document &amp; Barcode Prefixes
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Invoice Prefix *
                          </label>
                          <input
                            type="text"
                            required
                            value={invoicePrefix}
                            onChange={(e) => setInvoicePrefix(e.target.value)}
                            placeholder="INV-"
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                          <span className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 block">
                            Example: <code className="font-mono">{invoicePrefix || 'INV-'}00001</code>
                          </span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Barcode Prefix *
                          </label>
                          <input
                            type="text"
                            required
                            value={barcodePrefix}
                            onChange={(e) => setBarcodePrefix(e.target.value)}
                            placeholder="0108923"
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                          <span className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 block">
                            Used for auto-generated shoe SKU labels
                          </span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Purchase Prefix
                          </label>
                          <input
                            type="text"
                            value={purchasePrefix}
                            onChange={(e) => setPurchasePrefix(e.target.value)}
                            placeholder="PUR-"
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                          <span className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 block">
                            Supplier stock receiving bills
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Low Stock Alert Threshold (Pairs)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={lowStockLimit}
                            onChange={(e) => setLowStockLimit(Math.max(1, Number(e.target.value) || 5))}
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Counter Pricing Mode
                          </label>
                          <select
                            value={pricingMode}
                            onChange={(e) =>
                              setPricingMode(e.target.value === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED')
                            }
                            className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                          >
                            <option value="FIXED">Fixed Retail Price (Standard Barcode Checkout)</option>
                            <option value="NEGOTIABLE">Negotiable Price Range (Min / Max Bargaining)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Store Contact Details & Address */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-purple-900/40 space-y-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Store Contact Details &amp; Physical Address</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Store Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={storeName}
                            onChange={(e) => setStoreName(toTitleCaseLive(e.target.value))}
                            placeholder="Apex Footwear"
                            className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Store Contact Phone *
                          </label>
                          <div className="relative">
                            <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              required
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="+92 300 1234567"
                              className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Official Store Email
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="email"
                              value={ownerEmail}
                              onChange={(e) => setOwnerEmail(e.target.value)}
                              placeholder="Enter official store email"
                              className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Store Physical Address (Printed on Receipts) *
                        </label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <textarea
                            rows={2}
                            required
                            value={address}
                            onChange={(e) => setAddress(toTitleCaseLive(e.target.value))}
                            placeholder="Shop #14, Ground Floor, Dolmen Mall Clifton, Karachi"
                            className="app-input capitalize w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{saving ? 'Saving...' : 'Save & Launch Portal Now'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer"
                      >
                        <span>Next: Tax Rates &amp; Receipt Footer</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: TAX RATES, CURRENCY & RECEIPT FOOTER NOTES */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <ReceiptText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span>Tax Rates, Currency &amp; Receipt Footer Notes</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Configure tax percentages, registration numbers, currency, and custom return/exchange notes printed at the bottom of every customer receipt.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Store Currency *
                        </label>
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                          className="app-input w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                        >
                          <option value="PKR">PKR (Rs. — Pakistani Rupee)</option>
                          <option value="USD">USD ($ — US Dollar)</option>
                          <option value="AED">AED (AED — UAE Dirham)</option>
                          <option value="SAR">SAR (SAR — Saudi Riyal)</option>
                          <option value="GBP">GBP (£ — British Pound)</option>
                          <option value="EUR">EUR (€ — Euro)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Sales Tax / GST Rate (%)
                        </label>
                        <div className="relative">
                          <Percent className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={taxRate}
                            onChange={(e) => setTaxRate(Math.max(0, Number(e.target.value) || 0))}
                            placeholder="0"
                            className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Tax ID / NTN Number
                        </label>
                        <input
                          type="text"
                          value={taxId}
                          onChange={(e) => setTaxId(e.target.value)}
                          placeholder="NTN-4829104-7"
                          className="app-input w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          STRN / Sales Tax Registration No.
                        </label>
                        <input
                          type="text"
                          value={strn}
                          onChange={(e) => setStrn(e.target.value)}
                          placeholder="STRN-327789012"
                          className="app-input w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Receipt Footer Notes &amp; Exchange Policy *
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={invoiceFooter}
                        onChange={(e) => setInvoiceFooter(toTitleCaseLive(e.target.value))}
                        placeholder="Thank you for shopping with us! Exchanges accepted within 7 days with original receipt."
                        className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                      />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                        Printed automatically at the bottom of every thermal POS receipt.
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-purple-900/40">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{saving ? 'Saving...' : 'Complete Setup Now'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setStep(3)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer"
                        >
                          <span>Next: Branding &amp; Catalog</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: OPTIONAL PWA BRANDING & STARTER FOOTWEAR CATALOG */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span>Store Branding &amp; Optional Starter Inventory</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Customize your store&apos;s standalone PWA theme color and logo, or add starter shoe articles before entering the full Owner Portal.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                      <div className="md:col-span-7 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            PWA Brand Theme Color
                          </label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {PRESET_COLORS.map((preset) => (
                              <button
                                key={preset.hex}
                                type="button"
                                onClick={() => setThemeColor(preset.hex)}
                                className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                                  themeColor.toLowerCase() === preset.hex.toLowerCase()
                                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/60 text-purple-900 dark:text-white'
                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span
                                  className="w-3.5 h-3.5 rounded-full shrink-0"
                                  style={{ backgroundColor: preset.hex }}
                                />
                                <span className="truncate">{preset.name}</span>
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={themeColor}
                              onChange={(e) => setThemeColor(e.target.value)}
                              className="w-11 h-10 rounded-lg bg-transparent border border-slate-300 dark:border-slate-700 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={themeColor}
                              onChange={(e) => setThemeColor(e.target.value)}
                              className="app-input flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            Store Logo URL or Upload
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={logoUrl}
                              onChange={(e) => setLogoUrl(e.target.value)}
                              placeholder="/pwa-512x512.png"
                              className="app-input flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-xs font-mono"
                            />
                            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer shrink-0">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoFileUpload}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-600 dark:text-purple-300 mb-2.5">
                          <Smartphone className="w-4 h-4" />
                          <span>Receipt &amp; PWA Preview</span>
                        </div>

                        <div
                          className="rounded-xl p-3.5 mb-3 flex items-center gap-3 border border-white/10"
                          style={{ backgroundColor: themeColor }}
                        >
                          <img
                            src={logoUrl || '/pwa-512x512.png'}
                            alt="Store Icon"
                            className="w-11 h-11 rounded-xl bg-slate-950/30 object-contain p-1"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/pwa-512x512.png';
                            }}
                          />
                          <div className="text-white min-w-0">
                            <div className="font-bold text-sm truncate">{storeName || slug}</div>
                            <div className="text-[11px] opacity-90 font-mono truncate">
                              Invoice: {invoicePrefix}00001 • Barcode: {barcodePrefix}
                            </div>
                            <div className="text-[11px] opacity-90 font-mono truncate">
                              Tax: {taxRate}% • Currency: {currency}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Optional Starter Footwear Articles */}
                    <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-purple-900/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Optional Starter Footwear Articles
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddProductRow}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-purple-700 dark:text-purple-300 text-xs font-bold cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Starter Shoe Article</span>
                        </button>
                      </div>

                      {initialProducts.length > 0 && (
                        <div className="space-y-2.5">
                          {initialProducts.map((prod, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 items-center"
                            >
                              <div className="sm:col-span-4">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Shoe Model / Article
                                </label>
                                <input
                                  type="text"
                                  value={prod.name}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].name = toTitleCaseLive(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  placeholder="e.g. Classic Leather Loafer"
                                  className="capitalize w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Brand
                                </label>
                                <input
                                  type="text"
                                  value={prod.brand}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].brand = toTitleCaseLive(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="capitalize w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Cost ({currency})
                                </label>
                                <input
                                  type="number"
                                  value={prod.purchasePrice}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].purchasePrice = Number(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Retail ({currency})
                                </label>
                                <input
                                  type="number"
                                  value={prod.sellingPrice}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].sellingPrice = Number(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                                />
                              </div>

                              <div className="sm:col-span-1">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Qty
                                </label>
                                <input
                                  type="number"
                                  value={prod.stock}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].stock = Number(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                                />
                              </div>

                              <div className="sm:col-span-1 flex justify-end pt-3">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProductRow(idx)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-purple-900/40">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>

                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-emerald-600/25 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {saving
                            ? 'Finalizing Store Setup...'
                            : `Complete Store Setup & Unlock Owner Portal`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
