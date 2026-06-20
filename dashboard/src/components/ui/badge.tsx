import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-muted text-muted-foreground',
        accent: 'border-transparent bg-accent text-accent-foreground',
        outline: 'border-border text-foreground',
        // status colors stay within black/white/red/gray
        completed: 'border-transparent bg-accent/15 text-accent',
        in_progress: 'border-border bg-muted text-foreground',
        failed: 'border-transparent bg-destructive/15 text-destructive',
        not_started: 'border-border bg-transparent text-muted-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
