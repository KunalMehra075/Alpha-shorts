import * as React from 'react';
import { cn } from '@/lib/utils';

// Lightweight slider on a styled native range input (red accent via accent-color).
export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onValueChange: (v: number) => void;
  // Fires once when the drag ends (pointer up / key up) — use to persist while
  // onValueChange drives a smooth local preview.
  onValueCommit?: (v: number) => void;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onValueChange, onValueCommit, ...props }, ref) => {
    const commit = (e: React.SyntheticEvent<HTMLInputElement>) =>
      onValueCommit?.(Number((e.target as HTMLInputElement).value));
    return (
      <input
        ref={ref}
        type="range"
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        onPointerUp={onValueCommit ? commit : undefined}
        onKeyUp={onValueCommit ? commit : undefined}
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-accent',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent',
          className
        )}
        {...props}
      />
    );
  }
);
Slider.displayName = 'Slider';
