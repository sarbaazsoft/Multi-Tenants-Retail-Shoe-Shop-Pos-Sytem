import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Receipt,
  RotateCw,
  Search,
  X,
  Download,
  LayoutDashboard,
  BarChart3,
  Store,
  Package,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { useScrollActiveTab } from '../../hooks/useScrollActiveTab';
import type {
  SuperAdminStoreRow,
  StoreRequestRecord,
  SuperAdminReportSku,
  SuperAdminReportBreakdown,
  SuperAdminRecentTransaction,
} from '../../types';

interface SuperAdminReportsViewProps {
  stores: SuperAdminStoreRow[];
  storeRequests: StoreRequestRecord[];
  reportSkus: SuperAdminReportSku[];
  reportCategories: SuperAdminReportBreakdown[];
  reportBrands: SuperAdminReportBreakdown[];
  recentTransactions: SuperAdminRecentTransaction[];
  loading: boolean;
  onRefresh: () => void;
  onOpenStore: (slug: string) => void;
}

type ReportSubTab = 'overview' | 'store_leaderboard' | 'top_skus' | 'sales_ledger';

export const SuperAdminReportsView: React.FC<SuperAdminReportsViewProps> = ({
  stores,
  storeRequests,
  reportSkus,
  reportCategories,
  reportBrands,
  recentTransactions,
  loading,
  onRefresh,
  onOpenStore,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ReportSubTab>('overview');
  const [storeScope, setStoreScope] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  const { containerRef: reportsTabContainerRef } = useScrollActiveTab<HTMLDivElement>(activeSubTab, {
    padding: 16,
    behavior: 'smooth',
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();

  // Scoped stores
  const scopedStores = useMemo(() => {
    return storeScope === 'ALL'
      ? stores
      : stores.filter((st) => String(st.id) === storeScope);
  }, [stores, storeScope]);

  // Store counts & metrics
  const totalCount = scopedStores.length;
  const activeCount = scopedStores.filter(
    (st) =>
      st.status === 'ACTIVE' &&
      st.subscriptionStatus !== 'EXPIRED' &&
      st.subscriptionStatus !== 'SUSPENDED'
  ).length;
  const suspendedCount = scopedStores.filter(
    (st) => st.status === 'SUSPENDED' || st.subscriptionStatus === 'SUSPENDED'
  ).length;
  const expiredCount = scopedStores.filter(
    (st) => st.subscriptionStatus === 'EXPIRED' || st.status === 'EXPIRED'
  ).length;
  const onboardedCount = scopedStores.filter((st) => st.onboardingCompleted).length;
  const pendingSetupCount = Math.max(0, totalCount - onboardedCount);
  const yearlyCount = scopedStores.filter((st) => st.subscriptionPlan === 'YEARLY').length;
  const sixMonthCount = scopedStores.filter((st) => st.subscriptionPlan === '6_MONTHS').length;

  const totalRevenue = scopedStores.reduce((sum, st) => sum + (st.totalSales || 0), 0);
  const totalInvoices = scopedStores.reduce((sum, st) => sum + (st.salesCount || 0), 0);
  const totalUnitsSold = scopedStores.reduce((sum, st) => sum + (st.unitsSold || 0), 0);
  const totalProducts = scopedStores.reduce((sum, st) => sum + (st.productCount || 0), 0);
  const totalStockUnits = scopedStores.reduce((sum, st) => sum + (st.totalStockUnits || 0), 0);
  const totalInventoryVal = scopedStores.reduce((sum, st) => sum + (st.inventoryValue || 0), 0);
  const totalStaff = scopedStores.reduce((sum, st) => sum + (st.staffCount || 0), 0);
  const totalCustomers = scopedStores.reduce((sum, st) => sum + (st.customerCount || 0), 0);
  const pendingRequestsCount = storeRequests.filter((r) => r.status === 'PENDING').length;

  // Ranked stores
  const rankedStores = useMemo(() => {
    return [...scopedStores]
      .filter((st) => {
        if (!normalizedSearch) return true;
        return (
          st.name.toLowerCase().includes(normalizedSearch) ||
          st.slug.toLowerCase().includes(normalizedSearch) ||
          (st.ownerEmail || '').toLowerCase().includes(normalizedSearch)
        );
      })
      .sort((a, b) => {
        if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
        if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
        return b.productCount - a.productCount;
      });
  }, [scopedStores, normalizedSearch]);

  const topStore = rankedStores[0] || null;
  const topStoreRevenue = topStore ? topStore.totalSales : 0;
  const topStoreShare =
    totalRevenue > 0 && topStore ? Math.round((topStore.totalSales / totalRevenue) * 100) : 0;

  // Filtered Top SKUs
  const filteredTopSkus = useMemo(() => {
    return reportSkus.filter((sku) => {
      if (storeScope !== 'ALL' && String(sku.tenantId) !== storeScope) {
        return false;
      }
      if (!normalizedSearch) return true;
      return (
        sku.productName.toLowerCase().includes(normalizedSearch) ||
        sku.sku.toLowerCase().includes(normalizedSearch) ||
        sku.barcode.toLowerCase().includes(normalizedSearch) ||
        sku.brand.toLowerCase().includes(normalizedSearch) ||
        sku.category.toLowerCase().includes(normalizedSearch) ||
        sku.storeName.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [reportSkus, storeScope, normalizedSearch]);

  // Filtered Platform Transactions (Sales Ledger)
  const filteredTransactions = useMemo(() => {
    return recentTransactions.filter((tx) => {
      if (storeScope !== 'ALL' && String(tx.tenantId) !== storeScope) {
        return false;
      }
      const matchesPayment =
        paymentFilter === 'ALL' ||
        (tx.paymentMethod && tx.paymentMethod.toUpperCase() === paymentFilter.toUpperCase());
      if (!matchesPayment) return false;

      if (!normalizedSearch) return true;
      return (
        tx.invoiceNumber.toLowerCase().includes(normalizedSearch) ||
        tx.storeName.toLowerCase().includes(normalizedSearch) ||
        tx.customerName.toLowerCase().includes(normalizedSearch) ||
        tx.cashierName.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [recentTransactions, storeScope, paymentFilter, normalizedSearch]);

  const filteredLedgerTotal = useMemo(() => {
    return filteredTransactions.reduce((acc, tx) => acc + (tx.totalAmount || 0), 0);
  }, [filteredTransactions]);

  // Export CSV Handler
  const handleExportCsv = () => {
    const dateStr = new Date().toISOString().split('T')[0];
    if (activeSubTab === 'top_skus') {
      if (filteredTopSkus.length === 0) return;
      const headers = [
        'Rank',
        'Store',
        'Product Name',
        'SKU',
        'Barcode',
        'Brand',
        'Category',
        'Selling Price',
        'Stock Units',
        'Units Sold',
        'Revenue Generated',
      ];
      const rows = filteredTopSkus.map((item, i) => [
        i + 1,
        `"${item.storeName.replace(/"/g, '""')}"`,
        `"${item.productName.replace(/"/g, '""')}"`,
        item.sku,
        item.barcode,
        `"${item.brand.replace(/"/g, '""')}"`,
        `"${item.category.replace(/"/g, '""')}"`,
        Math.round(item.sellingPrice),
        item.totalStock,
        item.unitsSold,
        Math.round(item.totalRevenue),
      ]);
      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const link = document.createElement('a');
      link.setAttribute('href', encodeURI(csvContent));
      link.setAttribute('download', `Platform_Top_SKUs_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (activeSubTab === 'sales_ledger') {
      if (filteredTransactions.length === 0) return;
      const headers = [
        'Invoice Number',
        'Date',
        'Store',
        'Customer',
        'Cashier',
        'Payment Method',
        'Total Amount',
      ];
      const rows = filteredTransactions.map((tx) => [
        tx.invoiceNumber,
        tx.saleDate,
        `"${tx.storeName.replace(/"/g, '""')}"`,
        `"${(tx.customerName || 'Walk-in').replace(/"/g, '""')}"`,
        `"${(tx.cashierName || 'Counter').replace(/"/g, '""')}"`,
        tx.paymentMethod || 'CASH',
        Math.round(tx.totalAmount || 0),
      ]);
      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const link = document.createElement('a');
      link.setAttribute('href', encodeURI(csvContent));
      link.setAttribute('download', `Platform_Sales_Ledger_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Default: Export Store Leaderboard & Counting Summary
    if (rankedStores.length === 0) return;
    const headers = [
      'Rank',
      'Store Name',
      'Slug',
      'Status',
      'Plan',
      'SKUs',
      'Stock Units',
      'Inventory Value',
      'Invoices',
      'Units Sold',
      'Total Revenue',
    ];
    const rows = rankedStores.map((st, i) => [
      i + 1,
      `"${st.name.replace(/"/g, '""')}"`,
      st.slug,
      st.status,
      st.subscriptionPlan || 'YEARLY',
      st.productCount,
      st.totalStockUnits,
      Math.round(st.inventoryValue || 0),
      st.salesCount,
      st.unitsSold || 0,
      Math.round(st.totalSales || 0),
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Platform_Stores_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto text-xs">
      {/* Top Banner & Action (Aligned with Store ReportsDashboard) */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-sm transition-colors dark:text-white"
      >
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Platform Reports &amp; Analytics
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 font-medium mt-0.5">
            Multi-store counting breakdown, top revenue-generating stores leaderboard, and top performing SKUs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Store Scope Selector */}
          <select
            value={storeScope}
            onChange={(e) => setStoreScope(e.target.value)}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-100 border border-slate-200 dark:border-purple-400/40 font-bold rounded-xl transition cursor-pointer text-xs outline-none"
          >
            <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              All Deployed Stores ({stores.length})
            </option>
            {stores.map((st) => (
              <option
                key={st.id}
                value={String(st.id)}
                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {st.name} (/{st.slug})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold rounded-xl transition cursor-pointer text-xs flex items-center space-x-1.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh platform reports & recount metrics"
          >
            <RotateCw
              className={`w-3.5 h-3.5 ${
                loading
                  ? 'animate-spin text-blue-600 dark:text-purple-300'
                  : 'text-blue-600 dark:text-purple-300'
              }`}
            />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
            title="Export current report view to CSV"
          >
            <Download className="w-4 h-4" />
            <span>Export Report CSV</span>
          </button>
        </div>
      </motion.div>

      {/* KPI Cards (4-Column Bento Grid) with Animated Counters - Aligned with Store ReportsDashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* CARD 1: DEPLOYED STORES COUNT */}
        <StatCard
          id="stat-sa-reports-stores"
          title="Deployed Stores"
          value={totalCount}
          suffix=" stores"
          icon={Store}
          iconColor="purple"
          valueClassName="font-mono text-purple-700 dark:text-purple-400"
          subtext={
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {activeCount} active
              </span>
              <span className="text-slate-400 dark:text-slate-400 font-mono font-medium">
                {suspendedCount} susp • {expiredCount} exp
              </span>
            </div>
          }
          loading={loading}
          delay={0}
          duration={1200}
        />

        {/* CARD 2: PLATFORM REVENUE */}
        <StatCard
          id="stat-sa-reports-revenue"
          title="Platform Revenue"
          value={Math.round(totalRevenue)}
          prefix="Rs. "
          icon={DollarSign}
          iconColor="emerald"
          valueClassName="font-mono text-slate-900 dark:text-white"
          subtext={
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {totalUnitsSold.toLocaleString()} pairs sold
              </span>
              <span className="text-slate-400 dark:text-slate-400 font-mono font-medium">
                {totalInvoices.toLocaleString()} checkouts
              </span>
            </div>
          }
          loading={loading}
          delay={0}
          duration={1200}
        />

        {/* CARD 3: TOP REVENUE STORE */}
        <StatCard
          id="stat-sa-reports-top-store"
          title={topStore ? `Top Store: ${topStore.name}` : 'Top Revenue Store'}
          value={Math.round(topStoreRevenue)}
          prefix="Rs. "
          icon={TrendingUp}
          iconColor="blue"
          valueClassName="font-mono text-blue-700 dark:text-cyan-400"
          subtext={
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Revenue Share
              </span>
              <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-cyan-300 border border-blue-100 dark:border-blue-500/30">
                {topStoreShare}% of platform
              </span>
            </div>
          }
          loading={loading}
          delay={0}
          duration={1200}
        />

        {/* CARD 4: CATALOG SKUS & STOCK */}
        <StatCard
          id="stat-sa-reports-skus"
          title="Catalog SKUs & Stock"
          value={totalProducts}
          suffix=" SKUs"
          icon={ShoppingBag}
          iconColor="amber"
          valueClassName="font-mono text-amber-600 dark:text-amber-400"
          subtext={
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                {totalStockUnits.toLocaleString()} units in stock
              </span>
              <button
                type="button"
                onClick={() => setActiveSubTab('top_skus')}
                className="text-blue-600 dark:text-purple-300 hover:underline font-bold text-[10.5px] cursor-pointer"
              >
                View SKUs &rarr;
              </button>
            </div>
          }
          loading={loading}
          delay={0}
          duration={1200}
        />
      </div>

      {/* Filter and Tab Bar (Aligned with Store ReportsDashboard) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="app-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 dark:border-purple-800/80 dark:text-white"
      >
        {/* Tab Buttons - Responsive Scrollable Underline Navigation */}
        <div
          ref={reportsTabContainerRef}
          className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-0 no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border-b border-slate-200/80 dark:border-purple-900/50"
        >
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            data-active={activeSubTab === 'overview'}
            className={`tab-underline-link relative inline-flex items-center gap-2 px-3.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 cursor-pointer shrink-0 whitespace-nowrap ${
              activeSubTab === 'overview'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <LayoutDashboard
              className={`w-4 h-4 transition-colors duration-200 ${
                activeSubTab === 'overview'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span>Overview</span>
            {activeSubTab === 'overview' && (
              <motion.div
                layoutId="superAdminReportsUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('store_leaderboard')}
            data-active={activeSubTab === 'store_leaderboard'}
            className={`tab-underline-link relative inline-flex items-center gap-2 px-3.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 cursor-pointer shrink-0 whitespace-nowrap ${
              activeSubTab === 'store_leaderboard'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Award
              className={`w-4 h-4 transition-colors duration-200 ${
                activeSubTab === 'store_leaderboard'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span>Store Leaderboard</span>
            <span
              className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono transition-colors duration-200 ${
                activeSubTab === 'store_leaderboard'
                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {rankedStores.length}
            </span>
            {activeSubTab === 'store_leaderboard' && (
              <motion.div
                layoutId="superAdminReportsUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('top_skus')}
            data-active={activeSubTab === 'top_skus'}
            className={`tab-underline-link relative inline-flex items-center gap-2 px-3.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 cursor-pointer shrink-0 whitespace-nowrap ${
              activeSubTab === 'top_skus'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <BarChart3
              className={`w-4 h-4 transition-colors duration-200 ${
                activeSubTab === 'top_skus'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span>Top Performing SKUs</span>
            <span
              className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono transition-colors duration-200 ${
                activeSubTab === 'top_skus'
                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {filteredTopSkus.length}
            </span>
            {activeSubTab === 'top_skus' && (
              <motion.div
                layoutId="superAdminReportsUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('sales_ledger')}
            data-active={activeSubTab === 'sales_ledger'}
            className={`tab-underline-link relative inline-flex items-center gap-2 px-3.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 cursor-pointer shrink-0 whitespace-nowrap ${
              activeSubTab === 'sales_ledger'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Receipt
              className={`w-4 h-4 transition-colors duration-200 ${
                activeSubTab === 'sales_ledger'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span>Platform Sales Ledger</span>
            <span
              className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono transition-colors duration-200 ${
                activeSubTab === 'sales_ledger'
                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {filteredTransactions.length}
            </span>
            {activeSubTab === 'sales_ledger' && (
              <motion.div
                layoutId="superAdminReportsUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
        </div>

        {/* Dynamic Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-purple-300/60 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeSubTab === 'top_skus'
                  ? 'Search SKU, article, brand or store...'
                  : activeSubTab === 'sales_ledger'
                  ? 'Search invoice #, store or customer...'
                  : 'Search store name or slug...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="app-input w-full pl-8 pr-8 py-2 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeSubTab === 'sales_ledger' && (
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="app-input py-2 px-2.5 text-xs font-medium cursor-pointer"
            >
              <option value="ALL">All Payments</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card / POS</option>
              <option value="ONLINE">Online / Bank</option>
            </select>
          )}
        </div>
      </motion.div>

      {/* TAB 1: OVERVIEW (Aligned with Store ReportsDashboard Overview 2-Column + Bottom Card) */}
      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Card: Top Revenue Generating Stores & Store Counting Breakdown */}
            <div className="app-card p-5 flex flex-col justify-between transition-colors dark:bg-gradient-to-br dark:from-purple-900/90 dark:via-indigo-950/95 dark:to-slate-900 dark:border-purple-800/80 dark:text-white">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-purple-800/60 pb-3 mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2 text-sm">
                      <Award className="w-4 h-4 text-amber-500" />
                      <span>Top Revenue Generating Stores</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 dark:text-purple-200/70">
                      Highest grossing tenant stores &amp; store counting metrics
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('store_leaderboard')}
                    className="text-[11px] font-bold text-purple-600 dark:text-purple-300 hover:underline cursor-pointer"
                  >
                    Full Leaderboard &rarr;
                  </button>
                </div>

                {/* Store Counting Summary Pills */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/75 border border-slate-200/70 dark:border-purple-800/50 text-center">
                    <div className="text-[10px] font-semibold text-slate-400 dark:text-purple-200/70 uppercase">
                      Total
                    </div>
                    <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">
                      {totalCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-500/30 text-center">
                    <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">
                      Active
                    </div>
                    <div className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {activeCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200/70 dark:border-purple-500/30 text-center">
                    <div className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase">
                      Yearly / 6M
                    </div>
                    <div className="text-sm font-black font-mono text-purple-700 dark:text-purple-300 mt-0.5">
                      {yearlyCount}/{sixMonthCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-500/30 text-center">
                    <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase">
                      Setup / Req
                    </div>
                    <div className="text-sm font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                      {onboardedCount}/{pendingRequestsCount}
                    </div>
                  </div>
                </div>

                {rankedStores.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 dark:text-purple-200/60">
                    No deployed stores match the selected filter
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rankedStores.slice(0, 5).map((st, idx) => {
                      const sharePct =
                        totalRevenue > 0
                          ? Math.min(100, Math.round((st.totalSales / totalRevenue) * 100))
                          : 0;
                      return (
                        <div
                          key={st.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/70 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 border border-slate-200/60 dark:border-purple-800/50 transition"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[11px] shrink-0 ${
                                idx === 0
                                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
                                  : idx === 1
                                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                  : idx === 2
                                  ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenStore(st.slug)}
                                className="font-bold text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-300 transition truncate block text-left cursor-pointer"
                              >
                                {st.name}
                              </button>
                              <div className="text-[10px] text-slate-400 dark:text-slate-400 font-mono truncate">
                                /{st.slug} • {st.productCount} SKUs • {st.salesCount} invoices
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 ml-2">
                            <div className="font-black text-emerald-600 dark:text-emerald-400 font-mono">
                              {st.currency} {Math.round(st.totalSales).toLocaleString()}
                            </div>
                            <div className="text-[10px] font-semibold text-blue-600 dark:text-cyan-400 font-mono">
                              {(st.unitsSold || 0).toLocaleString()} pairs ({sharePct}%)
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-purple-800/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-purple-200/80 font-mono">
                <span>
                  Staff: <strong>{totalStaff}</strong> • Customers: <strong>{totalCustomers}</strong>
                </span>
                <span>
                  Stock Value: <strong>Rs. {Math.round(totalInventoryVal).toLocaleString()}</strong>
                </span>
              </div>
            </div>

            {/* Right Card: Best Selling Footwear Models (Top SKUs) */}
            <div className="app-card p-5 flex flex-col justify-between transition-colors dark:bg-gradient-to-br dark:from-purple-900/90 dark:via-indigo-950/95 dark:to-slate-900 dark:border-purple-800/80 dark:text-white">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-purple-800/60 pb-3 mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2 text-sm">
                      <Package className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Best Selling Footwear Models (Top SKUs)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 dark:text-purple-200/70">
                      Highest velocity articles by units sold &amp; revenue across stores
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('top_skus')}
                    className="text-[11px] font-bold text-purple-600 dark:text-purple-300 hover:underline cursor-pointer"
                  >
                    View All SKUs &rarr;
                  </button>
                </div>

                {filteredTopSkus.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 dark:text-purple-200/60">
                    No product sales recorded yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTopSkus.slice(0, 6).map((item, idx) => (
                      <div
                        key={`${item.tenantId}-${item.id}`}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/70 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 border border-slate-200/60 dark:border-purple-800/50 transition"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[11px] shrink-0 ${
                              idx === 0
                                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
                                : idx === 1
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                : idx === 2
                                ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {item.productName}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-400 font-mono truncate">
                              SKU: {item.sku} • {item.storeName} ({item.brand})
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-2">
                          <div className="font-black text-slate-900 dark:text-white font-mono">
                            {item.unitsSold.toLocaleString()} pairs
                          </div>
                          <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                            {item.currency} {Math.round(item.totalRevenue).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Categories & Brands Mini Summary */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-purple-800/60 grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                  <span className="text-slate-500 dark:text-purple-200/80 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-500" />
                    Top Category:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[100px]">
                    {reportCategories[0]?.name || 'Footwear'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                  <span className="text-slate-500 dark:text-purple-200/80 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-sky-500" />
                    Top Brand:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[100px]">
                    {reportBrands[0]?.name || 'Brand'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Card: Recent Platform POS Sales Activity (Aligned with Store ReportsDashboard) */}
          <div className="app-card p-5 transition-colors dark:bg-gradient-to-br dark:from-purple-900/90 dark:via-indigo-950/95 dark:to-slate-900 dark:border-purple-800/80 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-purple-800/60 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2 text-sm">
                  <Receipt className="w-4 h-4 text-blue-600 dark:text-purple-400" />
                  <span>Recent Platform POS Sales Activity</span>
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-purple-200/70">
                  Latest counter transactions across deployed stores
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('sales_ledger')}
                className="text-[11px] font-bold text-purple-600 dark:text-purple-300 hover:underline cursor-pointer"
              >
                Full Sales Ledger &rarr;
              </button>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-slate-400 dark:text-purple-200/60">
                No recent sales transactions recorded
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-purple-800/60 text-[10px] text-slate-400 dark:text-purple-200/70 uppercase">
                      <th className="py-2 px-3">Invoice #</th>
                      <th className="py-2 px-3">Store</th>
                      <th className="py-2 px-3">Date &amp; Time</th>
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3">Payment</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-purple-800/40">
                    {filteredTransactions.slice(0, 6).map((tx) => (
                      <tr
                        key={`${tx.tenantId}-${tx.id}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-purple-900/20"
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-cyan-400">
                          {tx.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => onOpenStore(tx.storeSlug)}
                            className="font-bold text-slate-800 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-300 cursor-pointer"
                          >
                            {tx.storeName}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono">
                          {tx.saleDate}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-200">
                          {tx.customerName || 'Walk-in Customer'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                            {tx.paymentMethod || 'CASH'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white font-mono">
                          {tx.currency} {Math.round(tx.totalAmount).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: STORE LEADERBOARD (Full Table Aligned with Store ReportsDashboard) */}
      {activeSubTab === 'store_leaderboard' && (
        <div className="app-card overflow-hidden transition-colors dark:bg-gradient-to-br dark:from-purple-900/90 dark:via-indigo-950/95 dark:to-slate-900 dark:border-purple-800/80 dark:text-white">
          <div className="p-4 border-b border-slate-100 dark:border-purple-800/60 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <div>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Showing {rankedStores.length} Deployed Stores
              </span>
              <span className="ml-2 text-slate-400 dark:text-purple-200/70">
                (Active: {activeCount} • Suspended: {suspendedCount} • Expired: {expiredCount})
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-slate-600 dark:text-slate-300 font-medium">
                Filtered Revenue:{' '}
                <span className="font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  Rs. {Math.round(totalRevenue).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={rankedStores.length === 0}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] flex items-center space-x-1 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-purple-800/60 text-[10px] text-slate-400 dark:text-purple-200/70 uppercase bg-slate-50 dark:bg-slate-900/60">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Store</th>
                  <th className="py-3 px-4 text-center">Status &amp; Plan</th>
                  <th className="py-3 px-4 text-right">SKUs &amp; Stock</th>
                  <th className="py-3 px-4 text-right">Stock Value</th>
                  <th className="py-3 px-4 text-right">Invoices &amp; Units</th>
                  <th className="py-3 px-4 text-right">Total Revenue &amp; Share</th>
                  <th className="py-3 px-4 text-center">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-purple-800/40">
                {rankedStores.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-slate-400 dark:text-purple-200/60"
                    >
                      No stores match your filter criteria
                    </td>
                  </tr>
                ) : (
                  rankedStores.map((st, idx) => {
                    const rank = idx + 1;
                    const sharePct =
                      totalRevenue > 0
                        ? Math.min(100, Math.round((st.totalSales / totalRevenue) * 1000) / 10)
                        : 0;
                    const effectiveStatus =
                      st.subscriptionStatus === 'EXPIRED' || st.status === 'EXPIRED'
                        ? 'EXPIRED'
                        : st.status === 'SUSPENDED' || st.subscriptionStatus === 'SUSPENDED'
                        ? 'SUSPENDED'
                        : 'ACTIVE';

                    return (
                      <tr
                        key={st.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-purple-900/20 transition"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-500 dark:text-slate-300">
                          #{rank}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{st.name}</div>
                          <div className="text-[10px] font-mono text-slate-400 dark:text-slate-400">
                            /{st.slug}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              effectiveStatus === 'ACTIVE'
                                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : effectiveStatus === 'EXPIRED'
                                ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {effectiveStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {st.productCount.toLocaleString()} SKUs
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {st.totalStockUnits.toLocaleString()} units
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {st.currency} {Math.round(st.inventoryValue || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {st.salesCount.toLocaleString()} inv
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {(st.unitsSold || 0).toLocaleString()} sold
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          <div className="font-black text-emerald-600 dark:text-emerald-400">
                            {st.currency} {Math.round(st.totalSales).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400">{sharePct}% share</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => onOpenStore(st.slug)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-purple-900/40 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-purple-300 rounded-lg transition inline-flex items-center space-x-1 font-semibold text-[11px] px-2.5 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>POS</span>
                          </button>
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

      {/* TAB 3: TOP PERFORMING SKUS (Aligned with Store ReportsDashboard Profit/Loss Table) */}
      {activeSubTab === 'top_skus' && (
        <div className="app-card overflow-hidden transition-colors dark:bg-gradient-to-br dark:from-purple-900/90 dark:via-indigo-950/95 dark:to-slate-900 dark:border-purple-800/80 dark:text-white">
          <div className="p-4 border-b border-slate-100 dark:border-purple-800/60 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="font-bold text-slate-700 dark:text-slate-200">
              Showing Top {filteredTopSkus.length} Performing SKUs Across Stores
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredTopSkus.length === 0}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] flex items-center space-x-1 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export SKUs CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-purple-800/60 text-[10px] text-slate-400 dark:text-purple-200/70 uppercase bg-slate-50 dark:bg-slate-900/60">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Article &amp; SKU</th>
                  <th className="py-3 px-4">Brand &amp; Category</th>
                  <th className="py-3 px-4">Store</th>
                  <th className="py-3 px-4 text-right">Unit Price</th>
                  <th className="py-3 px-4 text-right">Stock On Hand</th>
                  <th className="py-3 px-4 text-right">Units Sold</th>
                  <th className="py-3 px-4 text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-purple-800/40">
                {filteredTopSkus.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-slate-400 dark:text-purple-200/60"
                    >
                      No SKUs match your filter criteria
                    </td>
                  </tr>
                ) : (
                  filteredTopSkus.map((item, idx) => (
                    <tr
                      key={`${item.tenantId}-${item.id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-purple-900/20 transition"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-500 dark:text-slate-300">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {item.productName}
                        </div>
                        <div className="text-[10px] font-mono text-purple-600 dark:text-purple-300">
                          {item.sku} • {item.barcode}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.brand}
                        </div>
                        <div className="text-[10px] text-slate-400">{item.category}</div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenStore(item.storeSlug)}
                          className="font-bold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
                        >
                          {item.storeName}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {item.currency} {Math.round(item.sellingPrice).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={`font-bold ${
                            item.totalStock <= 5
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {item.totalStock.toLocaleString()} units
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {item.unitsSold.toLocaleString()} pairs
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                        {item.currency} {Math.round(item.totalRevenue).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM SALES LEDGER (Aligned with Store ReportsDashboard Sales Ledger) */}
      {activeSubTab === 'sales_ledger' && (
        <div className="app-card overflow-hidden transition-colors dark:bg-gradient-to-br dark:from-purple-900/90 dark:via-indigo-950/95 dark:to-slate-900 dark:border-purple-800/80 dark:text-white">
          <div className="p-4 border-b border-slate-100 dark:border-purple-800/60 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <div>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Showing {filteredTransactions.length} Transactions
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-slate-600 dark:text-slate-300 font-medium">
                Filtered Total:{' '}
                <span className="font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  Rs. {Math.round(filteredLedgerTotal).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredTransactions.length === 0}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] flex items-center space-x-1 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-purple-800/60 text-[10px] text-slate-400 dark:text-purple-200/70 uppercase bg-slate-50 dark:bg-slate-900/60">
                  <th className="py-3 px-4">Invoice Number</th>
                  <th className="py-3 px-4">Store</th>
                  <th className="py-3 px-4">Date &amp; Timestamp</th>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-purple-800/40">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-slate-400 dark:text-purple-200/60"
                    >
                      No sales match your filter criteria
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr
                      key={`${tx.tenantId}-${tx.id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-purple-900/20 transition"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-cyan-400">
                        {tx.invoiceNumber}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenStore(tx.storeSlug)}
                          className="font-bold text-slate-800 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-300 cursor-pointer"
                        >
                          {tx.storeName}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono">
                        {tx.saleDate}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {tx.customerName || 'Walk-in Customer'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                        {tx.cashierName || 'Counter Staff'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 uppercase">
                          {tx.paymentMethod || 'CASH'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white font-mono">
                        {tx.currency} {Math.round(tx.totalAmount).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
