import React from 'react';
import {
  X,
  Edit2,
  Phone,
  Receipt,
  DollarSign,
  ShoppingBag,
  RefreshCw,
} from 'lucide-react';
import { formatStockPrice } from '../../utils/priceFormat.ts';

interface CustomerDetailsModalProps {
  customer: any;
  currencySymbol: string;
  isLoadingHistory: boolean;
  onEdit: () => void;
  onClose: () => void;
}

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
  customer,
  currencySymbol,
  isLoadingHistory,
  onEdit,
  onClose,
}) => {
  if (!customer) return null;

  const sales = customer.sales || [];
  const totalOrders = sales.length;
  const totalSpent = sales.reduce(
    (acc: number, s: any) => acc + (parseFloat(s.total_amount || s.totalAmount || 0) || 0),
    0
  );

  const initials = (customer.name || 'C')
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-purple-800/80">
        {/* Header with Gradient Accent matching Product Design */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-800 dark:text-white">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 dark:bg-purple-500/20 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center text-blue-600 dark:text-purple-300 font-bold text-sm shadow-2xs">
              {initials}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">{customer.name}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-purple-950/60 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-800/60 font-mono">
                  ID #{customer.id}
                </span>
              </div>
              <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-purple-200/80 mt-0.5">
                <span className="flex items-center space-x-1">
                  <Phone className="w-3 h-3" />
                  <span className="font-mono">{customer.phone}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onEdit}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="app-stat-card p-4 rounded-xl border border-slate-200 dark:border-purple-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Total Orders Placed
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-100 dark:border-purple-500/30 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                {totalOrders} {totalOrders === 1 ? 'invoice' : 'invoices'}
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Completed retail purchases</span>
            </div>

            <div className="app-stat-card p-4 rounded-xl border border-slate-200 dark:border-purple-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Lifetime Spend Value
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                {currencySymbol} {formatStockPrice(totalSpent)}
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Cumulative account total</span>
            </div>
          </div>

          {/* Purchase History Ledger */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-purple-900/50">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <Receipt className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Sales Invoice Ledger</span>
              </h4>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono">
                {sales.length} recorded purchases
              </span>
            </div>

            {isLoadingHistory ? (
              <div className="py-10 text-center text-slate-400 dark:text-slate-500 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
                <p className="font-medium text-xs">Loading invoice history...</p>
              </div>
            ) : sales.length === 0 ? (
              <div className="py-10 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-purple-800/60 rounded-xl bg-slate-50/50 dark:bg-[#0B1120]">
                No sales invoices recorded yet for {customer.name}.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-purple-800/80 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/90 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 text-slate-600 dark:text-white font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-purple-800/80">
                    <tr>
                      <th className="py-2.5 px-3.5">Invoice #</th>
                      <th className="py-2.5 px-3.5">Date</th>
                      <th className="py-2.5 px-3.5">Payment Method</th>
                      <th className="py-2.5 px-3.5 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-purple-900/40">
                    {sales.map((s: any) => (
                      <tr
                        key={s.id}
                        className="table-row-hover hover:bg-blue-50/30 dark:hover:bg-purple-900/30 transition"
                      >
                        <td className="py-2.5 px-3.5 font-mono font-bold text-blue-600 dark:text-cyan-400">
                          {s.invoice_number || s.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300">
                          {s.sale_date || s.saleDate || '-'}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-[#131D33] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-purple-800/50">
                            {s.payment_method || s.paymentMethod || 'Cash'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {currencySymbol} {formatStockPrice(s.total_amount || s.totalAmount || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="btn-secondary px-4 py-1.5 text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
