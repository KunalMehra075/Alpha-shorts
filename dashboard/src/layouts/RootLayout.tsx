import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  Clapperboard,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  Music,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/assets', label: 'Assets', icon: ImageIcon, end: false },
  { to: '/audios', label: 'Audios', icon: Music, end: false },
  { to: '/prompts', label: 'Prompts', icon: FileText, end: false }
];

const STORAGE_KEY = 'shorts-sidebar-collapsed';

export function RootLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-border bg-card py-4 transition-[width] duration-200',
          collapsed ? 'w-[68px] items-center px-2' : 'w-[220px] px-3'
        )}
      >
        {/* Brand + collapse toggle */}
        <div
          className={cn(
            'mb-4 flex items-center',
            collapsed ? 'flex-col gap-3' : 'justify-between'
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl btn-red-gradient">
              <Clapperboard className="size-5 text-white" />
            </div>
            {!collapsed && (
              <span className="truncate text-sm font-bold tracking-tight">Alpha Shorts</span>
            )}
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={n.label}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-xl text-sm font-medium transition-colors',
                  collapsed ? 'size-11 justify-center self-center' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <n.icon className="size-5 shrink-0" />
              {!collapsed && <span className="truncate">{n.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={cn('mt-2', collapsed ? 'self-center' : 'self-start')}>
          <ThemeToggle />
        </div>
      </aside>

      {/* Content — min-w-0 lets it shrink so wide children scroll internally
          instead of forcing horizontal page overflow. */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
