import { Check, Circle, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { StageStatus } from '@/lib/types';

const META: Record<
  StageStatus,
  { label: string; icon: React.ReactNode; variant: 'completed' | 'in_progress' | 'failed' | 'not_started' }
> = {
  completed: { label: 'Completed', icon: <Check className="size-3" />, variant: 'completed' },
  in_progress: {
    label: 'In Progress',
    icon: <Loader2 className="size-3 animate-spin" />,
    variant: 'in_progress'
  },
  failed: { label: 'Failed', icon: <X className="size-3" />, variant: 'failed' },
  not_started: {
    label: 'Not Started',
    icon: <Circle className="size-2.5" />,
    variant: 'not_started'
  }
};

export function StatusBadge({ status }: { status: StageStatus }) {
  const m = META[status];
  return (
    <Badge variant={m.variant}>
      {m.icon}
      {m.label}
    </Badge>
  );
}

export function StatusDot({ status }: { status: StageStatus }) {
  const color =
    status === 'completed'
      ? 'bg-accent'
      : status === 'failed'
        ? 'bg-destructive'
        : status === 'in_progress'
          ? 'bg-foreground'
          : 'bg-muted-foreground/40';
  return <span className={`inline-block size-2 rounded-full ${color}`} />;
}
