// Hardware Printer Manager: WebUSB, Local Agent, & System Print Handlers
import { generateSaleEscPos, generateTestReceiptEscPos } from './escpos.ts';
import { generateShoeStickerTspl, generateTestStickerTspl } from './tspl.ts';

export interface PrinterHardwareSettings {
  receiptMode: 'webusb' | 'system' | 'local_agent';
  stickerMode: 'webusb' | 'system' | 'local_agent';
  receiptPaperWidth: 80 | 58;
  autoCut: boolean;
  openCashDrawer: boolean;
  stickerWidthMm: number;
  stickerHeightMm: number;
  silentReceipt: boolean;
  silentSticker: boolean;
  agentEndpoint: string;
  receiptDeviceName?: string;
  receiptVendorId?: number;
  receiptProductId?: number;
  stickerDeviceName?: string;
  stickerVendorId?: number;
  stickerProductId?: number;
}

const STORAGE_KEY = 'shoe_shop_hardware_printers';

export const DEFAULT_PRINTER_SETTINGS: PrinterHardwareSettings = {
  receiptMode: 'system',
  stickerMode: 'system',
  receiptPaperWidth: 80,
  autoCut: true,
  openCashDrawer: false,
  stickerWidthMm: 50,
  stickerHeightMm: 30,
  silentReceipt: false,
  silentSticker: false,
  agentEndpoint: 'http://localhost:9100/print',
};

// Retrieve saved printer settings
export function getSavedPrinterSettings(): PrinterHardwareSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRINTER_SETTINGS };
    return { ...DEFAULT_PRINTER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS };
  }
}

// Save printer settings
export function savePrinterSettings(settings: Partial<PrinterHardwareSettings>): PrinterHardwareSettings {
  const current = getSavedPrinterSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

// Check WebUSB support
export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

// Pair a USB printer via WebUSB browser selector
export async function pairUsbPrinter(
  target: 'receipt' | 'sticker'
): Promise<{ success: boolean; deviceName?: string; error?: string }> {
  if (!isWebUsbSupported()) {
    return {
      success: false,
      error: 'WebUSB is not supported in this browser. Please use Chrome, Edge, or Opera on desktop.',
    };
  }

  try {
    // Request any USB device so user can pick their exact printer
    const device = await (navigator as any).usb.requestDevice({
      filters: [],
    });

    const deviceName = device.productName || `${target.toUpperCase()} USB Printer`;
    const vendorId = device.vendorId;
    const productId = device.productId;

    if (target === 'receipt') {
      savePrinterSettings({
        receiptMode: 'webusb',
        receiptDeviceName: deviceName,
        receiptVendorId: vendorId,
        receiptProductId: productId,
        silentReceipt: true,
      });
    } else {
      savePrinterSettings({
        stickerMode: 'webusb',
        stickerDeviceName: deviceName,
        stickerVendorId: vendorId,
        stickerProductId: productId,
        silentSticker: true,
      });
    }

    return { success: true, deviceName };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'No device selected.' };
    }
    return { success: false, error: err.message || 'Failed to connect USB device.' };
  }
}

// Find and connect to paired WebUSB device
async function getConnectedUsbDevice(vendorId?: number, productId?: number): Promise<any | null> {
  if (!isWebUsbSupported() || !vendorId || !productId) return null;

  try {
    const devices = await (navigator as any).usb.getDevices();
    const found = devices.find((d: any) => d.vendorId === vendorId && d.productId === productId);
    if (!found) return null;

    if (!found.opened) {
      await found.open();
    }
    if (found.configuration === null) {
      await found.selectConfiguration(1);
    }
    // Claim first available interface
    const iface = found.configuration.interfaces[0];
    if (!iface.claimed) {
      await found.claimInterface(iface.interfaceNumber);
    }
    return found;
  } catch (e) {
    console.warn('Could not auto-connect WebUSB device:', e);
    return null;
  }
}

// Send binary payload to WebUSB device endpoint
export async function sendRawToUsb(device: any, data: Uint8Array): Promise<boolean> {
  try {
    // Find bulk OUT endpoint
    const iface = device.configuration?.interfaces[0];
    const alternate = iface?.alternates[0];
    const outEndpoint = alternate?.endpoints.find((ep: any) => ep.direction === 'out');

    if (!outEndpoint) {
      throw new Error('Could not find USB bulk OUT endpoint on printer.');
    }

    // Send in chunks of 512 bytes for reliable buffer transmission
    const chunkSize = 512;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await device.transferOut(outEndpoint.endpointNumber, chunk);
    }
    return true;
  } catch (err) {
    console.error('Failed to write raw data to USB:', err);
    throw err;
  }
}

// Send raw data to local print agent (e.g. localhost:9100)
export async function sendToLocalAgent(agentUrl: string, printerType: string, data: Uint8Array): Promise<boolean> {
  try {
    const base64 = btoa(String.fromCharCode(...data));
    const res = await fetch(agentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerType, data: base64 }),
    });
    return res.ok;
  } catch (e: any) {
    throw new Error(`Local Print Agent not reachable at ${agentUrl}. Ensure the print service is running.`);
  }
}

// High-level: Print Sale Receipt
export async function executePrintReceipt(
  sale: any,
  companySettings: any,
  overrideSettings?: Partial<PrinterHardwareSettings>
): Promise<{ success: boolean; modeUsed: string; error?: string }> {
  const settings = { ...getSavedPrinterSettings(), ...overrideSettings };

  if (settings.receiptMode === 'webusb' && settings.receiptVendorId && settings.receiptProductId) {
    try {
      const device = await getConnectedUsbDevice(settings.receiptVendorId, settings.receiptProductId);
      if (device) {
        const payload = generateSaleEscPos(sale, companySettings, {
          paperWidth: settings.receiptPaperWidth,
          autoCut: settings.autoCut,
          openCashDrawer: settings.openCashDrawer,
        });
        await sendRawToUsb(device, payload);
        return { success: true, modeUsed: 'webusb' };
      }
    } catch (err: any) {
      console.warn('WebUSB receipt failed, falling back to system print:', err);
      // Fallback to system print below
    }
  } else if (settings.receiptMode === 'local_agent') {
    try {
      const payload = generateSaleEscPos(sale, companySettings, {
        paperWidth: settings.receiptPaperWidth,
        autoCut: settings.autoCut,
        openCashDrawer: settings.openCashDrawer,
      });
      await sendToLocalAgent(settings.agentEndpoint, 'receipt', payload);
      return { success: true, modeUsed: 'local_agent' };
    } catch (err: any) {
      console.warn('Local agent print failed:', err);
    }
  }

  // Standard fallback
  window.print();
  return { success: true, modeUsed: 'system' };
}

// High-level: Print Barcode Stickers
export async function executePrintStickers(
  product: any,
  copies: number,
  companySettings: any,
  overrideSettings?: Partial<PrinterHardwareSettings>
): Promise<{ success: boolean; modeUsed: string; error?: string }> {
  const settings = { ...getSavedPrinterSettings(), ...overrideSettings };

  if (settings.stickerMode === 'webusb' && settings.stickerVendorId && settings.stickerProductId) {
    try {
      const device = await getConnectedUsbDevice(settings.stickerVendorId, settings.stickerProductId);
      if (device) {
        const payload = generateShoeStickerTspl(product, copies, {
          widthMm: settings.stickerWidthMm,
          heightMm: settings.stickerHeightMm,
          currencySymbol: companySettings?.currency_symbol || 'Rs.',
          storeName: companySettings?.name || companySettings?.company_name || 'Retail Store',
        });
        await sendRawToUsb(device, payload);
        return { success: true, modeUsed: 'webusb' };
      }
    } catch (err: any) {
      console.warn('WebUSB sticker failed, falling back to system print:', err);
    }
  } else if (settings.stickerMode === 'local_agent') {
    try {
      const payload = generateShoeStickerTspl(product, copies, {
        widthMm: settings.stickerWidthMm,
        heightMm: settings.stickerHeightMm,
        currencySymbol: companySettings?.currency_symbol || 'Rs.',
        storeName: companySettings?.name || companySettings?.company_name || 'Retail Store',
      });
      await sendToLocalAgent(settings.agentEndpoint, 'sticker', payload);
      return { success: true, modeUsed: 'local_agent' };
    } catch (err: any) {
      console.warn('Local agent sticker print failed:', err);
    }
  }

  // Standard fallback
  window.print();
  return { success: true, modeUsed: 'system' };
}

// High-level: Print Batch Barcode Stickers
export async function executePrintBatchStickers(
  items: Array<{ product: any; copies: number }>,
  companySettings: any,
  overrideSettings?: Partial<PrinterHardwareSettings>
): Promise<{ success: boolean; modeUsed: string; error?: string }> {
  const settings = { ...getSavedPrinterSettings(), ...overrideSettings };

  if (settings.stickerMode === 'webusb' && settings.stickerVendorId && settings.stickerProductId) {
    try {
      const device = await getConnectedUsbDevice(settings.stickerVendorId, settings.stickerProductId);
      if (device) {
        const buffers: Uint8Array[] = [];
        let totalLen = 0;
        for (const item of items) {
          const payload = generateShoeStickerTspl(item.product, item.copies, {
            widthMm: settings.stickerWidthMm,
            heightMm: settings.stickerHeightMm,
            currencySymbol: companySettings?.currency_symbol || 'Rs.',
            storeName: companySettings?.name || companySettings?.company_name || 'Retail Store',
          });
          buffers.push(payload);
          totalLen += payload.length;
        }

        const combined = new Uint8Array(totalLen);
        let offset = 0;
        for (const buf of buffers) {
          combined.set(buf, offset);
          offset += buf.length;
        }

        await sendRawToUsb(device, combined);
        return { success: true, modeUsed: 'webusb' };
      }
    } catch (err: any) {
      console.warn('WebUSB batch sticker failed, falling back to system print:', err);
    }
  } else if (settings.stickerMode === 'local_agent') {
    try {
      const buffers: Uint8Array[] = [];
      let totalLen = 0;
      for (const item of items) {
        const payload = generateShoeStickerTspl(item.product, item.copies, {
          widthMm: settings.stickerWidthMm,
          heightMm: settings.stickerHeightMm,
          currencySymbol: companySettings?.currency_symbol || 'Rs.',
          storeName: companySettings?.name || companySettings?.company_name || 'Retail Store',
        });
        buffers.push(payload);
        totalLen += payload.length;
      }

      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const buf of buffers) {
        combined.set(buf, offset);
        offset += buf.length;
      }

      await sendToLocalAgent(settings.agentEndpoint, 'sticker', combined);
      return { success: true, modeUsed: 'local_agent' };
    } catch (err: any) {
      console.warn('Local agent batch sticker print failed:', err);
    }
  }

  // Standard system print fallback
  window.print();
  return { success: true, modeUsed: 'system' };
}

// Test Receipts & Stickers
export async function executeTestReceipt(): Promise<{ success: boolean; error?: string }> {
  const settings = getSavedPrinterSettings();
  if (settings.receiptMode === 'webusb' && settings.receiptVendorId && settings.receiptProductId) {
    try {
      const device = await getConnectedUsbDevice(settings.receiptVendorId, settings.receiptProductId);
      if (!device) throw new Error('Paired receipt printer is not plugged in or accessible.');
      const data = generateTestReceiptEscPos(settings.receiptPaperWidth);
      await sendRawToUsb(device, data);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  } else {
    window.print();
    return { success: true };
  }
}

export async function executeTestSticker(): Promise<{ success: boolean; error?: string }> {
  const settings = getSavedPrinterSettings();
  if (settings.stickerMode === 'webusb' && settings.stickerVendorId && settings.stickerProductId) {
    try {
      const device = await getConnectedUsbDevice(settings.stickerVendorId, settings.stickerProductId);
      if (!device) throw new Error('Paired label printer is not plugged in or accessible.');
      const data = generateTestStickerTspl({
        widthMm: settings.stickerWidthMm,
        heightMm: settings.stickerHeightMm,
      });
      await sendRawToUsb(device, data);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  } else {
    window.print();
    return { success: true };
  }
}
