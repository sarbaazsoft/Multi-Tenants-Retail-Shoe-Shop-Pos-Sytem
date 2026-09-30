import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Package,
  Truck,
  Printer,
  Users,
  BarChart3,
  ShieldCheck,
  Settings,
  ArrowRight,
  Check,
  Play,
  Calendar,
  ChevronRight,
  WifiOff,
  Store,
  ThumbsUp,
  X,
  Building2,
  Mail,
  User,
  Phone,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../services/api';
import { toTitleCaseLive, toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat';
import type { TenantInfo } from '../../types';
import shoeStoreBg from '../../assets/images/shoe_store_blurred_bg_1790706924465.jpg';
import whiteSneakerHero from '../../assets/images/white_sneaker_hero_1790706939810.jpg';

interface SaasLandingPageProps {
  initialRequestedSlug?: string;
  availableTenants: TenantInfo[];
  onOpenStore: (slug: string) => void;
  onOpenSuperAdmin: () => void;
  onOpenOnboarding: (slug: string) => void;
  onTestUnknownSubdomain: (slug: string) => void;
}

export const SaasLandingPage: React.FC<SaasLandingPageProps> = ({
  initialRequestedSlug = '',
  availableTenants,
  onOpenStore,
  onOpenSuperAdmin,
  onOpenOnboarding,
  onTestUnknownSubdomain,
}) => {
  const [activeNav, setActiveNav] = useState<'home' | 'features' | 'stores' | 'pricing' | 'about'>('home');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showStoresModal, setShowStoresModal] = useState(false);

  // Store request form states
  const [storeName, setStoreName] = useState('');
  const [requestedSlug, setRequestedSlug] = useState(initialRequestedSlug);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [plan, setPlan] = useState('1_YEAR_RS_18000');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{
    message: string;
    requestedSlug: string;
  } | null>(null);

  useEffect(() => {
    if (initialRequestedSlug) {
      setRequestedSlug(initialRequestedSlug);
      if (!storeName) {
        const formatted = initialRequestedSlug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        setStoreName(`${formatted} Shoes`);
      }
      setShowRequestModal(true);
    }
  }, [initialRequestedSlug]);

  const handleSlugChange = (val: string) => {
    const clean = val
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');
    setRequestedSlug(clean);
  };

  const openGetStartedWithPlan = (selectedPlan: string) => {
    setPlan(selectedPlan);
    setSubmitError(null);
    setShowRequestModal(true);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitting(true);
    try {
      const res = await api.saas.submitStoreRequest({
        storeName: toTitleCaseTrimmed(storeName),
        requestedSlug: toLowerTrimmed(requestedSlug),
        ownerName: toTitleCaseTrimmed(ownerName),
        ownerEmail: toLowerTrimmed(ownerEmail),
        ownerPhone: ownerPhone.trim(),
        plan,
      });
      setSubmitSuccess({
        message: res.message,
        requestedSlug: res.requestedSlug,
      });
      setStoreName('');
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPhone('');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit store request.');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToSection = (id: string, navKey: 'home' | 'features' | 'stores' | 'pricing' | 'about') => {
    setActiveNav(navKey);
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const featureItems = [
    {
      title: 'POS & Sales Operations',
      desc: 'Fast billing, offline support, barcode scanning, returns and exchanges.',
      icon: ShoppingCart,
      iconBg: 'bg-[#EBF3FF]',
      iconColor: 'text-[#0066FF]',
    },
    {
      title: 'Inventory Management',
      desc: 'Fixed pricing, stock ledger, adjustments and simplified product forms.',
      icon: Package,
      iconBg: 'bg-[#E6F8EF]',
      iconColor: 'text-[#10B981]',
    },
    {
      title: 'Purchases & Suppliers',
      desc: 'Supplier khata, purchase orders and supplier returns.',
      icon: Truck,
      iconBg: 'bg-[#FFEBEB]',
      iconColor: 'text-[#EF4444]',
    },
    {
      title: 'Hardware & Printing',
      desc: 'Thermal receipts, barcode labels and direct hardware control.',
      icon: Printer,
      iconBg: 'bg-[#F3E8FF]',
      iconColor: 'text-[#8B5CF6]',
    },
    {
      title: 'Customers & Returns',
      desc: 'Customer profiles, sales returns and POS exchanges.',
      icon: Users,
      iconBg: 'bg-[#E6F8EF]',
      iconColor: 'text-[#10B981]',
    },
    {
      title: 'Reports & Analytics',
      desc: 'Sales, profit, inventory valuation and low-stock alerts.',
      icon: BarChart3,
      iconBg: 'bg-[#FFF4E5]',
      iconColor: 'text-[#F59E0B]',
    },
    {
      title: 'Security & User Management',
      desc: 'Role-based access, secure accounts and automated backups.',
      icon: ShieldCheck,
      iconBg: 'bg-[#EBF3FF]',
      iconColor: 'text-[#0066FF]',
    },
    {
      title: 'Store Settings & Branding',
      desc: 'Store setup wizard, invoice settings and multi-store management.',
      icon: Settings,
      iconBg: 'bg-[#F1F5F9]',
      iconColor: 'text-[#475569]',
    },
  ];

  const handlePreviewStoreClick = () => {
    if (availableTenants.length > 0 && availableTenants[0]?.slug) {
      onOpenStore(availableTenants[0].slug);
    } else {
      openGetStartedWithPlan('1_YEAR_RS_18000');
    }
  };

  const pakistanStores = [
    {
      brand: 'Bata',
      city: 'Lahore',
      renderLogo: () => (
        <span className="font-serif italic font-black text-2xl tracking-tight text-[#E11D2E]">
          Bata
        </span>
      ),
    },
    {
      brand: 'stylo',
      city: 'Karachi',
      renderLogo: () => (
        <span className="font-sans font-extrabold text-2xl tracking-tight text-[#C81E68]">
          stylo
        </span>
      ),
    },
    {
      brand: 'Clarks',
      city: 'Islamabad',
      renderLogo: () => (
        <span className="font-serif italic font-bold text-2xl tracking-tight text-[#0F172A]">
          Clarks
        </span>
      ),
    },
    {
      brand: 'NIKE',
      city: 'Faisalabad',
      renderLogo: () => (
        <div className="flex flex-col items-center leading-none">
          <span className="font-sans italic font-black text-lg tracking-tighter text-[#0F172A]">
            NIKE
          </span>
          <svg viewBox="0 0 60 18" className="w-11 h-3.5 fill-[#0F172A] -mt-0.5">
            <path d="M16.5 15.2c-4.2 1.2-7.6.2-9.2-2.2-1.6-2.4-.5-6.4 2.5-9.8-1.2 3.2-.8 5.9 1.2 7.1 2 1.1 5.6.7 10.2-1.1L56 1.5 16.5 15.2z" />
          </svg>
        </div>
      ),
    },
    {
      brand: 'Servis',
      city: 'Multan',
      renderLogo: () => (
        <span className="font-serif italic font-extrabold text-2xl tracking-tight text-[#DC2626]">
          Servis
        </span>
      ),
    },
    {
      brand: 'Borjan',
      city: 'Rawalpindi',
      renderLogo: () => (
        <span className="inline-block px-2.5 py-0.5 rounded bg-[#1E3A8A] text-[#FACC15] font-extrabold text-base tracking-tight">
          Borjan
        </span>
      ),
    },
    {
      brand: 'Footwear World',
      city: 'Peshawar',
      renderLogo: () => (
        <div className="flex flex-col items-center leading-none text-[#0F172A] font-extrabold text-sm">
          <span>Footwear</span>
          <span>World</span>
        </div>
      ),
    },
    {
      brand: 'NDURE',
      city: 'Quetta',
      renderLogo: () => (
        <span className="font-sans font-black text-lg tracking-wider text-[#DC2626]">
          NDURE
        </span>
      ),
    },
  ];

  const posMockShoes = [
    { name: 'Running Shoes', brand: 'Nike', price: 'Rs. 4,999', color: '#1E293B' },
    { name: 'Sports Sneakers', brand: 'Adidas', price: 'Rs. 6,500', color: '#1D4ED8' },
    { name: 'Casual Loafers', brand: 'Clarks', price: 'Rs. 5,400', color: '#78350F' },
    { name: 'Pro Trainers', brand: 'Skechers', price: 'Rs. 7,200', color: '#334155' },
    { name: 'Oxford Formal', brand: 'Bata', price: 'Rs. 5,200', color: '#451A03' },
    { name: 'Leather Moccasin', brand: 'Hush', price: 'Rs. 6,800', color: '#92400E' },
    { name: 'Classic Derby', brand: 'Borjan', price: 'Rs. 4,800', color: '#111827' },
    { name: 'Comfort Sandal', brand: 'Servis', price: 'Rs. 3,499', color: '#3F3F46' },
    { name: 'Mesh Runner', brand: 'NDURE', price: 'Rs. 4,200', color: '#B91C1C' },
    { name: 'Retro Court', brand: 'Puma', price: 'Rs. 5,900', color: '#0F172A' },
    { name: 'Peshawari Heritage', brand: 'Bata', price: 'Rs. 3,800', color: '#7C2D12' },
    { name: 'Slip-On Flex', brand: 'Stylo', price: 'Rs. 3,299', color: '#1E3A8A' },
  ];

  return (
    <div className="min-h-screen bg-white text-[#0A1633] font-sans selection:bg-[#0066FF] selection:text-white">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Left: ShoePOS Brand Lockup */}
          <button
            type="button"
            onClick={() => scrollToSection('top', 'home')}
            className="flex items-center gap-2.5 text-left cursor-pointer group"
          >
            <div className="w-11 h-11 flex items-center justify-center">
              <svg viewBox="0 0 64 42" className="w-11 h-8">
                {/* Running Shoe Silhouette matching reference logo */}
                <path
                  d="M6 31c0-3 2-5 5-6l12-5c3-1.5 6-4.5 8-8 1-1.5 2.8-1.5 3.8 0 1.8 2.8 4.5 5 8.2 5.8l11 2.4c3.5.8 6 3.8 6 7.3 0 2.5-2 4.5-4.5 4.5H10.5C8 37 6 34.5 6 31z"
                  fill="#0A1633"
                />
                <path
                  d="M6 33.5h53.5c1 0 1.8.8 1.8 1.8s-.8 1.7-1.8 1.7H8c-1.5 0-2.5-1-2-3.5z"
                  fill="#0066FF"
                />
                <path
                  d="M23 18l3 2m-6 1.5l3 2m-6 1.5l3 2"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M14 29c7-1 14-3.5 21-8"
                  stroke="#FFFFFF"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-extrabold tracking-tight leading-none">
                <span className="text-[#0A1633]">Shoe</span>
                <span className="text-[#0066FF]">POS</span>
              </div>
              <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                Retail Shoe Shop System
              </div>
            </div>
          </button>

          {/* Center: Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-700">
            <button
              type="button"
              onClick={() => scrollToSection('top', 'home')}
              className={`py-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeNav === 'home'
                  ? 'text-[#0A1633] font-bold border-b-2 border-[#0066FF]'
                  : 'hover:text-[#0066FF]'
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('features', 'features')}
              className={`py-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeNav === 'features'
                  ? 'text-[#0A1633] font-bold border-b-2 border-[#0066FF]'
                  : 'hover:text-[#0066FF]'
              }`}
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('stores', 'stores')}
              className={`py-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeNav === 'stores'
                  ? 'text-[#0A1633] font-bold border-b-2 border-[#0066FF]'
                  : 'hover:text-[#0066FF]'
              }`}
            >
              Stores
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing', 'pricing')}
              className={`py-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeNav === 'pricing'
                  ? 'text-[#0A1633] font-bold border-b-2 border-[#0066FF]'
                  : 'hover:text-[#0066FF]'
              }`}
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('about', 'about')}
              className={`py-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeNav === 'about'
                  ? 'text-[#0A1633] font-bold border-b-2 border-[#0066FF]'
                  : 'hover:text-[#0066FF]'
              }`}
            >
              About
            </button>
          </nav>

          {/* Right: Login & Get Started */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowStoresModal(true)}
              className="px-6 py-2 rounded-lg bg-white hover:bg-blue-50/60 text-[#0A1633] border border-[#3B82F6] text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => openGetStartedWithPlan('1_YEAR_RS_18000')}
              className="px-5 py-2 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shadow-sm shadow-blue-600/25"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#EAF2FF] via-[#F2F7FF] to-[#F8FAFF] border-b border-blue-100/80">
        {/* Right-side blurred shoe store interior photo backdrop */}
        <div className="absolute inset-y-0 right-0 w-full lg:w-[62%] pointer-events-none overflow-hidden">
          <img
            src={shoeStoreBg}
            alt="Retail Shoe Store Interior"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#EAF2FF] via-[#F2F7FF]/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#F4F8FF] via-transparent to-white/40" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-6 items-center">
            {/* Left Column: Value Proposition & CTAs */}
            <div className="lg:col-span-5 space-y-5">
              <div className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-[#D8E9FF] text-[#0052CC] text-xs font-bold tracking-tight">
                Multi-Tenant Shoe Shop POS &amp; Inventory System
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold tracking-tight leading-[1.08] text-[#0A1633]">
                Built for
                <br />
                Shoe Retailers
                <span className="block text-[#0066FF] mt-1">
                  Sell &bull; Manage &bull; Grow
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg font-medium">
                A complete POS and inventory management system designed for single or multiple shoe stores. Fast, reliable and easy to use — online or offline.
              </p>

              {/* Hero Action Buttons */}
              <div className="flex flex-wrap items-center gap-3.5 pt-1">
                <button
                  type="button"
                  onClick={() => openGetStartedWithPlan('1_YEAR_RS_18000')}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition cursor-pointer whitespace-nowrap"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handlePreviewStoreClick}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-white hover:bg-blue-50/70 text-[#0A1633] border border-[#3B82F6] font-bold text-sm shadow-xs transition cursor-pointer whitespace-nowrap"
                >
                  <span className="w-5 h-5 rounded-full border-2 border-[#0A1633] flex items-center justify-center">
                    <Play className="w-2.5 h-2.5 fill-[#0A1633] ml-0.5" />
                  </span>
                  <span>Watch Demo</span>
                </button>
              </div>

              {/* 4 Bottom Trust Feature Badges */}
              <div className="pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-blue-200/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0066FF] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <WifiOff className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold text-[#0A1633] leading-tight truncate">
                      Works Offline
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      PWA Application
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0066FF] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold text-[#0A1633] leading-tight truncate">
                      Multi-Store
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Manage multiple stores
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0066FF] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold text-[#0A1633] leading-tight truncate">
                      Secure &amp; Reliable
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Your data, always safe
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0066FF] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ThumbsUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold text-[#0A1633] leading-tight truncate">
                      Easy to Use
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      For retail teams
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: All-in-One POS Touchscreen + Barcode Scanner + Receipt Printer + Sneaker & Labeled Shoebox */}
            <div className="lg:col-span-7 relative pt-2 pb-12 sm:pb-16">
              {/* Main POS Monitor Frame */}
              <div className="relative mx-auto max-w-[640px] bg-[#0B1324] rounded-2xl p-2.5 sm:p-3.5 shadow-[0_25px_60px_rgba(10,22,51,0.35)] border-[3px] border-slate-800">
                {/* Screen Content */}
                <div className="bg-[#F8FAFC] rounded-xl overflow-hidden border border-slate-700/60">
                  {/* POS Screen Top Bar */}
                  <div className="bg-[#0B1938] text-white px-3.5 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 flex flex-col justify-between">
                        <span className="block h-0.5 bg-white rounded" />
                        <span className="block h-0.5 bg-white rounded" />
                        <span className="block h-0.5 bg-white rounded" />
                      </div>
                      <span className="font-extrabold text-xs tracking-tight">
                        Shoe<span className="text-[#38BDF8]">POS</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-300">
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                        Online
                      </span>
                      <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                        A
                      </span>
                    </div>
                  </div>

                  {/* POS Screen Body: Left Catalog + Right Cart */}
                  <div className="grid grid-cols-12 bg-white">
                    {/* Left Catalog (col-span-8) */}
                    <div className="col-span-8 p-2.5 border-r border-slate-200 space-y-2">
                      {/* Search Bar */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-400">
                        <span>🔍</span>
                        <span>Scan barcode or search products...</span>
                      </div>

                      {/* Category Pills */}
                      <div className="flex items-center gap-1 overflow-hidden text-[9px] font-bold">
                        <span className="px-2 py-0.5 rounded bg-[#0066FF] text-white">All</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">Sneakers</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">Formal</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">Sandals</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">Casual</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">Sports</span>
                      </div>

                      {/* 4x3 Shoe Product Grid */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {posMockShoes.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={handlePreviewStoreClick}
                            className="p-1.5 rounded-lg border border-slate-200/90 bg-white hover:border-blue-400 transition cursor-pointer text-center"
                          >
                            <div className="h-7 flex items-center justify-center">
                              <svg viewBox="0 0 48 24" className="w-9 h-4.5">
                                <path
                                  d="M4 18c0-2 1.5-3.5 4-4l9-3.5c2-1 4-3 5.5-5.5.8-1 2-1 2.8 0 1.2 2 3.2 3.5 6 4l8 1.8c2.5.6 4.2 2.5 4.2 5 0 1.8-1.4 3.2-3.2 3.2H7C5.2 19 4 18.5 4 18z"
                                  fill={item.color}
                                />
                                <rect x="4" y="18" width="39" height="2.2" rx="1" fill="#94A3B8" />
                              </svg>
                            </div>
                            <div className="text-[8px] font-bold text-slate-800 truncate">
                              {item.name}
                            </div>
                            <div className="text-[7px] text-slate-500 font-mono">
                              {item.price}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right Cart Panel (col-span-4) */}
                    <div className="col-span-4 p-2.5 flex flex-col justify-between bg-slate-50/50">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-700 pb-1 border-b border-slate-200">
                          <span>Cart Items (3)</span>
                          <span className="text-blue-600">Clear</span>
                        </div>

                        <div className="p-1.5 rounded bg-white border border-slate-200/80 flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-[8px] font-bold text-slate-800 truncate">
                              Running Shoes
                            </div>
                            <div className="text-[7px] text-slate-400">Size: 42 &bull; Qty: 1</div>
                          </div>
                          <div className="text-[8px] font-bold text-slate-900 font-mono shrink-0">
                            Rs. 4,999
                          </div>
                        </div>

                        <div className="p-1.5 rounded bg-white border border-slate-200/80 flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-[8px] font-bold text-slate-800 truncate">
                              Sports Sneakers
                            </div>
                            <div className="text-[7px] text-slate-400">Size: 43 &bull; Qty: 1</div>
                          </div>
                          <div className="text-[8px] font-bold text-slate-900 font-mono shrink-0">
                            Rs. 6,500
                          </div>
                        </div>

                        <div className="p-1.5 rounded bg-white border border-slate-200/80 flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-[8px] font-bold text-slate-800 truncate">
                              Formal Shoes
                            </div>
                            <div className="text-[7px] text-slate-400">Size: 41 &bull; Qty: 1</div>
                          </div>
                          <div className="text-[8px] font-bold text-slate-900 font-mono shrink-0">
                            Rs. 5,200
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 space-y-1">
                        <div className="flex justify-between text-[8px] text-slate-500">
                          <span>Subtotal</span>
                          <span className="font-mono">Rs. 16,699</span>
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-500">
                          <span>Discount</span>
                          <span className="font-mono">Rs. 0</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-extrabold text-[#0A1633] pt-0.5">
                          <span>Total</span>
                          <span className="font-mono">Rs. 16,699</span>
                        </div>
                        <button
                          type="button"
                          onClick={handlePreviewStoreClick}
                          className="w-full mt-1 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] text-white font-bold text-[9px] shadow-xs transition cursor-pointer"
                        >
                          F9 - Checkout
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Foreground Hardware & Footwear Props Row */}
              <div className="relative z-20 -mt-10 sm:-mt-14 flex items-end justify-between px-2 sm:px-6 pointer-events-none">
                {/* Left: Thermal Receipt Printer with Printed ShoePOS Receipt */}
                <div className="flex items-end gap-3">
                  <div className="w-36 sm:w-44 bg-gradient-to-b from-slate-800 to-slate-950 rounded-t-xl rounded-b-lg p-3 shadow-2xl border border-slate-700 relative">
                    {/* Printed Thermal Receipt Paper */}
                    <div className=" -mt-12 mx-auto w-24 sm:w-28 bg-white text-slate-900 rounded-t-sm p-2 shadow-md border border-slate-200 text-center font-mono">
                      <div className="text-[9px] font-black tracking-tight text-[#0A1633]">
                        ShoePOS
                      </div>
                      <div className="text-[6px] text-slate-400 border-b border-dashed border-slate-300 pb-0.5 mb-1">
                        INV-000482 &bull; CASH
                      </div>
                      <div className="flex justify-between text-[6px]">
                        <span>Running Shoes</span>
                        <span>4,999</span>
                      </div>
                      <div className="flex justify-between text-[6px]">
                        <span>Sports Sneaker</span>
                        <span>6,500</span>
                      </div>
                      <div className="flex justify-between text-[7px] font-bold border-t border-dashed border-slate-300 mt-1 pt-0.5">
                        <span>TOTAL</span>
                        <span>Rs.16,699</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-950 rounded-full my-1.5" />
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-mono text-slate-400">POS-80MM</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                  </div>
                </div>

                {/* Center-Right: White Athletic Sneaker */}
                <div className="hidden sm:block w-44 md:w-52 -mb-2 drop-shadow-[0_16px_24px_rgba(15,23,42,0.28)]">
                  <img
                    src={whiteSneakerHero}
                    alt="White Retail Sneaker"
                    referrerPolicy="no-referrer"
                    className="w-full h-28 object-cover rounded-xl border border-white/80 shadow-lg"
                  />
                </div>

                {/* Far Right: Kraft Cardboard Shoebox with Barcode Sticker Label */}
                <div className="w-44 sm:w-52 bg-gradient-to-br from-[#D6A874] via-[#C6925B] to-[#B07D46] rounded-xl p-2.5 shadow-2xl border border-[#A3703A]">
                  <div className="bg-white rounded-lg p-2 shadow-xs border border-slate-200 text-[#0A1633]">
                    <div className="text-[10px] font-extrabold text-center border-b border-slate-200 pb-0.5">
                      Shoe Store
                    </div>
                    <div className="text-[7px] text-slate-500 mt-0.5">Article #:</div>
                    <div className="text-[10px] font-black leading-none">HS-1021</div>
                    <div className="text-[7px] text-slate-600 truncate">
                      Embellished Thong Flat Sandals
                    </div>
                    <div className="flex justify-between text-[7px] text-slate-500 border-y border-slate-200 my-1 py-0.5">
                      <span>Size: 42</span>
                      <span>Color: White</span>
                    </div>
                    {/* Crisp SVG Barcode Bars */}
                    <svg viewBox="0 0 120 22" className="w-full h-5 fill-slate-950">
                      <rect x="2" y="0" width="2" height="18" />
                      <rect x="6" y="0" width="1" height="18" />
                      <rect x="9" y="0" width="3" height="18" />
                      <rect x="14" y="0" width="1" height="18" />
                      <rect x="17" y="0" width="2" height="18" />
                      <rect x="22" y="0" width="4" height="18" />
                      <rect x="28" y="0" width="1" height="18" />
                      <rect x="31" y="0" width="2" height="18" />
                      <rect x="36" y="0" width="3" height="18" />
                      <rect x="41" y="0" width="1" height="18" />
                      <rect x="44" y="0" width="2" height="18" />
                      <rect x="49" y="0" width="3" height="18" />
                      <rect x="54" y="0" width="1" height="18" />
                      <rect x="57" y="0" width="4" height="18" />
                      <rect x="63" y="0" width="2" height="18" />
                      <rect x="67" y="0" width="1" height="18" />
                      <rect x="70" y="0" width="3" height="18" />
                      <rect x="75" y="0" width="2" height="18" />
                      <rect x="80" y="0" width="1" height="18" />
                      <rect x="83" y="0" width="4" height="18" />
                      <rect x="89" y="0" width="2" height="18" />
                      <rect x="93" y="0" width="1" height="18" />
                      <rect x="96" y="0" width="3" height="18" />
                      <rect x="101" y="0" width="2" height="18" />
                      <rect x="105" y="0" width="1" height="18" />
                      <rect x="108" y="0" width="3" height="18" />
                      <rect x="113" y="0" width="2" height="18" />
                    </svg>
                    <div className="text-[7px] font-mono text-center tracking-widest text-slate-700 -mt-0.5">
                      0108923000012
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FEATURES SECTION */}
      <section id="features" className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            {/* Left Column: Section Heading + 3 Preview Screens */}
            <div className="lg:col-span-5 space-y-5">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#DCEBFF] text-[#0066FF] text-[11px] font-extrabold uppercase tracking-wider">
                FEATURES
              </div>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A1633] tracking-tight leading-[1.15]">
                Everything You Need
                <br />
                to Run Your Shoe Store
              </h2>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                From sales to inventory, suppliers to reports — ShoePOS helps you manage your complete retail business in one powerful platform.
              </p>

              {/* 3 Miniature Feature Preview Cards */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                {/* Preview 1: Executive Dashboard */}
                <div
                  onClick={handlePreviewStoreClick}
                  className="group cursor-pointer text-center"
                >
                  <div className="h-28 rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-blue-400 group-hover:shadow-md transition overflow-hidden flex flex-col justify-between p-2 text-left">
                    <div className="bg-[#0B1938] text-white text-[7px] font-bold px-1.5 py-0.5 rounded flex items-center justify-between">
                      <span>ShoePOS</span>
                      <span className="text-blue-300">KPIs</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 my-1">
                      <div className="bg-slate-50 p-1 rounded border border-slate-100">
                        <div className="text-[6px] text-slate-400">Today&apos;s Sales</div>
                        <div className="text-[8px] font-extrabold text-[#0A1633]">Rs. 48,750</div>
                        <div className="text-[6px] text-emerald-600 font-bold">+12%</div>
                      </div>
                      <div className="bg-slate-50 p-1 rounded border border-slate-100">
                        <div className="text-[6px] text-slate-400">Transactions</div>
                        <div className="text-[8px] font-extrabold text-[#0A1633]">36</div>
                        <div className="text-[6px] text-emerald-600 font-bold">+8%</div>
                      </div>
                    </div>
                    {/* Mini Bar Chart */}
                    <div className="flex items-end gap-1 h-7 px-1">
                      <span className="flex-1 bg-blue-200 h-2 rounded-t" />
                      <span className="flex-1 bg-blue-300 h-3 rounded-t" />
                      <span className="flex-1 bg-blue-400 h-4 rounded-t" />
                      <span className="flex-1 bg-blue-500 h-5 rounded-t" />
                      <span className="flex-1 bg-[#0066FF] h-6 rounded-t" />
                      <span className="flex-1 bg-[#0052CC] h-7 rounded-t" />
                    </div>
                  </div>
                  <div className="text-xs font-bold text-[#0A1633] mt-2">
                    Executive Dashboard
                  </div>
                </div>

                {/* Preview 2: POS Counter */}
                <div
                  onClick={handlePreviewStoreClick}
                  className="group cursor-pointer text-center"
                >
                  <div className="h-28 rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-blue-400 group-hover:shadow-md transition overflow-hidden flex flex-col justify-between p-2 text-left">
                    <div className="bg-[#0B1938] text-white text-[7px] font-bold px-1.5 py-0.5 rounded flex items-center justify-between">
                      <span>POS Terminal</span>
                      <span className="text-emerald-300">F9</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 my-1">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <div
                          key={n}
                          className="h-6 rounded bg-slate-100 border border-slate-200/70 flex items-center justify-center text-[7px] font-bold text-slate-700"
                        >
                          👟
                        </div>
                      ))}
                    </div>
                    <div className="bg-[#0066FF] text-white text-[7px] font-bold text-center py-0.5 rounded">
                      Checkout &bull; Rs. 16,699
                    </div>
                  </div>
                  <div className="text-xs font-bold text-[#0A1633] mt-2">
                    POS Counter
                  </div>
                </div>

                {/* Preview 3: Barcode Labels */}
                <div
                  onClick={handlePreviewStoreClick}
                  className="group cursor-pointer text-center"
                >
                  <div className="h-28 rounded-xl bg-gradient-to-br from-[#334155] to-[#0F172A] border border-slate-200 shadow-sm group-hover:border-blue-400 group-hover:shadow-md transition overflow-hidden flex items-center justify-center p-2">
                    <div className="w-full bg-white rounded p-1.5 text-center shadow-xs">
                      <div className="text-[7px] font-extrabold text-[#0A1633]">Shoe Store</div>
                      <div className="text-[8px] font-black text-[#0A1633]">HS-1021</div>
                      <div className="h-4 my-0.5 bg-[repeating-linear-gradient(90deg,#0f172a,#0f172a_1px,transparent_1px,transparent_3px)]" />
                      <div className="text-[6px] font-mono text-slate-600">0108923000012</div>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-[#0A1633] mt-2">
                    Barcode Labels
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: 2x4 Grid of 8 Feature Cards */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {featureItems.map((feat, index) => {
                const IconComponent = feat.icon;
                return (
                  <div
                    key={index}
                    onClick={handlePreviewStoreClick}
                    className="group bg-white hover:bg-[#F8FBFF] rounded-2xl border border-slate-200/80 hover:border-blue-300 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.03)] hover:shadow-md transition-all cursor-pointer flex items-start justify-between gap-3.5"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl ${feat.iconBg} ${feat.iconColor} flex items-center justify-center shrink-0`}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-[#0A1633] group-hover:text-[#0066FF] transition-colors">
                          {feat.title}
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">
                          {feat.desc}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#0066FF] shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 4. OUR STORES SECTION */}
      <section
        id="stores"
        className="py-14 bg-gradient-to-b from-[#F2F7FF] to-[#F8FBFF] border-y border-blue-100/80"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#DCEBFF] text-[#0066FF] text-[11px] font-extrabold uppercase tracking-wider mb-2.5">
                OUR STORES
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0A1633] tracking-tight">
                Trusted by Shoe Stores Across Pakistan
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Join hundreds of successful shoe retailers using ShoePOS to manage their business.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowStoresModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-blue-50 text-[#0066FF] border border-[#3B82F6] text-xs font-bold shadow-2xs transition cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <span>View All Stores</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 8 Brand Store Cards Across Pakistan */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5">
            {pakistanStores.map((st, idx) => (
              <div
                key={idx}
                onClick={handlePreviewStoreClick}
                className="bg-white hover:bg-blue-50/40 rounded-xl border border-slate-200/80 hover:border-blue-300 p-4 shadow-2xs hover:shadow-md transition cursor-pointer flex flex-col items-center justify-between text-center h-28"
              >
                <div className="h-10 flex items-center justify-center">
                  {st.renderLogo()}
                </div>
                <div className="pt-2 border-t border-slate-100 w-full">
                  <div className="text-[11px] font-semibold text-slate-600 leading-tight">
                    Shoe Store
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight">
                    {st.city}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. PRICING SECTION */}
      <section id="pricing" className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#DCEBFF] text-[#0066FF] text-[11px] font-extrabold uppercase tracking-wider mb-2.5">
              PRICING
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A1633] tracking-tight">
              Choose the Plan That Fits Your Business
            </h2>
            <p className="text-sm sm:text-base text-slate-600 mt-1">
              Simple and transparent pricing. No hidden fees. Cancel anytime.
            </p>
          </div>

          {/* 2 Subscription Plan Cards */}
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* Plan 1: 6 Months Subscription */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_8px_30px_rgba(15,23,42,0.05)] p-7 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-[#0A1633]">
                      6 Months Subscription
                    </h3>
                    <div className="text-3xl sm:text-4xl font-extrabold text-[#0A1633] mt-1 tracking-tight tabular-nums">
                      Rs. 10,000
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-[#EBF3FF] text-[#0066FF] flex items-center justify-center shrink-0">
                    <Calendar className="w-6 h-6" />
                  </div>
                </div>

                <ul className="space-y-3 mt-6 text-sm text-slate-700 font-medium">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Full access to all features</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Multi-tenant support</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Free updates &amp; support</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Secure data backup</span>
                  </li>
                </ul>
              </div>

              <div className="mt-7 pt-2">
                <button
                  type="button"
                  onClick={() => openGetStartedWithPlan('6_MONTHS_RS_10000')}
                  className="w-full py-3 rounded-xl bg-white hover:bg-blue-50 text-[#0066FF] border border-[#3B82F6] font-bold text-sm transition cursor-pointer"
                >
                  Get Started
                </button>
                <p className="text-xs text-slate-500 mt-3">
                  Perfect for new stores or short-term needs.
                </p>
              </div>
            </div>

            {/* Plan 2: 1 Year Subscription (Most Popular) */}
            <div className="relative bg-white rounded-2xl border-2 border-[#0066FF] shadow-[0_12px_40px_rgba(0,102,255,0.12)] p-7 sm:p-8 flex flex-col justify-between">
              <div className="absolute -top-3.5 right-6 px-4 py-1 rounded-lg bg-[#0066FF] text-white text-xs font-bold shadow-sm">
                Most Popular
              </div>

              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-[#0A1633]">
                      1 Year Subscription
                    </h3>
                    <div className="text-3xl sm:text-4xl font-extrabold text-[#0066FF] mt-1 tracking-tight tabular-nums">
                      Rs. 18,000
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-[#EBF3FF] text-[#0066FF] flex items-center justify-center shrink-0">
                    <Calendar className="w-6 h-6" />
                  </div>
                </div>

                <ul className="space-y-3 mt-6 text-sm text-slate-700 font-medium">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Full access to all features</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Multi-tenant support</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Free updates &amp; support</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#10B981] stroke-[3] shrink-0" />
                    <span>Secure data backup</span>
                  </li>
                </ul>
              </div>

              <div className="mt-7 pt-2">
                <button
                  type="button"
                  onClick={() => openGetStartedWithPlan('1_YEAR_RS_18000')}
                  className="w-full py-3 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white font-bold text-sm shadow-md shadow-blue-600/25 transition cursor-pointer"
                >
                  Get Started
                </button>
                <p className="text-xs text-slate-600 mt-3">
                  Save more. Grow faster.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BOTTOM NAVY CTA BANNER */}
      <section
        id="about"
        className="relative overflow-hidden bg-gradient-to-r from-[#08152E] via-[#0D2758] to-[#0A224E] text-white py-11"
      >
        {/* Left Shoe Shelf Texture Overlay */}
        <div className="absolute inset-y-0 left-0 w-72 opacity-25 pointer-events-none">
          <img
            src={shoeStoreBg}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#08152E]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-white">
              Ready to Take Your Shoe Business to the Next Level?
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/90 mt-1.5 font-medium">
              Join our growing community of store owners and start managing your business smarter today.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openGetStartedWithPlan('1_YEAR_RS_18000')}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-white hover:bg-blue-50 text-[#0052CC] font-extrabold text-sm shadow-xl transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Get Started Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* MODAL 1: GET STARTED / STORE SUBSCRIPTION REQUEST */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setShowRequestModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-5">
              <span className="inline-block px-2.5 py-1 rounded-full bg-[#DCEBFF] text-[#0066FF] text-[11px] font-extrabold uppercase tracking-wider mb-1.5">
                Start Your ShoePOS Store
              </span>
              <h3 className="text-xl font-extrabold text-[#0A1633]">
                Register Your Shoe Store
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Create your dedicated store workspace and launch your POS &amp; Inventory suite.
              </p>
            </div>

            {submitError && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {submitError}
              </div>
            )}

            {submitSuccess ? (
              <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Store Request Submitted!</span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  {submitSuccess.message}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRequestModal(false);
                      onOpenSuperAdmin();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-bold transition cursor-pointer"
                  >
                    <span>Open SuperAdmin C-Panel to Approve</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccess(null);
                      setShowRequestModal(false);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Store Name *
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={storeName}
                        onChange={(e) => {
                          const formatted = toTitleCaseLive(e.target.value);
                          setStoreName(formatted);
                          if (!requestedSlug) {
                            handleSlugChange(e.target.value);
                          }
                        }}
                        placeholder="e.g. Metro Footwear"
                        className="capitalize w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Store Slug *
                    </label>
                    <div className="flex items-center rounded-xl border border-slate-300 focus-within:border-[#0066FF] overflow-hidden">
                      <input
                        type="text"
                        required
                        value={requestedSlug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        placeholder="metroshoes"
                        className="w-full px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Store Owner Name *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(toTitleCaseLive(e.target.value))}
                        placeholder="Tariq Mahmood"
                        className="capitalize w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Owner Email *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        placeholder="owner@metroshoes.pk"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phone / WhatsApp
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={ownerPhone}
                        onChange={(e) => setOwnerPhone(e.target.value)}
                        placeholder="+92 300 1234567"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Subscription Plan
                    </label>
                    <select
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      className="capitalize w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-[#0066FF]"
                    >
                      <option value="6_MONTHS_RS_10000">6 Months — Rs. 10,000</option>
                      <option value="1_YEAR_RS_18000">1 Year — Rs. 18,000 (Most Popular)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-blue-600/25 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>
                    {submitting
                      ? 'Submitting Request...'
                      : 'Submit Store Request'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: STORE LOGIN & ACTIVE MULTI-TENANT STORES DIRECTORY */}
      {showStoresModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setShowStoresModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pr-8">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#DCEBFF] text-[#0066FF] text-[11px] font-extrabold uppercase tracking-wider mb-1">
                  Multi-Tenant Store Access
                </span>
                <h3 className="text-xl font-extrabold text-[#0A1633]">
                  Select a ShoePOS Store to Login
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStoresModal(false);
                    onOpenSuperAdmin();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-[#0066FF]" />
                  <span>SuperAdmin C-Panel</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowStoresModal(false);
                    onTestUnknownSubdomain('notexist');
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold cursor-pointer"
                >
                  Test 404 Store
                </button>
              </div>
            </div>

            {availableTenants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-3">
                <Store className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-[#0A1633]">No Stores Provisioned Yet</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No stores have been created yet. Submit a new store request or sign in to the SuperAdmin C-Panel to provision your first store.
                </p>
                <div className="flex items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStoresModal(false);
                      openGetStartedWithPlan('1_YEAR_RS_18000');
                    }}
                    className="px-4 py-2 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-bold transition cursor-pointer"
                  >
                    Request a Store
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStoresModal(false);
                      onOpenSuperAdmin();
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                  >
                    Open SuperAdmin C-Panel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {availableTenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between hover:border-blue-300 transition bg-slate-50/40"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-extrabold text-sm text-[#0A1633] truncate">
                          {tenant.name}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            tenant.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {tenant.status}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-500 mb-4">
                        Store Slug: {tenant.slug}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowStoresModal(false);
                          onOpenStore(tenant.slug);
                        }}
                        className="flex-1 py-2 px-3 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-bold transition cursor-pointer"
                      >
                        Login to Store
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStoresModal(false);
                          onOpenOnboarding(tenant.slug);
                        }}
                        className="py-2 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
                      >
                        Setup
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
