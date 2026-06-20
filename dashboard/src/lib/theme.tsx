import * as React from 'react';

type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'shorts-theme';

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function resolve(theme: Theme): Resolved {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark'
  );
  const [resolved, setResolved] = React.useState<Resolved>(() => resolve(theme));

  React.useEffect(() => {
    const r = resolve(theme);
    setResolved(r);
    const root = document.documentElement;
    root.classList.toggle('dark', r === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  React.useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setThemeState('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    resolved,
    setTheme: setThemeState,
    toggle: () => setThemeState(resolved === 'dark' ? 'light' : 'dark')
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
