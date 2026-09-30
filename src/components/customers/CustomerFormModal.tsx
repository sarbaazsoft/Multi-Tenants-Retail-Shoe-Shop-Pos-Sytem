import React, { useState } from 'react';
import {
  X,
  Users,
  Phone,
  User,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { toTitleCaseLive, toTitleCaseTrimmed } from '../../utils/textFormat.ts';

interface CustomerFormModalProps {
  customer?: any | null;
  companySettings: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  customer,
  companySettings: _companySettings,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Customer Name is required.');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: toTitleCaseTrimmed(name),
        phone: phone.trim(),
        email: '',
        address: '',
        notes: '',
      };

      if (customer) {
        await api.customers.update(customer.id, payload);
      } else {
        await api.customers.create(payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save customer details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-purple-800/80 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                {customer ? 'Edit Customer' : 'Add New Customer'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-purple-200/80">
                {customer ? `Update details for ID #${customer.id}` : 'Register customer with name and phone'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(toTitleCaseLive(e.target.value))}
                placeholder="e.g. Tariq Mehmood"
                autoFocus
                required
                className="capitalize w-full pl-[2.125rem] pr-4 py-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-purple-300/40 border border-slate-200 dark:border-purple-800/60 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 font-medium text-xs transition"
              />
            </div>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              Phone / Mobile Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0300-1234567"
                required
                className="w-full pl-[2.125rem] pr-4 py-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-purple-300/40 border border-slate-200 dark:border-purple-800/60 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 font-medium text-xs font-mono transition"
              />
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            style={{ color: '#ffffff' }}
            className="btn-primary btn-pure-white customer-btn !text-white text-white px-5 py-2 text-xs font-bold cursor-pointer flex items-center space-x-1.5"
          >
            {isSubmitting ? (
              <span className="!text-white text-white" style={{ color: '#ffffff' }}>Saving...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 !text-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                <span className="!text-white text-white font-bold" style={{ color: '#ffffff' }}>
                  {customer ? 'Update Customer' : 'Save Customer'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
