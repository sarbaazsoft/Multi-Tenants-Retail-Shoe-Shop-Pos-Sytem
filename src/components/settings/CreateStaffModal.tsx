import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserPlus,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  Phone,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  KeyRound,
  Store,
  Shield,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { toTitleCaseLive, toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat.ts';

interface CreateStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: () => void;
}

export const CreateStaffModal: React.FC<CreateStaffModalProps> = ({
  isOpen,
  onClose,
  onUserCreated,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'CASHIER' as 'ADMIN' | 'CASHIER',
    status: 'APPROVED' as 'APPROVED' | 'PENDING',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateStep1 = () => {
    setErrorMessage(null);
    if (!formData.name.trim()) {
      setErrorMessage('Staff full name is required.');
      return false;
    }
    if (!formData.email.trim()) {
      setErrorMessage('Email address is required.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setErrorMessage('Please provide a valid email address (e.g. cashier@shoestore.com).');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    setErrorMessage(null);
    if (!formData.password) {
      setErrorMessage('Password is required.');
      return false;
    }
    if (formData.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return false;
    }
    return true;
  };

  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep2()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.settings.createUser({
        name: toTitleCaseTrimmed(formData.name),
        email: toLowerTrimmed(formData.email),
        phone: formData.phone.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        role: formData.role,
        status: formData.status,
      });

      setSuccessMessage(res.message || 'Staff account created successfully!');
      onUserCreated();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create staff account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER & 2-STEP WIZARD STEPPER ALIGNED WITH PRODUCT FORM MODAL */}
        <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                  Create Staff / Cashier Account
                </h3>
                <p className="text-xs text-slate-500 dark:text-purple-200/80">
                  Step {currentStep} of 2 • Provision Cashier or Administrator with direct authorization
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 2-Step Stepper Navigation */}
          <div className="grid grid-cols-2 gap-2">
            {/* Step 1 Tab */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 1
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : currentStep > 1
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 1
                    ? 'bg-white text-blue-600'
                    : currentStep > 1
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                {currentStep > 1 ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 1</span>
                <span className="block text-xs font-semibold truncate">Staff Profile &amp; Role</span>
              </div>
            </button>

            {/* Step 2 Tab */}
            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setCurrentStep(2);
              }}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 2
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 2
                    ? 'bg-white text-blue-600'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                2
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 2</span>
                <span className="block text-xs font-semibold truncate">Security &amp; Credentials</span>
              </div>
            </button>
          </div>
        </div>

        {/* WIZARD FORM CONTENT */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (currentStep === 1) {
              if (validateStep1()) setCurrentStep(2);
            } else {
              handleFormSubmit();
            }
          }}
          className="flex-1 overflow-y-auto p-6 space-y-5 text-xs bg-slate-50/50 dark:bg-[#070B14]"
        >
          {errorMessage && (
            <div className="alert-danger flex items-center gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* STEP 1: STAFF PROFILE & SYSTEM ROLE */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Card 1: Basic Information */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>1. Staff Information</span>
                  </h5>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Step 1 of 2</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Staff Full Name <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Tariq Mehmood"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: toTitleCaseLive(e.target.value) })}
                        className="capitalize w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#0F172A] border border-gray-300 dark:border-purple-500/30 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Login Email Address <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="cashier@shoestore.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#0F172A] border border-gray-300 dark:border-purple-500/30 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Contact Phone (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Phone className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        placeholder="+92 300 1234567"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#0F172A] border border-gray-300 dark:border-purple-500/30 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Role Selection */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>System Role Assignment</span>
                  </h5>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                    Select One
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* CASHIER Option */}
                  <div
                    onClick={() => setFormData({ ...formData, role: 'CASHIER' })}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between relative ${
                      formData.role === 'CASHIER'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 dark:border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0E1526] hover:border-slate-300 dark:hover:border-purple-800/60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                            formData.role === 'CASHIER'
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Store className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white text-xs block">
                            CASHIER
                          </span>
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                            POS Sales Operator
                          </span>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                          formData.role === 'CASHIER'
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {formData.role === 'CASHIER' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Barcode scanning checkout, receipts printing, and sales returns for daily retail counter operations.
                    </p>
                  </div>

                  {/* ADMIN Option */}
                  <div
                    onClick={() => setFormData({ ...formData, role: 'ADMIN' })}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between relative ${
                      formData.role === 'ADMIN'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 dark:border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0E1526] hover:border-slate-300 dark:hover:border-purple-800/60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                            formData.role === 'ADMIN'
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white text-xs block">
                            ADMINISTRATOR
                          </span>
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                            Full Control
                          </span>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                          formData.role === 'ADMIN'
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {formData.role === 'ADMIN' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Complete inventory management, purchase orders, financial reports, user approvals &amp; system settings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: SECURITY, PERMISSIONS & ACCESS STATUS */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Card 1: Access Status */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>2. Account Status &amp; Authorization</span>
                  </h5>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Step 2 of 2</span>
                </div>

                <div>
                  <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                    Initial Access Status
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'APPROVED' })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        formData.status === 'APPROVED'
                          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 dark:border-emerald-600/70 ring-1 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-purple-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300 text-xs">
                          APPROVED (Active)
                        </span>
                        {formData.status === 'APPROVED' && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        Can log in and ring up sales immediately.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'PENDING' })}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        formData.status === 'PENDING'
                          ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 dark:border-amber-600/70 ring-1 ring-amber-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-purple-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-700 dark:text-amber-300 text-xs">
                          PENDING (Review)
                        </span>
                        {formData.status === 'PENDING' && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        Staff account created on hold until unlocked.
                      </p>
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 2: Password Credentials */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>Login Password</span>
                  </h5>
                  <span className="text-[10px] text-purple-600 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    Min 6 Characters
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Password */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Account Password <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full pl-3 pr-10 py-2.5 bg-white dark:bg-[#0F172A] border border-gray-300 dark:border-purple-500/30 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Confirm Password <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className="w-full pl-3 pr-10 py-2.5 bg-white dark:bg-[#0F172A] border border-gray-300 dark:border-purple-500/30 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Real-time Match status */}
                {formData.password && formData.confirmPassword && (
                  <div
                    className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
                      formData.password === formData.confirmPassword
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                    }`}
                  >
                    {formData.password === formData.confirmPassword ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Passwords match securely.</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Passwords do not match yet.</span>
                      </>
                    )}
                  </div>
                )}

                {/* Summary Box */}
                <div className="p-3 bg-slate-50 dark:bg-purple-950/20 border border-slate-200 dark:border-purple-900/40 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                      {formData.name.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-xs">
                        {formData.name || 'New Staff Member'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-purple-300/70 font-mono">
                        {formData.email || 'email@shoestore.com'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        formData.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}
                    >
                      {formData.role}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        formData.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {formData.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FOOTER NAVIGATION & ACTION BUTTONS ALIGNED WITH PRODUCT FORM MODAL */}
          <div className="pt-4 -mx-6 -mb-6 p-6 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-gray-200 dark:border-purple-800/80 flex items-center justify-between">
            <div>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setCurrentStep(1);
                  }}
                  className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentStep === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (validateStep1()) setCurrentStep(2);
                  }}
                  className="btn-primary px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm font-bold"
                >
                  <span>Next: Security &amp; Credentials</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFormSubmit}
                  disabled={isSubmitting}
                  className="btn-primary px-6 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-md font-bold disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Creating Staff Account...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm &amp; Create Account</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
