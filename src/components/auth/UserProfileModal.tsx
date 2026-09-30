import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  User,
  Phone,
  Mail,
  Lock,
  Key,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  X,
  Save,
  Camera,
  Upload,
  Trash2,
  Link as LinkIcon,
  ImageIcon,
  Download,
  Monitor,
} from 'lucide-react';
import { api, setAuthToken } from '../../services/api.ts';
import { UserAvatar } from '../common/UserAvatar.tsx';
import { InstallAppModal } from '../common/InstallAppModal.tsx';
import { useScrollActiveTab } from '../../hooks/useScrollActiveTab.ts';
import { toTitleCaseLive, toTitleCaseTrimmed } from '../../utils/textFormat.ts';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onUserUpdated: (user: any) => void;
  storeName?: string;
}

// Client-side image resize and compression helper for fast, compact storage
function compressAndConvertImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (PNG, JPG, WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for processing.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  storeName,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const { containerRef: profileTabContainerRef } = useScrollActiveTab<HTMLDivElement>(activeTab, {
    padding: 16,
    behavior: 'smooth',
  });

  // Profile info state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isUrlInputVisible, setIsUrlInputVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser && isOpen) {
      setName(currentUser.name || '');
      setPhone(currentUser.phone || '');
      setAvatarUrl(currentUser.avatarUrl || currentUser.avatar_url || '');
      setIsUrlInputVisible(false);
      setIsDragging(false);
      setProfileSuccess('');
      setProfileError('');
      setPasswordSuccess('');
      setPasswordError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const handleFileProcess = async (file: File) => {
    try {
      setProfileError('');
      const compressedDataUrl = await compressAndConvertImage(file);
      setAvatarUrl(compressedDataUrl);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to process uploaded image.');
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileProcess(file);
    }
    // reset input so the same file can be re-selected if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFileProcess(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleRemovePhoto = () => {
    setAvatarUrl('');
    setIsUrlInputVisible(false);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!name.trim()) {
      setProfileError('Name cannot be empty.');
      return;
    }

    setProfileLoading(true);
    try {
      const res = await api.auth.updateProfile({
        name: toTitleCaseTrimmed(name),
        phone: phone.trim(),
        avatarUrl: avatarUrl.trim(),
      });

      if (res.token) {
        setAuthToken(res.token);
      }
      onUserUpdated(res.user);
      setProfileSuccess('Profile and image settings updated successfully!');
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Please enter your previous/current password.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      setPasswordError('Please provide both new password and confirm password.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await api.auth.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setPasswordSuccess(res.message || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 5000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const isPasswordMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const isPasswordMismatch = confirmPassword && newPassword !== confirmPassword;
  const hasCustomImage = Boolean(avatarUrl && avatarUrl.trim());

  return (
    <div
      id="user-profile-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="user-profile-modal-card"
        className="bg-white dark:bg-[#131B2E] w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-purple-800/80 overflow-hidden flex flex-col my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-900 dark:text-white">
          <div className="flex items-center space-x-3">
            <UserAvatar
              name={currentUser?.name}
              avatarUrl={avatarUrl || currentUser?.avatarUrl || currentUser?.avatar_url}
              role={currentUser?.role}
              size="md"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">My Account &amp; Profile</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    currentUser?.role === 'ADMIN'
                      ? 'bg-blue-500/15 text-blue-700 dark:text-purple-200 border border-blue-500/30 dark:border-purple-400/40 dark:bg-purple-500/20'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {currentUser?.role === 'ADMIN' ? 'Store Owner' : 'Salesperson'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-0.5">
                Manage your staff photo, display name, phone, and security credentials
              </p>
            </div>
          </div>
          <button
            id="close-profile-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection - Responsive Scrollable Underline Navigation */}
        <div 
          ref={profileTabContainerRef}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          className="flex border-b border-slate-200 dark:border-[#1A263D] bg-slate-50/80 dark:bg-slate-950/60 px-6 pt-2.5 space-x-6 overflow-x-auto no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden"
        >
          <button
            id="profile-details-tab-btn"
            data-active={activeTab === 'profile'}
            data-tab="profile"
            onClick={() => setActiveTab('profile')}
            className={`tab-underline-link relative pb-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'profile'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-300'
            }`}
          >
            <User className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'profile' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Profile &amp; Photo</span>
            {activeTab === 'profile' && (
              <motion.div
                layoutId="profileActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
          <button
            id="profile-security-tab-btn"
            data-active={activeTab === 'password'}
            data-tab="password"
            onClick={() => setActiveTab('password')}
            className={`tab-underline-link relative pb-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'password'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-300'
            }`}
          >
            <Key className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'password' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Change Password</span>
            {activeTab === 'password' && (
              <motion.div
                layoutId="profileActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>

          {/* Scroll End Buffer Spacer: Ensures the last tab is 100% visible and never clipped */}
          <div className="tab-end-spacer shrink-0 w-8 sm:w-10 h-1 pointer-events-none self-stretch" aria-hidden="true" role="presentation" />
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="space-y-5">
              {profileSuccess && (
                <div className="alert alert-success flex items-center space-x-2 p-3 rounded-xl text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              {profileError && (
                <div className="alert alert-danger flex items-center space-x-2 p-3 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              {/* PROFILE IMAGE UPLOAD SECTION */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-[#1A263D] rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                    <Camera className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Profile Picture</span>
                  </label>
                  <span className="badge badge-neutral">
                    Optional
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Live Avatar Preview */}
                  <div className="relative group shrink-0">
                    <UserAvatar
                      name={name || currentUser?.name}
                      avatarUrl={avatarUrl}
                      role={currentUser?.role}
                      size="xl"
                      className="shadow-md"
                    />
                    {hasCustomImage && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        title="Remove photo and switch back to avatar"
                        className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-md transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Upload Controls & Dropzone */}
                  <div className="flex-1 w-full space-y-2">
                    {/* Drag & Drop Target / Upload Button */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-3 text-center transition cursor-pointer ${
                        isDragging
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                          : 'border-slate-300 dark:border-slate-700/80 hover:border-blue-600 dark:hover:border-blue-400 bg-white dark:bg-slate-900/60'
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      <div className="flex items-center justify-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
                        <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                          Choose image
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">or drag &amp; drop</span>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        PNG, JPG, or WebP (auto-resized &amp; optimized)
                      </p>
                    </div>

                    {/* Secondary Actions: URL Toggle & Remove */}
                    <div className="flex items-center justify-between text-[11px] pt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsUrlInputVisible(!isUrlInputVisible)}
                        className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium flex items-center space-x-1 cursor-pointer"
                      >
                        <LinkIcon className="w-3 h-3" />
                        <span>{isUrlInputVisible ? 'Hide URL link' : 'Or use Image URL'}</span>
                      </button>

                      {hasCustomImage && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium flex items-center space-x-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Reset to Default Avatar</span>
                        </button>
                      )}
                    </div>

                    {/* Image URL Input (Conditional) */}
                    {isUrlInputVisible && (
                      <div className="pt-1">
                        <input
                          type="url"
                          placeholder="https://images.unsplash.com/... or web URL"
                          value={avatarUrl}
                          onChange={(e) => setAvatarUrl(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 pt-2.5 border-t border-slate-200/80 dark:border-[#1A263D] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Profile image is optional. If left blank, your stylized initials avatar will be displayed.
                  </span>
                </p>
              </div>

              {/* Email Address - Strictly Unchangeable */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Email Address</span>
                  </label>
                  <span className="badge badge-neutral">
                    <Lock className="w-2.5 h-2.5 text-slate-400 inline mr-1" />
                    Unchangeable
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="profile-email-input"
                    type="email"
                    value={currentUser?.email || ''}
                    disabled
                    readOnly
                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium cursor-not-allowed select-none"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                  Email is your unique account identifier and cannot be changed.
                </p>
              </div>

              {/* Full Name - Editable */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center space-x-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Full Name *</span>
                  </span>
                </label>
                <input
                  id="profile-name-input"
                  type="text"
                  required
                  placeholder="e.g. Muhammad Ali or Sarah Khan"
                  value={name}
                  onChange={(e) => setName(toTitleCaseLive(e.target.value))}
                  className="capitalize w-full px-3.5 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-600 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              {/* Phone Number - Editable */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center space-x-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Phone Number</span>
                  </span>
                </label>
                <input
                  id="profile-phone-input"
                  type="tel"
                  placeholder="e.g. +92 300 1234567 or 0321-7654321"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-600 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Used for staff contact, shift management, and counter accountability.
                </p>
              </div>

              {/* Role & Status (Display Only) */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-[#1A263D] flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Assigned Role:</span>
                </div>
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  {currentUser?.role === 'ADMIN' ? 'Owner / Administrator' : 'Sales Person / Cashier'}
                </span>
              </div>

              {/* Desktop App & PWA Installation */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-[#1A263D] flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      Mobile &amp; Desktop POS App
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Android APK / WebAPK, Apple iOS Safari PWA, or Windows .EXE
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInstallModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition cursor-pointer shadow-2xs shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install App</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="px-6 py-4 -mx-6 -mb-6 mt-4 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary px-4 py-2 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="save-profile-btn"
                  type="submit"
                  disabled={profileLoading}
                  className="btn-primary flex items-center space-x-2 px-5 py-2 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{profileLoading ? 'Saving...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordSuccess && (
                <div className="alert alert-success flex items-center space-x-2 p-3 rounded-xl text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div className="alert alert-danger flex items-center space-x-2 p-3 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              {/* Previous / Current Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center space-x-1.5">
                    <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Previous / Current Password *</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="profile-current-password-input"
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-600 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Confirm your identity by providing your existing password.
                </p>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>New Password *</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="profile-new-password-input"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-600 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Confirm New Password *</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="profile-confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full pl-3.5 pr-10 py-2.5 bg-white dark:bg-slate-950/60 border rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition ${
                      isPasswordMismatch
                        ? 'border-red-400 focus:ring-2 focus:ring-red-500'
                        : isPasswordMatch
                        ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                        : 'border-slate-300 dark:border-slate-700/80 focus:border-blue-600 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Match indicator */}
                {confirmPassword && (
                  <div className="mt-1 flex items-center text-[11px]">
                    {isPasswordMatch ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Passwords match
                      </span>
                    ) : (
                      <span className="text-red-500 dark:text-red-400 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3" /> Passwords do not match
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="px-6 py-4 -mx-6 -mb-6 mt-4 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary px-4 py-2 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="submit-change-password-btn"
                  type="submit"
                  disabled={passwordLoading || Boolean(isPasswordMismatch)}
                  className="btn-primary flex items-center space-x-2 px-5 py-2 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{passwordLoading ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* PWA & Windows EXE Install Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        storeName={storeName}
      />
    </div>
  );
};
