import {
  ArrowLeft,
  ArrowRight,
  Blend,
  ChevronsRight,
  CircleDashed,
  Contrast,
  Scaling,
  ZoomIn,
  type LucideIcon
} from 'lucide-react';
import type { Transition } from '@/lib/editorOptions';

// An SVG icon for each transition in the library.
const ICONS: Record<Transition, LucideIcon> = {
  Fade: Contrast,
  Crossfade: Blend,
  Zoom: ZoomIn,
  'Slide Left': ArrowLeft,
  'Slide Right': ArrowRight,
  Push: ChevronsRight,
  'Blur Transition': CircleDashed,
  'Scale Transition': Scaling
};

export function transitionIcon(name: string): LucideIcon {
  return ICONS[name as Transition] ?? Contrast;
}

export function TransitionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = transitionIcon(name);
  return <Icon className={className} />;
}
