import { NavLink, Outlet } from 'react-router-dom';
import { Clapperboard, FileText, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutGrid, end: true },
  { to: '/templates', label: 'Templates', icon: FileText, end: false }
];

export function RootLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left rail */}
      <aside className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-4">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl btn-red-gradient">
          <Clapperboard className="size-5 text-white" />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={n.label}
              className={({ isActive }) =>
                cn(
                  'flex size-11 flex-col items-center justify-center rounded-xl text-[10px] font-medium transition-colors',
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <n.icon className="size-5" />
            </NavLink>
          ))}
        </nav>
        <ThemeToggle />
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
