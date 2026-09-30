import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type Theme = ResolvedTheme; // backward compatibility

interface ThemeContextType {
  theme: ResolvedTheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  themeMode: 'light',
  setThemeMode: () => {},
  setTheme: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getSystemPreference = (): ResolvedTheme => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  };

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem('pos_theme');
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        return stored;
      }
      return 'light';
    } catch {
      return 'light';
    }
  });

  const [theme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    try {
      const stored = localStorage.getItem('pos_theme');
      if (stored === 'dark') return 'dark';
      if (stored === 'light') return 'light';
      if (stored === 'system') {
        return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      }
      return 'light';
    } catch {
      return 'light';
    }
  });

  const isFirstMount = useRef(true);
  const transitionTimeoutRef = useRef<number | null>(null);
  const themeModeRef = useRef<ThemeMode>(themeMode);

  useEffect(() => {
    themeModeRef.current = themeMode;
  }, [themeMode]);

  const applyThemeToDOM = (resolved: ResolvedTheme, animate = true) => {
    try {
      const root = document.documentElement;
      const body = document.body;

      // Trigger subtle cross-fade transition class on theme switch
      if (animate && !isFirstMount.current) {
        root.classList.add('theme-transitioning');
        if (body) {
          body.classList.add('theme-transitioning');
        }
        if (transitionTimeoutRef.current) {
          window.clearTimeout(transitionTimeoutRef.current);
        }
        transitionTimeoutRef.current = window.setTimeout(() => {
          root.classList.remove('theme-transitioning');
          if (body) {
            body.classList.remove('theme-transitioning');
          }
        }, 450);
      }

      if (resolved === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
        root.setAttribute('data-theme', 'dark');
        if (body) {
          body.classList.add('dark');
          body.classList.remove('light');
          body.style.colorScheme = 'dark';
        }
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.style.colorScheme = 'light';
        root.setAttribute('data-theme', 'light');
        if (body) {
          body.classList.remove('dark');
          body.classList.add('light');
          body.style.colorScheme = 'light';
        }
      }
      window.dispatchEvent(new CustomEvent('pos:theme-changed', { detail: { theme: resolved } }));
    } catch (e) {
      console.error('Error applying theme:', e);
    }
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem('pos_theme', mode);
    } catch (_) {}
    const resolved = mode === 'system' ? getSystemPreference() : mode;
    setResolvedTheme(resolved);
    applyThemeToDOM(resolved, true);
  };

  const setTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const toggleTheme = () => {
    // If currently dark, switch to light, else dark
    const nextMode: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
  };

  // Synchronize on mount and whenever themeMode changes
  useEffect(() => {
    const resolved = themeMode === 'system' ? getSystemPreference() : themeMode;
    setResolvedTheme(resolved);
    applyThemeToDOM(resolved, !isFirstMount.current);
    if (isFirstMount.current) {
      isFirstMount.current = false;
    }
  }, [themeMode]);

  // Real-time OS theme change listener when "system" is selected
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (themeModeRef.current === 'system') {
        const newResolved: ResolvedTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(newResolved);
        applyThemeToDOM(newResolved, true);
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Synchronize theme changes across tabs/windows
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pos_theme' && (e.newValue === 'dark' || e.newValue === 'light' || e.newValue === 'system')) {
        setThemeModeState(e.newValue as ThemeMode);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);



