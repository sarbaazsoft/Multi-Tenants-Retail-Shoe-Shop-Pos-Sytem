import React, { useEffect } from 'react';

interface DynamicManifestManagerProps {
  mode: 'ROOT_LANDING' | 'SUPERADMIN' | 'TENANT_ACTIVE' | 'TENANT_SUSPENDED' | 'TENANT_NOT_FOUND';
  tenantSlug: string | null;
  tenantName?: string;
  themeColor?: string;
}

/**
 * Dynamically rewrites `<link rel="manifest">`, `<meta name="theme-color">`,
 * and `document.title` for:
 * - SuperAdmin Dedicated PWA (`/admin/manifest.webmanifest`, `#0F172A`, "MyPOS SaaS C-Panel")
 * - Per-Tenant Dynamic Store PWA (`/api/tenants/:slug/manifest`, tenant themeColor, store name)
 * - Root SaaS Landing Page (`/manifest.webmanifest`)
 */
export const DynamicManifestManager: React.FC<DynamicManifestManagerProps> = ({
  mode,
  tenantSlug,
  tenantName,
  themeColor,
}) => {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    let manifestHref = '/manifest.webmanifest';
    let activeThemeColor = '#0F172A';
    let pageTitle = 'MyPOS Cloud — Multi-Tenant Footwear POS SaaS';

    if (mode === 'SUPERADMIN') {
      manifestHref = '/admin/manifest.webmanifest';
      activeThemeColor = '#0F172A';
      pageTitle = 'MyPOS SaaS C-Panel | POS Admin';
    } else if (mode === 'TENANT_ACTIVE' && tenantSlug) {
      manifestHref = `/api/tenants/${encodeURIComponent(tenantSlug)}/manifest`;
      activeThemeColor = themeColor || '#7C3AED';
      pageTitle = `${tenantName || tenantSlug} — Cloud POS Terminal`;
    } else if (mode === 'TENANT_SUSPENDED' && tenantSlug) {
      manifestHref = `/api/tenants/${encodeURIComponent(tenantSlug)}/manifest`;
      activeThemeColor = '#991B1B';
      pageTitle = `Store Suspended — ${tenantName || tenantSlug}`;
    } else if (mode === 'TENANT_NOT_FOUND' && tenantSlug) {
      activeThemeColor = '#0F172A';
      pageTitle = `Store Not Found (${tenantSlug}) — MyPOS Cloud`;
    }

    // Update or create <link rel="manifest">
    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    if (manifestLink.getAttribute('href') !== manifestHref) {
      manifestLink.setAttribute('href', manifestHref);
    }

    // Update or create <meta name="theme-color">
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', activeThemeColor);

    document.title = pageTitle;
  }, [mode, tenantSlug, tenantName, themeColor]);

  return null;
};
