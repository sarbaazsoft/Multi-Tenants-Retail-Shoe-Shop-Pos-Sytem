import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Plus,
  Search,
  Phone,
  ShoppingBag,
  X,
  Edit2,
  Trash2,
  Coins,
  TrendingUp,
  LayoutGrid,
  List,
  Eye,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { CustomerFormModal } from './CustomerFormModal.tsx';
import { CustomerDetailsModal } from './CustomerDetailsModal.tsx';
import { StatCard, triggerStatRecount } from '../common/StatCard.tsx';

interface CustomerManagementProps {
  companySettings: any;
}

export const CustomerManagement: React.FC<CustomerManagementProps> = ({ companySettings }) => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'orders' | 'spent'>('recent');

  // Selected customer details modal
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Delete dialog
  const [deletingCustomerId, setDeletingCustomerId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currencySymbol = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';

  const isRefreshingRef = useRef(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsLoading(true);
    try {
      const res = await api.customers.list(searchTerm.trim() || undefined);
      setCustomers(res.customers || []);
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      isRefreshingRef.current = false;
      setIsLoading(false);
      triggerStatRecount();
    }
  };

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer: any) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleViewCustomer = async (id: number) => {
    setIsLoadingHistory(true);
    try {
      const res = await api.customers.get(id);
      setSelectedCustomer(res.customer ? { ...res.customer, sales: res.sales || [] } : null);
    } catch (e) {
      console.error('Failed to fetch customer details:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteCustomer = async (id: number) => {
    setIsDeleting(true);
    try {
      await api.customers.delete(id);
      setDeletingCustomerId(null);
      if (selectedCustomer && selectedCustomer.id === id) {
        setSelectedCustomer(null);
      }
      loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered and sorted customers
  const displayedCustomers = useMemo(() => {
    let list = [...customers];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'orders') {
        const aOrders = parseInt(a.total_orders || a.totalOrders || 0, 10);
        const bOrders = parseInt(b.total_orders || b.totalOrders || 0, 10);
        return bOrders - aOrders;
      }
      if (sortBy === 'spent') {
        const aSpent = parseFloat(a.total_spent || a.totalSpent || 0);
        const bSpent = parseFloat(b.total_spent || b.totalSpent || 0);
        return bSpent - aSpent;
      }
      // 'recent' by id desc
      return (b.id || 0) - (a.id || 0);
    });

    return list;
  }, [customers, searchTerm, sortBy]);

  // KPI Calculations
  const totalCustomersCount = customers.length;
  const totalOrdersCount = customers.reduce(
    (acc, c) => acc + (parseInt(c.total_orders || c.totalOrders || 0, 10) || 0),
    0
  );
  const totalSpentAmount = customers.reduce(
    (acc, c) => acc + (parseFloat(c.total_spent || c.totalSpent || 0) || 0),
    0
  );
  const averageOrderValue = totalOrdersCount > 0 ? totalSpentAmount / totalOrdersCount : 0;

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto text-xs">
      {/* Top Header Card - aligned with Product/Purchase styling */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="app-card p-5 rounded-2xl border border-slate-200/90 dark:border-purple-800/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 dark:text-white"
      >
        <div>
          <div className="flex items-center space-x-3 text-slate-900 dark:text-white">
            <span className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-purple-500/20 border border-blue-100 dark:border-purple-400/30 flex items-center justify-center text-blue-600 dark:text-purple-300 shrink-0 shadow-2xs">
              <Users className="w-5 h-5 stroke-[2.2]" />
            </span>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Customer Directory & Accounts
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-purple-950/60 text-blue-700 dark:text-purple-300 border border-blue-200/80 dark:border-purple-800/60">
                  {customers.length} Registered
                </span>
              </div>
              <p className="text-slate-500 dark:text-purple-200/80 text-xs mt-0.5">
                Manage retail customer profiles, maintain VIP accounts, and track purchase order histories
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleOpenAddModal}
            style={{ color: '#ffffff' }}
            className="btn-pure-white customer-btn bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 !text-white text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 !text-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
            <span className="!text-white font-bold text-white" style={{ color: '#ffffff' }}>Add New Customer</span>
          </button>
        </div>
      </motion.div>

      {/* KPI Stats Banner with Animated Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          id="stat-registered-customers"
          layout="horizontal"
          title="Registered Customers"
          value={totalCustomersCount}
          icon={Users}
          iconColor="blue"
          loading={isLoading}
          delay={0}
          duration={1200}
        />

        <StatCard
          id="stat-sales-invoices"
          layout="horizontal"
          title="Sales Invoices"
          value={totalOrdersCount}
          suffix=" orders"
          icon={ShoppingBag}
          iconColor="purple"
          loading={isLoading}
          delay={0}
          duration={1200}
        />

        <StatCard
          id="stat-lifetime-revenue"
          layout="horizontal"
          title="Total Lifetime Revenue"
          value={totalSpentAmount}
          prefix={`${currencySymbol} `}
          icon={Coins}
          iconColor="emerald"
          valueClassName="text-slate-900 dark:text-white font-mono"
          loading={isLoading}
          delay={0}
          duration={1200}
        />

        <StatCard
          id="stat-average-order-value"
          layout="horizontal"
          title="Average Order Value"
          value={averageOrderValue}
          prefix={`${currencySymbol} `}
          icon={TrendingUp}
          iconColor="amber"
          valueClassName="text-slate-900 dark:text-white font-mono"
          loading={isLoading}
          delay={0}
          duration={1200}
        />
      </div>

      {/* Search, Filter & View Mode Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="app-card p-3.5 rounded-2xl border border-slate-200/90 dark:border-purple-800/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 dark:text-white"
      >
        <div className="relative flex-1 w-full max-w-lg">
          <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by customer name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadCustomers()}
            className="w-full pl-[2.125rem] pr-24 py-2 bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-purple-300/50 border border-slate-200 dark:border-purple-800/60 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 font-medium text-xs transition"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                api.customers.list().then((res) => setCustomers(res.customers || []));
              }}
              className="absolute right-16 top-1/2 -translate-y-1/2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={loadCustomers}
            style={{ color: '#ffffff' }}
            className="btn-primary btn-pure-white customer-btn !text-white text-white absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            <span className="!text-white font-semibold text-white" style={{ color: '#ffffff' }}>Search</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
          {/* Sort Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-purple-500/20 hover:bg-slate-100 dark:hover:bg-purple-500/30 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 dark:text-purple-300" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 dark:text-purple-200 outline-none cursor-pointer"
            >
              <option value="recent" className="bg-white dark:bg-[#120726] text-slate-900 dark:text-purple-100">
                Recently Added
              </option>
              <option value="name" className="bg-white dark:bg-[#120726] text-slate-900 dark:text-purple-100">
                Name (A - Z)
              </option>
              <option value="orders" className="bg-white dark:bg-[#120726] text-slate-900 dark:text-purple-100">
                Most Orders
              </option>
              <option value="spent" className="bg-white dark:bg-[#120726] text-slate-900 dark:text-purple-100">
                Highest Spending
              </option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={loadCustomers}
            disabled={isLoading}
            title={isLoading ? "Refreshing list..." : "Refresh List & recount metrics"}
            className="p-2 text-slate-600 dark:text-purple-200 hover:text-blue-600 dark:hover:text-white bg-slate-50 dark:bg-purple-500/20 hover:bg-slate-100 dark:hover:bg-purple-500/30 rounded-xl border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600 dark:text-purple-300' : 'text-blue-600 dark:text-purple-300'}`} />
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-purple-950/40 p-1 rounded-xl border border-slate-200 dark:border-purple-800/60">
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-purple-500/20 text-blue-600 dark:text-purple-200 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Card Grid View"
              className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-purple-500/20 text-blue-600 dark:text-purple-200 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Customers View */}
      {isLoading ? (
        <div className="app-card p-12 rounded-2xl border border-slate-200/90 dark:border-purple-800/80 text-center text-slate-400 dark:text-slate-500 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
          <p className="font-medium text-xs">Loading customer directory...</p>
        </div>
      ) : displayedCustomers.length === 0 ? (
        <div className="app-card p-12 rounded-2xl border border-slate-200/90 dark:border-purple-800/80 text-center text-slate-400 dark:text-slate-500 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-purple-950/40 border border-blue-100 dark:border-purple-900/50 flex items-center justify-center text-blue-500 dark:text-purple-400 mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Customers Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? `No results matching "${searchTerm}".` : 'Get started by adding your first retail customer.'}
            </p>
          </div>
          <button
            onClick={handleOpenAddModal}
            style={{ color: '#ffffff' }}
            className="btn-pure-white customer-btn bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 !text-white text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 !text-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
            <span className="!text-white font-bold text-white" style={{ color: '#ffffff' }}>Add New Customer</span>
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABULAR VIEW */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="app-card rounded-2xl border border-slate-200/90 dark:border-purple-800/80 shadow-xs overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/90 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 text-slate-600 dark:text-white font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-purple-800/80">
                <tr>
                  <th className="py-3 px-4 w-24">ID</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-purple-900/40">
                {displayedCustomers.map((c) => {
                  const initials = (c.name || 'C')
                    .split(' ')
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleViewCustomer(c.id)}
                      className="table-row-hover hover:bg-blue-50/30 dark:hover:bg-purple-900/30 transition cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-purple-300">
                        #{c.id}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-purple-950/60 border border-blue-200 dark:border-purple-800/60 flex items-center justify-center text-blue-600 dark:text-purple-300 font-bold text-xs shrink-0 shadow-2xs">
                            {initials}
                          </div>
                          <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-purple-400 transition-colors">
                            {c.name}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{c.phone}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleViewCustomer(c.id)}
                            title="View Purchase Ledger"
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-purple-300 hover:bg-blue-50 dark:hover:bg-purple-900/40 rounded-lg transition cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(c)}
                            title="Edit Customer"
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-purple-300 hover:bg-blue-50 dark:hover:bg-purple-900/40 rounded-lg transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingCustomerId(c.id)}
                            title="Delete Customer"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        /* GRID / CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedCustomers.map((c, index) => {
            const initials = (c.name || 'C')
              .split(' ')
              .map((n: string) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.28,
                  delay: Math.min(index * 0.04, 0.35),
                  ease: [0.16, 1, 0.3, 1],
                }}
                onClick={() => handleViewCustomer(c.id)}
                className="app-card p-5 rounded-2xl border border-slate-200/90 dark:border-purple-800/80 shadow-xs hover:border-purple-500/60 dark:hover:border-purple-500/60 cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3 truncate">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-purple-950/60 border border-blue-200 dark:border-purple-800/60 flex items-center justify-center text-blue-600 dark:text-purple-300 font-bold text-xs shrink-0 shadow-2xs">
                        {initials}
                      </div>
                      <div className="truncate">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-purple-300 transition-colors truncate">
                          {c.name}
                        </h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-purple-950/60 text-blue-700 dark:text-purple-300 border border-blue-200/80 dark:border-purple-800/60 font-mono mt-0.5">
                          #{c.id}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(c)}
                        title="Edit Customer"
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-purple-300 bg-slate-50 dark:bg-[#0B1120] hover:bg-blue-50 dark:hover:bg-purple-900/40 rounded-lg border border-slate-200 dark:border-purple-800/60 transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCustomerId(c.id)}
                        title="Delete Customer"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-slate-600 dark:text-slate-300">
                    <div className="flex items-center space-x-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-xs">{c.phone}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT CUSTOMER WIZARD MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <CustomerFormModal
            customer={editingCustomer}
            companySettings={companySettings}
            onClose={() => {
              setIsModalOpen(false);
              setEditingCustomer(null);
            }}
            onSuccess={() => {
              loadCustomers();
            }}
          />
        )}
      </AnimatePresence>

      {/* VIEW CUSTOMER HISTORY & LEDGER MODAL */}
      <AnimatePresence>
        {selectedCustomer && (
          <CustomerDetailsModal
            customer={selectedCustomer}
            currencySymbol={currencySymbol}
            isLoadingHistory={isLoadingHistory}
            onEdit={() => {
              const c = selectedCustomer;
              setSelectedCustomer(null);
              handleOpenEditModal(c);
            }}
            onClose={() => setSelectedCustomer(null)}
          />
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION DIALOG */}
      <AnimatePresence>
        {deletingCustomerId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="app-card bg-white dark:bg-[#0E1628] rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 border border-slate-200 dark:border-purple-800/80"
            >
              <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400 font-bold text-sm">
                <AlertCircle className="w-5 h-5" />
                <span>Confirm Customer Deletion</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                Are you sure you want to delete this customer? Historical sales records will be preserved in the system.
              </p>
              <div className="flex justify-end space-x-2.5 pt-2">
                <button
                  onClick={() => setDeletingCustomerId(null)}
                  className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteCustomer(deletingCustomerId)}
                  disabled={isDeleting}
                  style={{ color: '#ffffff' }}
                  className="btn-danger btn-pure-white customer-btn !text-white text-white px-4 py-2 text-xs font-bold cursor-pointer"
                >
                  <span className="!text-white text-white font-bold" style={{ color: '#ffffff' }}>
                    {isDeleting ? 'Deleting...' : 'Delete Customer'}
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
