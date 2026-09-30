import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker with controlled update checks.
// Automatic browser installation banners are suppressed and only triggered on explicit user action.
// Clean up any stale Workbox /sw.js registrations in Cloud Run preview iframes so they never conflict with proxy cookies
if ('serviceWorker' in navigator) {
  if (window.location.hostname.endsWith('.run.app')) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const reg of registrations) {
          const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
          if (scriptUrl.endsWith('/sw.js') || scriptUrl.includes('dev-sw.js')) {
            reg.unregister().catch(() => {});
          }
        }
      })
      .catch(() => {});
  } else {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('[PWA] New version of Shoe POS available.');
      },
      onOfflineReady() {
        console.log('[PWA] Shoe POS ready for offline counter usage.');
      },
      onRegisterError(error) {
        console.warn('[PWA] Service worker registration notice:', error);
      },
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
