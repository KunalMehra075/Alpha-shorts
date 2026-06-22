import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

// Minimal shadcn-style chart wrapper over Recharts. A `ChartConfig` maps each
// series key to a label + color; ChartContainer exposes those colors as
// `--color-<key>` CSS variables so chart children can reference them.
export type ChartConfig = Record<string, { label: string; color?: string }>;

type ChartContextValue = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error('useChart must be used within a <ChartContainer>');
  return ctx;
}

export function ChartContainer({
  config,
  className,
  children
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactElement;
}) {
  const style = React.useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, item] of Object.entries(config)) {
      if (item.color) vars[`--color-${key}`] = item.color;
    }
    return vars as React.CSSProperties;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        style={style}
        className={cn(
          'w-full [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
          '[&_.recharts-cartesian-grid_line]:stroke-border/50',
          '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border',
          '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/40',
          '[&_.recharts-text]:text-xs [&_.recharts-surface]:overflow-visible',
          className
        )}
      >
        <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  labelFormatter?: (label: string) => string;
  valueFormatter?: (value: number, key: string) => string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[10rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      {label != null && (
        <div className="mb-1.5 font-medium text-foreground">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((item: any) => {
          const key = String(item.dataKey ?? item.name);
          const conf = config[key];
          const color = item.color || `var(--color-${key})`;
          const value = typeof item.value === 'number' ? item.value : Number(item.value) || 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
              <span className="text-muted-foreground">{conf?.label ?? key}</span>
              <span className="ml-auto font-mono font-medium text-foreground">
                {valueFormatter ? valueFormatter(value, key) : value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
