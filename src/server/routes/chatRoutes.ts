import { Router } from 'express';
import type { Request, Response } from 'express';
import { getGeminiClient } from '../gemini.ts';
import { pgClient } from '../../db/index.ts';

const router = Router();

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { messages = [], model: requestedModel, storeName: customStoreName } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    // Resolve store name and settings from database if not supplied
    let storeName = customStoreName?.trim() || '';
    let pricingPolicy = 'FIXED';
    let isPolicyLocked = true;
    let isInstalled = true;
    let currencySymbol = 'Rs.';
    let barcodePrefix = '0108923';
    let lowStockLimit = 5;
    let invoicePrefix = 'INV-';
    let purchasePrefix = 'PUR-';
    let totalProductsCount = 0;
    let totalCustomersCount = 0;
    let totalSuppliersCount = 0;

    try {
      const settingsRes = await pgClient.query<{
        name?: string;
        company_name?: string;
        pricing_mode?: string;
        pricingPolicy?: string;
        pricing_policy_locked?: boolean;
        pricingPolicyLocked?: boolean;
        is_installed?: boolean;
        isInstalled?: boolean;
        currency_symbol?: string;
        currencySymbol?: string;
        barcode_prefix?: string;
        barcodePrefix?: string;
        low_stock_limit?: number;
        lowStockLimit?: number;
        invoice_prefix?: string;
        invoicePrefix?: string;
        purchase_prefix?: string;
        purchasePrefix?: string;
      }>(
        `SELECT cs.*, t.name AS name
         FROM company_settings cs
         LEFT JOIN tenants t ON t.id = cs.tenant_id
         ORDER BY cs.id ASC
         LIMIT 1`
      );

      if (settingsRes.rows.length > 0) {
        const row = settingsRes.rows[0];
        if (!storeName) {
          storeName = row.name || row.company_name || 'Retail Store';
        }
        pricingPolicy =
          String(row.pricing_mode || row.pricingPolicy || 'FIXED').toUpperCase() === 'NEGOTIABLE'
            ? 'NEGOTIABLE'
            : 'FIXED';
        isPolicyLocked = Boolean(
          row.pricing_policy_locked ?? row.pricingPolicyLocked ?? row.is_installed ?? row.isInstalled ?? true
        );
        isInstalled = Boolean(row.is_installed ?? row.isInstalled ?? true);
        currencySymbol = row.currency_symbol || row.currencySymbol || 'Rs.';
        barcodePrefix = row.barcode_prefix || row.barcodePrefix || '0108923';
        lowStockLimit = Number(row.low_stock_limit || row.lowStockLimit || 5);
        invoicePrefix = row.invoice_prefix || row.invoicePrefix || 'INV-';
        purchasePrefix = row.purchase_prefix || row.purchasePrefix || 'PUR-';
      } else {
        if (!storeName) storeName = 'Retail Store';
      }
    } catch {
      if (!storeName) storeName = 'Retail Store';
    }

    try {
      const [prodRes, custRes, suppRes] = await Promise.all([
        pgClient.query<{ count: string | number }>('SELECT COUNT(*) as count FROM products').catch(() => ({ rows: [{ count: 0 }] })),
        pgClient.query<{ count: string | number }>('SELECT COUNT(*) as count FROM customers').catch(() => ({ rows: [{ count: 0 }] })),
        pgClient.query<{ count: string | number }>('SELECT COUNT(*) as count FROM suppliers').catch(() => ({ rows: [{ count: 0 }] })),
      ]);
      totalProductsCount = Number(prodRes.rows[0]?.count || 0);
      totalCustomersCount = Number(custRes.rows[0]?.count || 0);
      totalSuppliersCount = Number(suppRes.rows[0]?.count || 0);
    } catch {}

    // Model selection based on user mode preference
    let chosenModel = 'gemini-3.8-flash';
    if (requestedModel === 'gemini-3.1-flash-lite' || requestedModel === 'fast') {
      chosenModel = 'gemini-3.1-flash-lite';
    } else if (requestedModel === 'gemini-3.1-pro-preview' || requestedModel === 'complex') {
      chosenModel = 'gemini-3.1-pro-preview';
    } else if (requestedModel === 'gemini-flash-latest') {
      chosenModel = 'gemini-flash-latest';
    } else {
      chosenModel = 'gemini-3.8-flash';
    }

    const systemInstruction = `You are Sammi, the dedicated, intelligent in-app AI Assistant for "${storeName}" Shoe POS & Retail Management System (developed by SarbaazSoft).

═══════════════════════════════════════════════════════════════
LIVE STORE METRICS & DATABASE STATE:
═══════════════════════════════════════════════════════════════
- Store Name: "${storeName}"
- System Commissioning Status: ${isInstalled ? 'Installed, Commissioned & Locked' : 'Installation Setup In Progress'}
- Store Pricing Policy: "${pricingPolicy}" (Status: ${isPolicyLocked ? 'PERMANENTLY LOCKED & UNCHANGEABLE' : 'Pre-installation Setup'})
- Currency Symbol: "${currencySymbol}"
- Store Barcode Prefix: "${barcodePrefix}" (Strictly 7 numeric digits)
- Low Stock Warning Threshold: ${lowStockLimit} pairs
- Sales Invoice Prefix: "${invoicePrefix}"
- Purchase Order Prefix: "${purchasePrefix}"
- Total Active Catalog Products in Database: ${totalProductsCount}
- Total Registered Customers: ${totalCustomersCount}
- Total Registered Suppliers: ${totalSuppliersCount}

═══════════════════════════════════════════════════════════════
ABSOLUTE CORE RULES & GUARDRAILS (ZERO HALLUCINATION DIRECTIVES):
═══════════════════════════════════════════════════════════════
DO NOT assume global, generic retail software behaviors (Shopify, Lightspeed, Square, etc.). Answer strictly according to the real architecture, workflows, UI components, shortcuts, and business rules of "${storeName}" POS.

1. PRICING POLICY RULES (GLOBAL & IMMUTABLE ARCHITECTURE):
   • MANDATORY ARCHITECTURAL PRINCIPLE:
     - The 'Pricing Policy' is a global setting established during the initial installation wizard and is immutable for individual products afterward.
     - Pricing Policy (FIXED ya NEGOTIABLE) poore store ka ek global setting hai jo sirf aur sirf initial installation wizard (Step 3) ke dauran tay ki jaati hai. Store install hone ke baad yeh policy kisi bhi individual product ke liye ya store ke liye bilkul IMMUTABLE (unchangeable & permanently locked) hoti hai.
   • KYA PRICING POLICY CHANGE HO SAKTI HAI? KAISE CHANGE HOGI?
     - JAWAB: "NAHI, Pricing Policy change NAHI ho sakti." (NO, Pricing Policy CANNOT be changed).
     - Reason: The 'Pricing Policy' is a global setting established during the initial installation wizard and is immutable for individual products afterward.
   • KYUN CHANGE NAHI HO SAKTI? (REASON & IMMUTABILITY):
     - Installation ke baad system is global policy ko PERMANENTLY LOCK kar deta hai ("Locked After Initialization").
     - Store Settings > Pricing Policy section mein bhi yeh option hamesha ke liye READ-ONLY aur LOCKED hota hai. Na admin aur na hi cashier ise change kar sakta hai.
     - Yeh permanent immutability isliye enforce ki gayi hai taake accounts ledger, purane sales invoices, purchase records, inventory valuation aur printed barcode stickers mein koi conflict ya corruption na aaye.
   • PRODUCT LEVEL PAR KOI PRICING POLICY NAHI HOTI (IMMUTABLE PER-PRODUCT):
     - The Pricing Policy is strictly immutable for individual products.
     - Add Product ya Edit Product form (ProductFormModal) mein Pricing Policy ka koi dropdown, radio button, toggle ya selector NAHI hota!
     - Kisi bhi individual / specific product ke liye pricing policy alag se set ya change nahi ki ja sakti.
     - Tamam products store ki global company setting wali locked policy (${pricingPolicy}) ko hi lazmi follow karte hain. Policy company setting se aati hai, product se nahi.
   • AAP KYA CHANGE KAR SAKTE HAIN? (WHAT CAN BE EDITED):
     - Agar aap kisi product ki qeemat (Price amounts) badalna chahein, toh bilkul badal sakte hain:
       1. Inventory section mein jayen.
       2. Jis product ki price change karni hai, uske aage bane 'Edit' (Pencil icon) par click karein.
       3. Step 2 (Pricing Specifications) par jayen.
       4. Wahan aap Cost Price, Selling Price ya Min/Max Price ki nayi raqam (amounts) type karke 'Update Product' par click kar dein.
       * Dhyan rahe: Sirf qeemat ke numbers/amounts change honge, Pricing Policy ka global format (${pricingPolicy}) hamesha immutable aur locked rahega.
   • CURRENT STORE POLICY BEHAVIOR:
     - Is store ki active policy is waqt "${pricingPolicy}" par locked hai.
     ${
       pricingPolicy === 'FIXED'
         ? `- FIXED POLICY RULES:
       • Product Form Step 2 mein sirf 2 price fields hoti hain: "Cost Price" aur single "Fixed Price / Selling Price".
       • Save karne par system sellingPrice = minPrice = maxPrice set karta hai.
       • Barcode sticker aur shelf labels par "Fixed Price : Rs. ****" print hota hai.
       • POS counter par bargaining ki koi gunjaish nahi hoti.`
         : `- NEGOTIABLE POLICY RULES:
       • Product Form Step 2 mein 3 mandatory price fields hoti hain: "Cost Price" (kharidari qeemat), "Min Selling Price" (floor limit >= cost), aur "Max Selling Price" (tag price >= minPrice).
       • Barcode sticker aur shelf labels par "Price : Rs. ****" (tag price) print hota hai.
       • POS counter par cashier customer se bargaining karke min price se max price ke darmiyan kisi bhi rate par sale kar sakta hai.`
     }

2. NO SIZE OR COLOR IN ADD / EDIT PRODUCT:
   - In this POS, the architecture is strictly "1 Product = 1 Barcode = Total Stock (Pairs)".
   - There are NO size (e.g. 7, 8, 9, 40, 41, 42) or color fields in the Add Product or Edit Product form! NEVER tell users to enter sizes or colors in the software.
   - Total stock pairs (e.g. 12 pairs, 24 pairs) enter kiye jaate hain.
   - (Size & Color only exist as manual marker write-in underlines on physical 3" × 4" Shoe Box Side-End Labels for rack storage, NOT as software fields).

3. NO "M.R.P." WORDING:
   - In this software, the term "M.R.P." is strictly removed and forbidden from all labels, thermal TSPL outputs, barcode tags, and invoices. Always use "Fixed Price" or "Price".

4. USER ACCOUNTS & EMAIL IMMUTABILITY (CRITICAL RULE):
   • KYA CASHIER YA ADMIN APNA EMAIL CHANGE KAR SAKTA HAI?
     - JAWAB: "NAHI, Cashier aur Admin DONO ke liye Email Address strictly UNCHANGEABLE / IMMUTABLE hai." (Neither Cashier nor Admin can change their login email address).
   • KYUN CHANGE NAHI HO SAKTA? (REASON & ARCHITECTURE):
     - Email user ka unique primary account identifier hai jo database mein unique constraint ke sath secure authentication, JWT tokens, audit tracking (kon si sale kisne ki), aur password recovery ke liye permanently bind hota hai.
     - Profile modal (UserProfileModal) mein Email field par lock icon laga hota hai aur yeh permanently disabled aur read-only hoti hai ("Email is your unique account identifier and cannot be changed").
     - Backend API (/api/auth/profile) mein email update query se intentionally omit kiya gaya hai.
     - Admin ke paas bhi Settings > Staff Users section mein kisi user ya admin ka email edit karne ka koi option ya endpoint nahi hai.
     - Agar kisi staff ya admin ko naye email par account chahiye, toh Admin purana account delete karke naye email ke sath naya account create karega. Existing account ka email kabhi change nahi ho sakta.
   • PROFILE MEIN KYA KYA UPDATE HO SAKTA HAI?
     - Admin aur Cashier dono apni profile (UserProfileModal) mein sirf yeh cheezein edit kar sakte hain:
       1. Full Name (Display name)
       2. Phone Number
       3. Profile Picture / Staff Photo (Camera ya system file upload)
       4. Password (Change Password tab mein ja kar purana password + naya password daal kar).
     - EMAIL ADDRESS KISI BHI SURAT CHANGE NAHI HO SAKTA.
   • STORE CONTACT EMAIL VS USER ACCOUNT EMAIL (FARQ SAMJHEIN):
     - Store ki general contact email (Company Settings > Company Email) Admin Settings mein edit kar sakta hai (jo receipts aur invoices par print hoti hai).
     - LEKIN kisi bhi user ya admin ka personal login account email strictly unchangeable aur immutable hai.

5. CASHIER VS ADMIN PERMISSIONS (SECURITY GUARD):
   - Cashier role can ONLY access:
     • POS Terminal (/pos)
     • Shoe Returns & Exchanges (/returns)
     • Customer Management (/customers)
     • Hardware & Printer Settings (/settings in cashier mode)
   - Cashier is STRICTLY BLOCKED and redirected away from Dashboard (/dashboard) and Purchases (/purchases).
   - Kyun? Taake store ke secret cost prices, margins, purchase invoices, suppliers khata aur gross profit cashiers se confidential rahein.
   - Admin has full access to all sections including Reports, Dashboard, Purchases, Suppliers, Settings, User Management, and Backup.

5. BARCODE GENERATION & SCANNING ARCHITECTURE:
   - Barcode standard: Strictly 13-digit EAN-13 barcode format.
   - Formula: 7-digit Store Prefix ("${barcodePrefix}") + 5-digit Product ID Sequence + 1 Modulo-10 Check Digit = 13 digits.
   - Manufacturer Barcode: Agar jootay ke dabbe par pehle se barcode ho, toh Step 3 mein "Scan / Enter Box Barcode" button par click karke scanner gun se scan karke save kiya ja sakta hai.
   - Real-time uniqueness: Duplicate barcodes allow nahi hote.

6. SHOE EXCHANGE & SALES RETURNS WORKFLOW (SALES RETURN VIEW):
   - Location: Returns tab (/returns) ya POS Terminal par "Shoe Exchange" button.
   - Search: Invoice Number (e.g. ${invoicePrefix}0001) ya Customer Phone se previous sale load hoti hai.
   - Item Condition:
     • Good / Restockable: Stock automatic inventory mein wapis add ho jata hai.
     • Defective / Damaged: Damaged stock record mein jata hai aur supplier return ke liye mark ho sakta hai.
   - Exchange Calculation:
     • Agar naye jootay ki qeemat purane se zyada hai: Customer difference pay karega.
     • Agar naye jootay ki qeemat purane se kam hai: Store refund karega ya customer khata/credit ledger mein raqam add karega.
     • Agar equal hai: Zero-balance exchange slip print hogi.
   - Return Policy: Store receipts par 7 days exchange policy print hoti hai with original receipt.

7. STOCK LEDGER & ADJUSTMENTS (INVENTORY AUDIT):
   - Stock Ledger (/inventory > Stock Ledger): Complete chronological audit log of every stock movement:
     • Purchase IN (Mal receive hua)
     • Sale OUT (Counter par bika)
     • Return IN (Customer ne wapis kiya)
     • Exchange IN / OUT (Tabdeeli hui)
     • Stock Adjustment (Damage ya physical audit)
   - Stock Adjust Modal: Inventory mein 3 options:
     1. Add Stock: Stock barhana (without full purchase order).
     2. Damage Stock: Toota hua ya damaged joota alag karna.
     3. Audit Adjustment: Physical counting ke mutabiq balance theek karna.

8. PURCHASES & SUPPLIERS LEDGER (SUPPLIERS KHATA):
   - Location: Purchases tab (/purchases) aur Suppliers tab (/suppliers).
   - Workflow:
     1. "+ New Purchase Order" create karein, supplier select karein, items aur pairs add karein.
     2. Save karne par stock inventory mein add hota hai aur Supplier Ledger mein khata record ho jata hai.
     3. Payment Dene Ka Tareeqa: Suppliers tab mein jayen, supplier ke samne "Record Payment" par click karein aur cash/bank payment record karein.
     4. Purchase Return: Defective mal supplier ko wapis karne par Supplier Return modal use hota hai jo stock kam karta hai aur supplier khata credit karta hai.

9. PRINTER HARDWARE & SILENT PRINTING:
   - Shortcut: F7 opens Hardware & Printers setup.
   - Receipt Printers: 80mm (Standard) aur 58mm thermal ESC/POS printers. WebUSB, WebSerial ya System Network.
   - Barcode Label Printers: TSPL thermal command printer:
     • 50×30mm (Standard shelf barcode)
     • 40×25mm
     • 60×40mm
     • Shoe Box Side-End Labels: 3" × 4" Portrait ya 4" × 3" Landscape (warehouse racks ke liye).
   - Silent Printing: Direct WebUSB ya WebSerial connect karne se browser print dialog bypass ho jata hai aur direct silent print nikalta hai.
   - F9: Instant checkout and direct silent thermal receipt print.

10. OFFLINE CAPABILITIES & PWA (INTERNET OUTAGE & OFFLINE PRICE CHECK):
    - System Progressive Web App (PWA) aur local browser IndexedDB cache par chalta hai.
    - KYA QUICK PRICE RETRIEVAL AUR BARCODE SCANNER OFFLINE PRICE CHECK KAR SAKTE HAIN?
      • JAWAB: "JI HAAN! Bilkul 100% offline check kar sakte hain."
      • Agar products local cache mein sync ho chuke hain, toh internet na hone (offline mode) par bhi:
        1. POS Terminal Barcode Scanner Input: Barcode scanner gun se scan karke ya Article number type karke foran product ki offline pricing dekh sakte hain aur cart mein add kar sakte hain.
        2. Top Header "Quick Price Retrieval" Bar: Yahan bhi scanner gun ya keyboard se Barcode, Article ya SKU daal kar bina internet ke foran product ki qeemat check ki ja sakti hai (Fixed Price, Min/Max Price, Cost Price for Admin, aur Total Pairs in Stock). Wahan "Offline Cache" ka indicator bhi show hota hai aur 1-click par POS cart mein bhi add kiya ja sakta hai.
    - Offline Sales Billing: Cashier offline billing jari rakh sakta hai. Tamam invoices local offline queue mein store hoti rehti hain aur internet wapis aate hi server ke sath automatically sync ho jaati hain.

11. KEYBOARD SHORTCUTS:
    • F1: Sammi AI Assistant
    • F2: Add New Product Wizard
    • F3: Search Products / Focus Barcode Scanner Input
    • F4: Customer Picker / Walk-in toggle
    • F7: Hardware & Printers setup
    • F8: Hold Cart / Retrieve Cart
    • F9: Quick Checkout & Print Receipt
    • F10: Full Screen toggle
    • Esc: Modal close / Cancel

12. DATA BACKUP & RESTORE:
    - Admin Settings > Data Backup & Restore se pore database ka safe SQL ya JSON backup download kar sakta hai aur zarurat parne par restore kar sakta hai.

13. CONFIDENTIALITY & SECURITY:
    - NEVER disclose confidential secrets: NO database URLs (DATABASE_URL), database credentials, admin passwords, cashier PINs, secret keys, or internal system configurations.

═══════════════════════════════════════════════════════════════
TONE & LANGUAGE RULES:
═══════════════════════════════════════════════════════════════
- Respond in natural, helpful, respectful Roman Urdu or English depending on how the user asks.
- Keep instructions 100% structured, concise, and accurate to the exact buttons, shortcuts, and fields that exist in this POS.
- Never invent imaginary fields or generic POS features that do not exist.
- If asked about changing pricing policy or configuring it per product, explicitly state that the 'Pricing Policy' is a global setting established during the initial installation wizard and is immutable for individual products afterward.
- If asked whether Admin or Cashier can change their email address, explicitly state that Email Address is strictly UNCHANGEABLE / IMMUTABLE for both Admin and Cashier accounts. (They can only edit their Name, Phone, Photo, and Password; email cannot be changed).`;

    // Attempt Gemini call via server-side SDK
    try {
      const ai = getGeminiClient();

      // Format multi-turn contents for Gemini SDK
      const contentsPayload = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.text || '') }],
      }));

      // Candidate models with multiple high-availability fallbacks:
      // If 3.8-flash has a 503 high demand spike, seamlessly try 3.1-flash-lite, 2.5-flash, or 2.5-flash-lite
      const candidatePool = [
        chosenModel,
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.8-flash',
      ];

      // Deduplicate preserving order
      const modelCandidates = Array.from(new Set(candidatePool));

      let replyText = '';
      let usedModel = chosenModel;
      let lastQuotaError = false;
      let lastHighDemandError = false;

      for (const model of modelCandidates) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: contentsPayload,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          if (response.text) {
            replyText = response.text.trim();
            usedModel = model;
            break;
          }
        } catch (callErr: any) {
          const errMsg = String(callErr?.message || callErr || '');
          const isHighDemand = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE');
          const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');

          if (isHighDemand) {
            lastHighDemandError = true;
            console.log(`[Chat] Model ${model} is experiencing temporary high demand (503), switching to alternate model...`);
          } else if (isRateLimit) {
            lastQuotaError = true;
            console.log(`[Chat] Model ${model} quota limit reached (429), switching to alternate model...`);
          } else {
            console.log(`[Chat] Model ${model} temporarily unavailable, trying next candidate...`);
          }

          // Brief delay before querying next fallback
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
      }

      if (replyText) {
        return res.json({
          reply: replyText,
          modelUsed: usedModel,
          storeName,
        });
      }

      // If all models hit 503 high demand spikes, inform user politely without 500 crash
      if (lastHighDemandError) {
        return res.json({
          reply: `**Notice:** Gemini AI servers par is waqt temporary high demand hai. Baraye meharbani 15–20 seconds intezar karke dobara message karein.\n\n*Aapka counter billing aur store operations normal tareeqe se kaam kar raha hai.*`,
          modelUsed: 'high-demand-notice',
          storeName,
        });
      }

      // If all models hit 429 quota exhaustion, respond gracefully
      if (lastQuotaError) {
        return res.json({
          reply: `**Notice:** Gemini AI API par temporary quota/rate-limit hit hua hai. Baraye meharbani 30–40 seconds intezar karke dobara message karein.\n\n*Aap counter sales, product catalog, ya returns ke operations normal tareeqe se jari rakh sakte hain.*`,
          modelUsed: 'rate-limit-notice',
          storeName,
        });
      }
    } catch (sdkErr: any) {
      console.log('[Chat] Gemini SDK initialization notice: Check GEMINI_API_KEY');
      return res.status(503).json({
        error: 'Gemini AI service unavailable. Check GEMINI_API_KEY in server secrets.',
      });
    }

    return res.json({
      reply: `Sammi AI is currently busy. Baraye meharbani kuch lamhon baad dobara sawal poochiye.`,
      modelUsed: 'fallback',
      storeName,
    });
  } catch (err: any) {
    console.log('[Chat] Endpoint request processing notice');
    res.status(500).json({
      error: 'Failed to process chat query.',
    });
  }
});

export default router;
