import React, { useState } from 'react';
import { RotateCcw, Search, AlertCircle, CheckCircle2, Repeat } from 'lucide-react';
import { api } from '../../services/api.ts';
import { playAudioFeedback } from '../../utils/audio.ts';
import { formatStockPrice } from '../../utils/priceFormat.ts';
import { toTitleCaseLive, toTitleCaseTrimmed } from '../../utils/textFormat.ts';
import type { ActiveExchange, ExchangeItem } from '../../types.ts';

interface SalesReturnViewProps {
  currentUser?: any;
  companySettings: any;
  onStartExchange?: (exchange: ActiveExchange) => void;
}

export const SalesReturnView: React.FC<SalesReturnViewProps> = ({
  currentUser: _currentUser,
  companySettings,
  onStartExchange,
}) => {
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [verifiedSale, setVerifiedSale] = useState<any | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('Customer exchange / fit issue');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState<any | null>(null);

  const currencySymbol = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';

  const handleVerifyInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const inv = invoiceSearch.trim();
    if (!inv) return;

    setIsVerifying(true);
    setErrorMessage(null);
    setReturnSuccess(null);
    try {
      const res = await api.returns.verifyInvoice(inv);
      const saleObj = res.sale || {};
      const saleItems = res.items || saleObj.items || [];
      setVerifiedSale({ ...saleObj, items: saleItems });

      // Initialize return quantities
      const initialQtys: Record<number, number> = {};
      saleItems.forEach((item: any) => {
        initialQtys[item.id] = 0;
      });
      setReturnQtys(initialQtys);
      playAudioFeedback.barcodeScan();
    } catch (err: any) {
      playAudioFeedback.warning();
      setErrorMessage(err.message || 'Invoice verification failed.');
      setVerifiedSale(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleQtyChange = (itemId: number, qty: number, maxReturnable: number) => {
    const safeMax = Number.isFinite(maxReturnable) ? Math.max(0, maxReturnable) : 0;
    const safeQty = Number.isFinite(qty) ? qty : 0;
    const valid = Math.max(0, Math.min(safeQty, safeMax));
    setReturnQtys((prev) => ({ ...prev, [itemId]: valid }));
  };

  // Helper to extract normalized numeric fields from verified sale item
  const getItemMetrics = (item: any) => {
    const soldQty = Number(item.soldQuantity ?? item.quantity ?? 0) || 0;
    const alreadyReturned = Number(item.alreadyReturnedQuantity ?? item.already_returned_qty ?? 0) || 0;
    const maxReturnable =
      item.returnableQuantity !== undefined && !isNaN(Number(item.returnableQuantity))
        ? Math.max(0, Number(item.returnableQuantity))
        : Math.max(0, soldQty - alreadyReturned);
    const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0) || 0;
    const subtotal = Number(item.subtotal ?? soldQty * unitPrice) || 0;
    const discount = Number(item.discount ?? 0) || 0;
    const netUnitPrice =
      soldQty > 0 ? (subtotal - discount) / soldQty : unitPrice;

    return {
      soldQty,
      alreadyReturned,
      maxReturnable,
      unitPrice,
      subtotal,
      discount,
      netUnitPrice: Number.isFinite(netUnitPrice) ? netUnitPrice : 0,
    };
  };

  // Calculate total refund
  const totalRefundAmount = verifiedSale
    ? (verifiedSale.items || []).reduce((acc: number, item: any) => {
        const qty = Number(returnQtys[item.id] || 0) || 0;
        const { netUnitPrice } = getItemMetrics(item);
        return acc + qty * netUnitPrice;
      }, 0)
    : 0;

  const handleSubmitReturn = async () => {
    if (!verifiedSale) return;
    const saleItems: any[] = verifiedSale.items || [];
    const itemsToReturn = Object.entries(returnQtys)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([saleItemId, qty]) => {
        const matchedItem = saleItems.find((i: any) => Number(i.id) === Number(saleItemId));
        const { netUnitPrice } = matchedItem ? getItemMetrics(matchedItem) : { netUnitPrice: 0 };
        return {
          saleItemId: Number(saleItemId),
          productId: matchedItem?.productId ?? matchedItem?.product_id,
          quantity: Number(qty),
          unitRefundPrice: netUnitPrice,
        };
      });

    if (itemsToReturn.length === 0) {
      return setErrorMessage('Select at least one shoe item quantity to return.');
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.returns.create({
        originalSaleId: verifiedSale.id,
        saleId: verifiedSale.id,
        reason: toTitleCaseTrimmed(reason) || 'Customer Return',
        items: itemsToReturn,
      });

      playAudioFeedback.saleSuccess();
      setReturnSuccess(res);
      setVerifiedSale(null);
      setInvoiceSearch('');
    } catch (err: any) {
      playAudioFeedback.warning();
      setErrorMessage(err.message || 'Failed to process return.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-xs flex items-center justify-between dark:text-white transition-colors">
        <div>
          <div className="flex items-center space-x-3 text-gray-900 dark:text-white">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-400/30 flex items-center justify-center shrink-0 shadow-2xs">
              <RotateCcw className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white tracking-tight">Customer Shoe Returns & Exchanges</h2>
                <span className="bg-blue-100 dark:bg-purple-500/30 text-blue-700 dark:text-purple-200 border border-blue-200 dark:border-purple-400/40 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wide">
                  POS Audit & Restock
                </span>
              </div>
              <p className="text-gray-500 dark:text-purple-200/80 text-xs mt-0.5">
                Scan invoice barcode to inspect original purchase, return items, and restock inventory
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Search Input */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-xs space-y-3 transition-colors dark:text-white">
        <form onSubmit={handleVerifyInvoice} className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 dark:text-purple-300/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Scan Invoice Barcode or enter Invoice # (e.g. INV-20260906-0001)..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-3 border-2 border-indigo-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 dark:bg-purple-950/40 dark:text-purple-100 dark:placeholder-purple-300/50 dark:border-purple-700/60 dark:focus:border-purple-400 dark:focus:ring-purple-500/40 rounded-xl font-mono font-bold text-sm outline-none transition shadow-2xs"
            />
          </div>
          <button
            type="submit"
            disabled={isVerifying}
            className="h-11 px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50 active:scale-95"
          >
            <Search className="w-4 h-4" />
            <span>{isVerifying ? 'Searching...' : 'Verify Invoice'}</span>
          </button>
        </form>

        {errorMessage && (
          <div className="alert-danger flex items-center space-x-2 animate-in fade-in dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-rose-400" />
            <span className="text-xs">{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Return Success Banner */}
      {returnSuccess && (
        <div className="alert-success p-5 rounded-2xl space-y-3 animate-in fade-in dark:bg-emerald-950/30 dark:border-emerald-900/60">
          <div className="flex items-center space-x-3 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">Return Processed Successfully!</h3>
              <p className="text-emerald-700 dark:text-emerald-300/80 text-xs">
                Return Number: <strong className="font-mono font-bold">{returnSuccess.returnNumber}</strong> • Stock has been restored in PostgreSQL
              </p>
            </div>
          </div>
          <div className="p-3.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800/60 rounded-xl flex justify-between items-center text-xs font-bold text-gray-900 dark:text-emerald-100 shadow-2xs">
            <span>Customer Refund Amount:</span>
            <span className="font-mono text-emerald-700 dark:text-emerald-400 text-base font-black">
              {currencySymbol} {formatStockPrice(returnSuccess.totalRefundAmount ?? returnSuccess.refundAmount ?? 0)}
            </span>
          </div>
        </div>
      )}

      {/* Verified Invoice Items Table for Return Selection */}
      {verifiedSale && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-xs space-y-5">
          {/* Sale Summary Header */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-purple-950/30 border border-slate-200 dark:border-purple-800/60 rounded-xl">
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-purple-300/80">Invoice Number</span>
              <p className="font-mono font-bold text-indigo-600 dark:text-purple-300 mt-0.5">{verifiedSale.invoiceNumber || verifiedSale.invoice_number}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-purple-300/80">Date Sold</span>
              <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{verifiedSale.saleDate || verifiedSale.sale_date}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-purple-300/80">Customer</span>
              <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{verifiedSale.customerName || verifiedSale.customer_name || 'Walk-in'}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-purple-300/80">Cashier</span>
              <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{verifiedSale.cashierName || verifiedSale.cashier_name || 'Counter'}</p>
            </div>
          </div>

          {/* Items Return Table */}
          <div className="border border-slate-200 dark:border-purple-800/80 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/90 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-700 dark:text-white font-semibold border-b border-slate-200 dark:border-purple-800/80 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Article</th>
                  <th className="py-2.5 px-3 text-center">Original Qty</th>
                  <th className="py-2.5 px-3 text-center">Already Returned</th>
                  <th className="py-2.5 px-3 text-center">Available Return</th>
                  <th className="py-2.5 px-3 text-center w-28">Return Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Refund Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-purple-900/40 text-xs">
                {(verifiedSale.items || []).map((item: any) => {
                  const { soldQty, alreadyReturned, maxReturnable, netUnitPrice } = getItemMetrics(item);
                  const selectedQty = Number(returnQtys[item.id] || 0) || 0;
                  const refundLine = selectedQty * netUnitPrice;

                  return (
                    <tr key={item.id} className="hover:bg-indigo-50/20 dark:hover:bg-purple-950/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-900 dark:text-white">{item.article || item.productName || item.product_name}</div>
                      </td>

                      <td className="py-3 px-3 text-center font-mono font-medium text-gray-800 dark:text-purple-200">
                        {soldQty}
                      </td>

                      <td className="py-3 px-3 text-center font-mono text-gray-500 dark:text-purple-300/70">
                        {alreadyReturned}
                      </td>

                      <td className="py-3 px-3 text-center font-mono font-bold text-indigo-600 dark:text-purple-300">
                        {maxReturnable}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max={String(maxReturnable)}
                          value={String(selectedQty)}
                          disabled={maxReturnable <= 0}
                          onChange={(e) =>
                            handleQtyChange(
                              item.id,
                              parseInt(e.target.value, 10) || 0,
                              maxReturnable
                            )
                          }
                          className="w-16 px-2 py-1 text-center font-bold font-mono border border-gray-300 dark:border-purple-700/70 dark:bg-purple-950/50 dark:text-white rounded-lg focus:border-indigo-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-purple-500/30 outline-none disabled:bg-gray-100 dark:disabled:bg-slate-800 text-gray-900"
                        />
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-gray-700 dark:text-purple-200">
                        {currencySymbol} {formatStockPrice(netUnitPrice)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-gray-900 dark:text-purple-200">
                        {currencySymbol} {formatStockPrice(refundLine)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Reason & Refund Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block font-bold text-gray-700 dark:text-purple-200 mb-1">Reason for Return <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(toTitleCaseLive(e.target.value))}
                placeholder="e.g. Size didn't fit, defective sole, customer exchanged for different color"
                className="capitalize w-full px-3 py-2.5 border border-gray-300 dark:border-purple-800/60 rounded-xl outline-none focus:border-indigo-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-purple-500/30 font-medium text-xs bg-white dark:bg-slate-950/60 text-gray-900 dark:text-white dark:placeholder-purple-300/40"
              />
            </div>

            <div className="p-3.5 bg-indigo-50/70 dark:bg-purple-950/40 border border-indigo-200 dark:border-purple-800/60 rounded-xl flex justify-between items-center shadow-2xs">
              <span className="font-bold text-gray-900 dark:text-white text-xs">TOTAL REFUND AMOUNT:</span>
              <span className="font-mono font-black text-lg text-indigo-600 dark:text-purple-200">
                {currencySymbol} {formatStockPrice(totalRefundAmount)}
              </span>
            </div>
          </div>

          {/* Submit Return or Direct Exchange */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-purple-800/60">
            <button
              type="button"
              onClick={() => setVerifiedSale(null)}
              className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer rounded-xl dark:bg-purple-950/40 dark:border-purple-800/60 dark:text-purple-200 dark:hover:bg-purple-900/50"
            >
              Cancel
            </button>

            <div className="flex items-center space-x-2">
              {onStartExchange && (
                <button
                  type="button"
                  disabled={isSubmitting || totalRefundAmount <= 0}
                  onClick={() => {
                    if (!verifiedSale) return;
                    const exchangeItems: ExchangeItem[] = [];
                    (verifiedSale.items || []).forEach((item: any) => {
                      const qty = Number(returnQtys[item.id] || 0) || 0;
                      if (qty > 0) {
                        const { netUnitPrice } = getItemMetrics(item);
                        exchangeItems.push({
                          saleItemId: item.id,
                          productId: item.productId ?? item.product_id,
                          article: item.article || item.productName || item.product_name || 'Shoe',
                          productName: item.productName || item.product_name || item.article || 'Shoe',
                          sku: item.sku || item.product_sku,
                          barcode: item.barcode,
                          quantity: qty,
                          unitRefundPrice: netUnitPrice,
                          subtotal: Math.round(qty * netUnitPrice * 100) / 100,
                        });
                      }
                    });

                    if (exchangeItems.length === 0) {
                      setErrorMessage('Select at least one shoe quantity to exchange.');
                      return;
                    }

                    onStartExchange({
                      originalSaleId: verifiedSale.id,
                      originalInvoiceNumber: verifiedSale.invoiceNumber || verifiedSale.invoice_number,
                      originalSaleDate: verifiedSale.saleDate || verifiedSale.sale_date,
                      customerId: verifiedSale.customerId ?? verifiedSale.customer_id ?? null,
                      customerName: verifiedSale.customerName || verifiedSale.customer_name,
                      customerPhone: verifiedSale.customerPhone || verifiedSale.customer_phone,
                      reason: reason.trim() || 'Direct Shoe Exchange at POS',
                      items: exchangeItems,
                    });
                  }}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 text-slate-900 bg-amber-400 hover:bg-amber-500 border border-amber-500/30"
                  title="Forward returned shoe to POS to pick replacement and settle net difference"
                >
                  <Repeat className="w-4 h-4 text-slate-900" />
                  <span>Exchange Shoe in POS Cart &rarr;</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSubmitting || totalRefundAmount <= 0}
                onClick={handleSubmitReturn}
                className="btn-primary px-6 py-2.5 text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Processing Return...' : 'Authorize Refund & Restock Inventory'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
