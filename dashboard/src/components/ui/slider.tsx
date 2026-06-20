import * as React from 'react';
import { cn } from '@/lib/utils';

// Lightweight slider on a styled native range input (red accent via accent-color).
export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onValueChange: (v: number) => void;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onValueChange, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
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
