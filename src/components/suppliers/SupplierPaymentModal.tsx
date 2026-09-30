import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CreditCard,
  Calendar,
  Hash,
  X,
  CheckCircle2,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { formatStockPrice, cleanStockPriceInput } from '../../utils/priceFormat.ts';
import { toTitleCaseLive, toTitleCaseTrimmed } from '../../utils/textFormat.ts';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: {
    id: number;
    name: string;
    phone?: string;
    net_payable_balance?: number | string;
    balance?: number | string;
    total_purchased_amount?: number | string;
    total_returns_amount?: number | string;
    total_paid_amount?: number | string;
  } | null;
  suppliersList?: Array<{
    id: number;
    name: string;
    phone?: string;
    net_payable_balance?: number | string;
    balance?: number | string;
    total_purchased_amount?: number | string;
    total_returns_amount?: number | string;
    total_paid_amount?: number | string;
  }>;
  currencySymbol: string;
  onSuccess: () => void;
  purchaseId?: number;
  purchaseNumber?: string;
  defaultAmount?: number;
}

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  supplier,
  suppliersList,
  currencySymbol,
  onSuccess,
  purchaseId,
  purchaseNumber,
  defaultAmount,
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(supplier?.id || 0);

  React.useEffect(() => {
    if (supplier?.id) {
      setSelectedSupplierId(supplier.id);
    }
  }, [supplier?.id]);

  const activeSupplier =
    suppliersList && suppliersList.length > 0
      ? suppliersList.find((s) => s.id === selectedSupplierId) || supplier
      : supplier;

  const [amount, setAmount] = useState<string>(
    defaultAmount !== undefined && defaultAmount > 0 ? cleanStockPriceInput(defaultAmount) : ''
  );
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE'>('CASH');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !activeSupplier) return null;

  const calcPayable = (sup: any) => {
    if (!sup) return 0;
    if (sup.net_payable_balance !== undefined) return parseFloat(String(sup.net_payable_balance)) || 0;
    if (sup.balance !== undefined) return parseFloat(String(sup.balance)) || 0;
    const p = parseFloat(String(sup.total_purchased_amount || 0));
    const r = parseFloat(String(sup.total_returns_amount || 0));
    const paid = parseFloat(String(sup.total_paid_amount || 0));
    return Math.max(0, p - r - paid);
  };

  const currentPayable = calcPayable(activeSupplier);

  const handlePayFullBalance = () => {
    if (currentPayable > 0) {
      setAmount(cleanStockPriceInput(currentPayable));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(cleanStockPriceInput(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid payment amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await api.suppliers.recordPayment(activeSupplier.id, {
        amount: numAmount,
        paymentDate,
        paymentMethod,
        referenceNumber: referenceNumber.trim(),
        notes: toTitleCaseTrimmed(notes),
        purchaseId: purchaseId || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record supplier payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-900/60 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col my-8"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-purple-900/40 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent dark:from-purple-950/40 dark:to-slate-900">
            <div className="flex items-center space-x-3">
              <span className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                <CreditCard className="w-5 h-5 stroke-[2.2]" />
              </span>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Record Supplier Payment</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Credit payment voucher &amp; update ledger balance
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Supplier Info & Balance Card */}
          <div className="p-5 space-y-4">
            <div className="bg-slate-50 dark:bg-purple-950/20 border border-slate-200/80 dark:border-purple-800/40 rounded-xl p-3.5 space-y-2">
              {suppliersList && suppliersList.length > 1 && !purchaseId && (
                <div className="pb-2 border-b border-slate-200 dark:border-purple-800/40">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Select Supplier / Vendor
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      const newId = Number(e.target.value);
                      setSelectedSupplierId(newId);
                      const target = suppliersList.find((s) => s.id === newId);
                      if (target) {
                        const bal = calcPayable(target);
                        if (bal > 0) setAmount(String(bal));
                      }
                    }}
                    className="capitalize w-full px-3 py-1.5 bg-white dark:bg-purple-500/20 border border-slate-200 dark:border-purple-400/40 rounded-lg text-xs font-bold text-slate-900 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer"
                  >
                    {suppliersList.map((s) => {
                      const bal = calcPayable(s);
                      return (
                        <option key={s.id} value={s.id} className="dark:bg-[#120726] dark:text-purple-100">
                          {s.name} (Due: {currencySymbol} {formatStockPrice(bal)})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-purple-500/20 text-blue-700 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {activeSupplier.name}
                    </div>
                    {activeSupplier.phone && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Phone: {activeSupplier.phone}
                      </div>
                    )}
                    {purchaseNumber && (
                      <div className="text-[11px] font-semibold text-blue-600 dark:text-purple-300 mt-0.5">
                        Target Invoice: {purchaseNumber}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 pl-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Current Net Balance
                  </div>
                  <div className={`text-base font-black font-mono ${currentPayable > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {currencySymbol} {formatStockPrice(currentPayable)}
                  </div>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Payment Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Payment Amount ({currencySymbol}) <span className="text-rose-500">*</span>
                  </label>
                  {currentPayable > 0 && (
                    <button
                      type="button"
                      onClick={handlePayFullBalance}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Pay Full Balance ({currencySymbol} {formatStockPrice(currentPayable)})
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-xs">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="Enter payment amount..."
                    value={amount}
                    onChange={(e) => setAmount(cleanStockPriceInput(e.target.value))}
                    onBlur={(e) => setAmount(cleanStockPriceInput(e.target.value))}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-purple-800/60 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Method <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'CASH', label: 'Cash' },
                    { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
                    { id: 'CHEQUE', label: 'Cheque' },
                    { id: 'ONLINE', label: 'Online / App' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition cursor-pointer ${
                        paymentMethod === m.id
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-purple-900/40 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date and Reference Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Payment Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-purple-800/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Ref / Cheque # (Optional)
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. CHQ-8902, TXN-4910"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-purple-800/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>
              </div>

              {/* Notes / Memo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Notes / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Paid balance for February shipments via Bank Al Habib..."
                  value={notes}
                  onChange={(e) => setNotes(toTitleCaseLive(e.target.value))}
                  className="capitalize w-full p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-purple-800/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ color: '#ffffff' }}
                  className="btn-pure-white supplier-btn inline-flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 !text-white text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="!text-white text-white" style={{ color: '#ffffff' }}>Recording Payment...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 !text-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                      <span className="!text-white font-bold text-white" style={{ color: '#ffffff' }}>Confirm &amp; Record Payment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
