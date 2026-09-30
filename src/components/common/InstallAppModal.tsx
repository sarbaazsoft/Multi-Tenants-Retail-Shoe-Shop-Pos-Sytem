import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Download,
  Monitor,
  Smartphone,
  Apple,
  Check,
  X,
  ShieldCheck,
  Zap,
  Share2,
  PlusSquare,
  Sparkles,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useScrollActiveTab } from '../../hooks/useScrollActiveTab.ts';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName?: string;
}

type PlatformTab = 'android' | 'apple' | 'desktop';

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose, storeName }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<PlatformTab>('android');
  const effectiveStoreName = storeName || localStorage.getItem('cached_store_name') || 'TJ Shoes';
  const pwaAppName = `${effectiveStoreName} By SarbaazSoft`;

  const { containerRef: installTabContainerRef } = useScrollActiveTab<HTMLDivElement>(activeTab, {
    padding: 16,
    behavior: 'smooth',
  });
  const [downloadingExe, setDownloadingExe] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [downloadApkSuccess, setDownloadApkSuccess] = useState(false);

  // Set default tab based on user's detected operating system
  useEffect(() => {
    if (isOpen) {
      if (isAndroid) {
        setActiveTab('android');
      } else if (isIOS) {
        setActiveTab('apple');
      } else {
        setActiveTab('desktop');
      }
    }
  }, [isOpen, isAndroid, isIOS]);

  if (!isOpen) return null;

  const handleDownloadApk = () => {
    setDownloadingApk(true);
    const link = document.createElement('a');
    link.href = '/download/apk';
    link.download = 'StepSync-POS.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadingApk(false);
      setDownloadApkSuccess(true);
      setTimeout(() => setDownloadApkSuccess(false), 5000);
    }, 1000);
  };

  const handleDownloadExe = () => {
    setDownloadingExe(true);
    const link = document.createElement('a');
    link.href = '/download/exe';
    link.download = 'StepSync-POS-Desktop-Setup.exe';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadingExe(false);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
    }, 1200);
  };

  const handleInstallPWA = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onClose();
      }
    } else {
      alert(
        activeTab === 'android'
          ? 'To install on Android:\n1. Tap the three dots (⋮) in Chrome.\n2. Select "Install app" or "Add to Home screen".\n\nOr tap the "Download Android APK (.apk)" button directly!'
          : 'To install on your browser:\n1. Click the install icon (⊕) in the browser address bar.\n2. Or download the Windows .EXE file.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#0E1628] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 pr-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-2 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Install {pwaAppName}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                PWA &amp; App Support
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Universal support for Android phones/tablets, Apple iPhone/iPad, and Windows PC
            </p>
          </div>
        </div>

        {/* Platform Selector Tabs - Responsive Scrollable Underline Navigation */}
        <div 
          ref={installTabContainerRef}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          className="flex items-center sm:grid sm:grid-cols-3 gap-1 px-1 border-b border-slate-200/80 dark:border-purple-900/50 text-xs font-semibold overflow-x-auto no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden"
        >
          <button
            type="button"
            id="install-tab-android"
            data-active={activeTab === 'android'}
            data-tab="android"
            onClick={() => setActiveTab('android')}
            className={`tab-underline-link relative flex items-center justify-center gap-1.5 py-3 px-3 sm:px-2 transition-colors duration-300 cursor-pointer whitespace-nowrap shrink-0 sm:shrink ${
              activeTab === 'android'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
            <span>Android</span>
            {isAndroid && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
            {activeTab === 'android' && (
              <motion.div
                layoutId="installActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>

          <button
            type="button"
            id="install-tab-apple"
            data-active={activeTab === 'apple'}
            data-tab="apple"
            onClick={() => setActiveTab('apple')}
            className={`tab-underline-link relative flex items-center justify-center gap-1.5 py-3 px-3 sm:px-2 transition-colors duration-300 cursor-pointer whitespace-nowrap shrink-0 sm:shrink ${
              activeTab === 'apple'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Apple className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
            <span>Apple iOS</span>
            {isIOS && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            )}
            {activeTab === 'apple' && (
              <motion.div
                layoutId="installActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>

          <button
            type="button"
            id="install-tab-desktop"
            data-active={activeTab === 'desktop'}
            data-tab="desktop"
            onClick={() => setActiveTab('desktop')}
            className={`tab-underline-link relative flex items-center justify-center gap-1.5 py-3 px-3 sm:px-2 transition-colors duration-300 cursor-pointer whitespace-nowrap shrink-0 sm:shrink ${
              activeTab === 'desktop'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 text-blue-500" />
            <span>Windows / PC</span>
            {activeTab === 'desktop' && (
              <motion.div
                layoutId="installActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>

          {/* Scroll End Buffer Spacer: Ensures the last tab is 100% visible and never clipped */}
          <div className="tab-end-spacer shrink-0 w-8 sm:w-10 h-1 pointer-events-none self-stretch" aria-hidden="true" role="presentation" />
        </div>

        {/* TAB 1: ANDROID SUPPORT */}
        {activeTab === 'android' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/40 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  Android Package (.APK) &amp; WebAPK Ready
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                  Android 7.0+
                </span>
              </div>
              <p className="text-[11px] text-emerald-900/80 dark:text-emerald-300/80">
                Directly download the native Android application package file (<strong>.apk</strong>) to your phone or tablet, or install via Google Chrome / Samsung Internet.
              </p>
            </div>

            {/* Android APK Download Card (Primary) */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200/80 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  Direct Android Package (.APK)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold">
                  StepSync-POS.apk (12 KB)
                </span>
              </div>

              {/* Direct A tag download button - bypasses any browser synthetic click blockers */}
              <a
                href="/download/apk"
                download="StepSync-POS.apk"
                onClick={() => {
                  setDownloadingApk(true);
                  setTimeout(() => {
                    setDownloadingApk(false);
                    setDownloadApkSuccess(true);
                    setTimeout(() => setDownloadApkSuccess(false), 5000);
                  }, 1000);
                }}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20 text-center no-underline"
              >
                {downloadingApk ? (
                  <span className="animate-pulse">Starting APK Download...</span>
                ) : downloadApkSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Downloaded: StepSync-POS.apk</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Android APK (.apk)</span>
                  </>
                )}
              </a>

              <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 pt-0.5">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Asset file: <code>/assets/StepSync-POS.apk</code>
                </span>
                <a
                  href="/assets/StepSync-POS.apk"
                  download="StepSync-POS.apk"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                >
                  Direct File Mirror
                </a>
              </div>
            </div>

            {/* Android WebAPK / Browser Option (Secondary) */}
            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-[#070B14]/80 border border-slate-200/60 dark:border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-indigo-500" />
                  Alternative: Instant WebAPK Install
                </span>
                {isInstalled && (
                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                    Installed
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleInstallPWA}
                disabled={isInstalled}
                className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  isInstalled
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-default'
                    : 'bg-white hover:bg-slate-50 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-slate-800 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] shadow-2xs'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                <span>{isInstalled ? 'App Already Installed' : `Install ${pwaAppName} WebAPK`}</span>
              </button>
            </div>

            {/* Step-by-Step Android APK Installation Instructions */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                How to install the APK on your Android device:
              </div>
              <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside">
                <li className="leading-relaxed">
                  Tap the green <strong className="text-slate-800 dark:text-slate-200">"Download Android APK (.apk)"</strong> button above.
                </li>
                <li className="leading-relaxed">
                  When the download finishes, open your notification shade or <strong className="text-slate-800 dark:text-slate-200">Downloads</strong> folder and tap <strong className="text-slate-800 dark:text-slate-200">StepSync-POS.apk</strong>.
                </li>
                <li className="leading-relaxed">
                  If prompted with <em>"Install unknown apps"</em>, tap <strong className="text-slate-800 dark:text-slate-200">Settings</strong> and toggle <strong className="text-slate-800 dark:text-slate-200">"Allow from this source"</strong>.
                </li>
                <li className="leading-relaxed">
                  Tap <strong className="text-slate-800 dark:text-slate-200">"Install"</strong> — {pwaAppName} will be added directly to your phone's Home Screen &amp; App Drawer!
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* TAB 2: APPLE iOS / iPadOS SUPPORT */}
        {activeTab === 'apple' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-800/40 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                  <Apple className="w-3.5 h-3.5" />
                  Apple iOS &amp; iPadOS Safari PWA
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  Safari WebKit
                </span>
              </div>
              <p className="text-[11px] text-indigo-900/80 dark:text-indigo-300/80">
                Apple devices run PWAs through Safari in fullscreen standalone mode, hiding the browser address bar with high-resolution Retina touch icons and offline storage.
              </p>
            </div>

            {/* Step-by-Step Apple Safari Guide */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Easy 3-Step Installation on iPhone &amp; iPad:
              </div>

              <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-[#131B2E] border border-slate-200/70 dark:border-slate-800">
                  <div className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Open in Apple Safari</span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Make sure you are viewing this page inside Safari (not inside in-app webviews).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-[#131B2E] border border-slate-200/70 dark:border-slate-800">
                  <div className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      Tap the Share Button <Share2 className="w-3.5 h-3.5 text-blue-500 inline" />
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Located in the bottom toolbar on iPhone, or top-right on iPad.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-[#131B2E] border border-slate-200/70 dark:border-slate-800">
                  <div className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      Select "Add to Home Screen" <PlusSquare className="w-3.5 h-3.5 text-indigo-500 inline" />
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong> — <strong>{pwaAppName}</strong> will appear on your device's Home Screen!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WINDOWS & DESKTOP SUPPORT */}
        {activeTab === 'desktop' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Browser PWA Installation */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200/80 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-indigo-500" />
                  Desktop PWA (Chrome / Edge)
                </span>
                {isInstalled && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                    Installed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Runs in a dedicated desktop window without browser URL bar, with desktop launcher shortcut.
              </p>

              <button
                type="button"
                onClick={handleInstallPWA}
                disabled={isInstalled}
                className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                  isInstalled
                    ? 'bg-emerald-500 text-white cursor-default'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/30'
                }`}
              >
                {isInstalled ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    App Installed &amp; Ready
                  </>
                ) : (
                  <>
                    <Monitor className="w-3.5 h-3.5" />
                    Install {pwaAppName} (PWA)
                  </>
                )}
              </button>
            </div>

            {/* Windows .EXE Installer */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200/80 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-purple-500" />
                  Windows 64-bit Native Launcher (.EXE)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-semibold">
                  148 KB • x64 PE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Genuine compiled Windows x64 binary. Automatically launches the POS terminal in borderless app window mode and creates a Desktop shortcut.
              </p>

              <a
                href="/download/exe"
                download="StepSync-POS-Desktop-Setup.exe"
                onClick={() => {
                  setDownloadingExe(true);
                  setTimeout(() => {
                    setDownloadingExe(false);
                    setDownloadSuccess(true);
                    setTimeout(() => setDownloadSuccess(false), 5000);
                  }, 1200);
                }}
                className="w-full py-2.5 px-3 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 flex items-center justify-center gap-2 transition cursor-pointer shadow-sm text-center no-underline"
              >
                {downloadingExe ? (
                  <span className="animate-pulse">Preparing .EXE Download...</span>
                ) : downloadSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                    <span>Downloaded: StepSync-POS-Desktop-Setup.exe</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Windows Executable (.EXE)</span>
                  </>
                )}
              </a>

              <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 pt-0.5">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Asset: <code>/assets/StepSync-POS-Desktop-Setup.exe</code>
                </span>
                <a
                  href="/assets/StepSync-POS-Desktop-Setup.exe"
                  download="StepSync-POS-Desktop-Setup.exe"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                >
                  Direct Mirror
                </a>
              </div>

              {/* Windows 10/11 Tip */}
              <div className="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 text-[10.5px] text-indigo-900/90 dark:text-indigo-300/90 space-y-1">
                <div className="font-semibold flex items-center gap-1 text-indigo-800 dark:text-indigo-200">
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  First-time launch on Windows:
                </div>
                <p>
                  If Windows SmartScreen prompts <em>"Windows protected your PC"</em>, click <strong>"More info"</strong> and then <strong>"Run anyway"</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Feature Checkpoints */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Offline Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Fast Barcode Scan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Touch Friendly</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
