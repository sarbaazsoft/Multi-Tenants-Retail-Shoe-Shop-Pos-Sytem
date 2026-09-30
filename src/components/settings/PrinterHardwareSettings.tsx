import React, { useState, useEffect } from 'react';
import {
  Printer,
  Usb,
  CheckCircle2,
  Scissors,
  DollarSign,
  Tag,
  Zap,
  Info,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  getSavedPrinterSettings,
  savePrinterSettings,
  pairUsbPrinter,
  isWebUsbSupported,
  executeTestReceipt,
  executeTestSticker,
  PrinterHardwareSettings as IPrinterSettings,
} from '../../utils/printer/printerManager.ts';

export const PrinterHardwareSettings: React.FC = () => {
  const [settings, setSettings] = useState<IPrinterSettings>(getSavedPrinterSettings());
  const [isPairingReceipt, setIsPairingReceipt] = useState(false);
  const [isPairingSticker, setIsPairingSticker] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const webUsbAvailable = isWebUsbSupported();

  useEffect(() => {
    setSettings(getSavedPrinterSettings());
  }, []);

  const handleUpdate = (patch: Partial<IPrinterSettings>) => {
    const updated = savePrinterSettings(patch);
    setSettings(updated);
  };

  const handlePairReceipt = async () => {
    setIsPairingReceipt(true);
    setTestStatus(null);
    try {
      const res = await pairUsbPrinter('receipt');
      if (res.success) {
        setSettings(getSavedPrinterSettings());
        setTestStatus(`Receipt Printer connected: ${res.deviceName}`);
      } else {
        setTestStatus(`Receipt pairing cancelled or failed: ${res.error}`);
      }
    } finally {
      setIsPairingReceipt(false);
    }
  };

  const handlePairSticker = async () => {
    setIsPairingSticker(true);
    setTestStatus(null);
    try {
      const res = await pairUsbPrinter('sticker');
      if (res.success) {
        setSettings(getSavedPrinterSettings());
        setTestStatus(`Sticker Printer connected: ${res.deviceName}`);
      } else {
        setTestStatus(`Sticker pairing cancelled or failed: ${res.error}`);
      }
    } finally {
      setIsPairingSticker(false);
    }
  };

  const handleTestReceipt = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await executeTestReceipt();
      if (res.success) {
        setTestStatus('Test receipt sent successfully.');
      } else {
        setTestStatus(`Test receipt error: ${res.error}`);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestSticker = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await executeTestSticker();
      if (res.success) {
        setTestStatus('Test barcode sticker sent successfully.');
      } else {
        setTestStatus(`Test sticker error: ${res.error}`);
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner with Bilingual Explanation */}
      <div className="rounded-2xl p-5 shadow-xs border border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/60 dark:via-indigo-950/80 dark:to-slate-900 relative overflow-hidden transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-100 dark:border-purple-400/30 rounded-xl shadow-2xs">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Dual Hardware Printer Routing &amp; Silent Printing</h2>
              <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5">
                رسید پرنٹر اور بارکوڈ اسٹیکر پرنٹر کے لیے خودکار اور سائلنٹ پرنٹنگ سیٹ اپ
              </p>
            </div>
          </div>
          <span className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-50 dark:bg-purple-950/60 text-blue-700 dark:text-purple-200 text-xs font-semibold rounded-full border border-blue-200 dark:border-purple-800/60 shadow-2xs">
            <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-purple-300" />
            <span>Zero-Click Direct Print</span>
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-purple-900/40 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start space-x-2.5 bg-white dark:bg-[#131B2E] p-3.5 rounded-xl border border-slate-200 dark:border-purple-800/60">
            <Info className="w-4 h-4 text-blue-600 dark:text-purple-300 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">How it works / کام کرنے کا طریقہ:</p>
              <p className="mt-0.5 text-slate-600 dark:text-purple-200/80 leading-relaxed">
                You can pair both physical printers once. When you click <strong>Print Invoice</strong>, it silently routes to your thermal slip printer. When you click <strong>Print Sticker</strong>, it sends exact TSPL commands to your label printer without opening popup dialogs.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-2.5 bg-white dark:bg-[#131B2E] p-3.5 rounded-xl border border-slate-200 dark:border-purple-800/60">
            <Usb className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">WebUSB API Status:</p>
              <p className="mt-0.5 text-slate-600 dark:text-purple-200/80 leading-relaxed">
                {webUsbAvailable ? (
                  <span className="text-emerald-600 dark:text-emerald-300 font-medium">
                    WebUSB supported in your browser (Chrome/Edge/Opera). Direct hardware communication is ready.
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-300">
                    WebUSB not detected in this browser. The system will use standard browser print formatting.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {testStatus && (
        <div className="p-4 bg-blue-50 dark:bg-purple-950/40 text-blue-800 dark:text-purple-200 border border-blue-200 dark:border-purple-800/60 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-purple-300" />
            <span>{testStatus}</span>
          </div>
          <button onClick={() => setTestStatus(null)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: 2 Hardware Destinations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Destination 1: Thermal Receipt Printer */}
        <div className="bg-white dark:bg-[#131B2E] rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-xs overflow-hidden flex flex-col justify-between transition-colors">
          <div className="p-5 border-b border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-500/10 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 rounded-xl">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">1. Customer Invoice Printer</h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70">80mm / 58mm POS Thermal Slip (رسید پرنٹر)</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-full font-bold text-xs">
                Receipts
              </span>
            </div>
          </div>

          <div className="p-6 space-y-5 flex-1">
            {/* Mode selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                Printing Mode / پرنٹنگ کا طریقہ
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleUpdate({ receiptMode: 'webusb', silentReceipt: true })}
                  className={`p-3.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                    settings.receiptMode === 'webusb'
                      ? 'border-blue-500 dark:border-purple-500 bg-blue-50/50 dark:bg-purple-950/40 text-blue-950 dark:text-purple-200 font-semibold ring-2 ring-blue-500/20 dark:ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-blue-600 dark:text-purple-300">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Direct WebUSB (Silent)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    بغیر کسی پوپ اپ کے سیدھا USB پرنٹر سے پرنٹ
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdate({ receiptMode: 'system', silentReceipt: false })}
                  className={`p-3.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                    settings.receiptMode === 'system'
                      ? 'border-blue-500 dark:border-purple-500 bg-blue-50/50 dark:bg-purple-950/40 text-blue-950 dark:text-purple-200 font-semibold ring-2 ring-blue-500/20 dark:ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-slate-700 dark:text-slate-300">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Browser System Dialog</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    ونڈوز کے پرنٹ ڈائیلاگ سے پرنٹ کریں
                  </p>
                </button>
              </div>
            </div>

            {/* WebUSB Device Pairing Box */}
            {settings.receiptMode === 'webusb' && (
              <div className="p-4 bg-slate-50 dark:bg-[#060B18] border border-slate-200 dark:border-purple-800/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Paired USB Device:</span>
                  {settings.receiptDeviceName ? (
                    <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{settings.receiptDeviceName}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">No printer paired yet</span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handlePairReceipt}
                    disabled={isPairingReceipt || !webUsbAvailable}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-bold border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] transition cursor-pointer disabled:opacity-50 active:scale-95"
                  >
                    <Usb className="w-3.5 h-3.5" />
                    <span>
                      {settings.receiptDeviceName ? 'Change Receipt Printer (USB)' : 'Pair Receipt Printer (USB)'}
                    </span>
                  </button>

                  {settings.receiptDeviceName && (
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdate({
                          receiptDeviceName: undefined,
                          receiptVendorId: undefined,
                          receiptProductId: undefined,
                        })
                      }
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-slate-700 dark:text-purple-200 border border-slate-200 dark:border-purple-800/50 rounded-xl text-xs font-medium cursor-pointer transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Paper Width & Hardware Controls */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Paper Roll Width:
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="receiptWidth"
                      checked={settings.receiptPaperWidth === 80}
                      onChange={() => handleUpdate({ receiptPaperWidth: 80 })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>80mm (Standard 3-Inch Roll)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="receiptWidth"
                      checked={settings.receiptPaperWidth === 58}
                      onChange={() => handleUpdate({ receiptPaperWidth: 58 })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>58mm (Compact 2-Inch Roll)</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-purple-900/40">
                <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoCut}
                    onChange={(e) => handleUpdate({ autoCut: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex items-center space-x-1.5">
                    <Scissors className="w-3.5 h-3.5 text-slate-500 dark:text-purple-300" />
                    <span>Auto-cut paper after invoice print (خودکار کاغذ کٹر)</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.openCashDrawer}
                    onChange={(e) => handleUpdate({ openCashDrawer: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex items-center space-x-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-slate-500 dark:text-purple-300" />
                    <span>Kick open cash drawer on checkout (کیش دراز کھولیں)</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-purple-950/20 border-t border-slate-200 dark:border-purple-900/40 flex justify-end">
            <button
              type="button"
              onClick={handleTestReceipt}
              disabled={isTesting}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-slate-800 dark:text-purple-200 border border-slate-200 dark:border-purple-800/50 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-purple-300" />
              <span>Test Print Receipt (ٹیسٹ رسید)</span>
            </button>
          </div>
        </div>

        {/* Destination 2: Barcode Sticker / Label Printer */}
        <div className="bg-white dark:bg-[#131B2E] rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-xs overflow-hidden flex flex-col justify-between transition-colors">
          <div className="p-5 border-b border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-100 dark:border-purple-400/30 rounded-xl">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">2. Barcode Label / Sticker Printer</h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70">50mm × 30mm Shoe Box Stickers (اسٹیکر پرنٹر)</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-full font-bold text-xs">
                Stickers
              </span>
            </div>
          </div>

          <div className="p-6 space-y-5 flex-1">
            {/* Mode selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                Printing Mode / پرنٹنگ کا طریقہ
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleUpdate({ stickerMode: 'webusb', silentSticker: true })}
                  className={`p-3.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                    settings.stickerMode === 'webusb'
                      ? 'border-blue-500 dark:border-purple-500 bg-blue-50/50 dark:bg-purple-950/40 text-blue-950 dark:text-purple-200 font-semibold ring-2 ring-blue-500/20 dark:ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-blue-600 dark:text-purple-300">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Direct WebUSB (Silent)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    بغیر کسی پوپ اپ کے سیدھا اسٹیکر مشین سے پرنٹ
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdate({ stickerMode: 'system', silentSticker: false })}
                  className={`p-3.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                    settings.stickerMode === 'system'
                      ? 'border-blue-500 dark:border-purple-500 bg-blue-50/50 dark:bg-purple-950/40 text-blue-950 dark:text-purple-200 font-semibold ring-2 ring-blue-500/20 dark:ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 font-bold text-slate-700 dark:text-slate-300">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Browser System Dialog</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    براؤزر کے ذریعے 50x30mm پرنٹ کریں
                  </p>
                </button>
              </div>
            </div>

            {/* WebUSB Device Pairing Box */}
            {settings.stickerMode === 'webusb' && (
              <div className="p-4 bg-slate-50 dark:bg-[#060B18] border border-slate-200 dark:border-purple-800/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Paired Label Machine:</span>
                  {settings.stickerDeviceName ? (
                    <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{settings.stickerDeviceName}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">No label printer paired yet</span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handlePairSticker}
                    disabled={isPairingSticker || !webUsbAvailable}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-bold border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] transition cursor-pointer disabled:opacity-50 active:scale-95"
                  >
                    <Usb className="w-3.5 h-3.5" />
                    <span>
                      {settings.stickerDeviceName ? 'Change Label Printer (USB)' : 'Pair Barcode Printer (USB)'}
                    </span>
                  </button>

                  {settings.stickerDeviceName && (
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdate({
                          stickerDeviceName: undefined,
                          stickerVendorId: undefined,
                          stickerProductId: undefined,
                        })
                      }
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-slate-700 dark:text-purple-200 border border-slate-200 dark:border-purple-800/50 rounded-xl text-xs font-medium cursor-pointer transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Label Dimensions */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Label Roll Dimensions (اسٹیکر سائز):
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Width (چوڑائی):</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <input
                      type="number"
                      min="20"
                      max="120"
                      value={settings.stickerWidthMm}
                      onChange={(e) =>
                        handleUpdate({ stickerWidthMm: parseInt(e.target.value, 10) || 50 })
                      }
                      className="w-full h-10 px-3 border border-slate-300 dark:border-purple-800/60 rounded-xl text-xs font-bold bg-slate-50 dark:bg-[#060B18] text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-purple-500/20 outline-none"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">mm</span>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Height (اونچائی):</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <input
                      type="number"
                      min="15"
                      max="100"
                      value={settings.stickerHeightMm}
                      onChange={(e) =>
                        handleUpdate({ stickerHeightMm: parseInt(e.target.value, 10) || 30 })
                      }
                      className="w-full h-10 px-3 border border-slate-300 dark:border-purple-800/60 rounded-xl text-xs font-bold bg-slate-50 dark:bg-[#060B18] text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-purple-500/20 outline-none"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">mm</span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Standard retail shoe label size is <strong>50mm × 30mm</strong> with TSPL / ESC standard barcodes.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-purple-950/20 border-t border-slate-200 dark:border-purple-900/40 flex justify-end">
            <button
              type="button"
              onClick={handleTestSticker}
              disabled={isTesting}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-slate-800 dark:text-purple-200 border border-slate-200 dark:border-purple-800/50 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 text-slate-500 dark:text-purple-300" />
              <span>Test Print Label (ٹیسٹ اسٹیکر)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
