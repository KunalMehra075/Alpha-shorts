import { cn } from '@/lib/utils';

// A 9:16 vertical preview frame (the Shorts canvas).
export function PhoneFrame({
  children,
  className,
  maxHeight = 560
}: {
  children: React.ReactNode;
  className?: string;
  maxHeight?: number;
}) {
  return (
    <div
      className={cn(
        'relative mx-auto aspect-[9/16] w-full max-w-[315px] overflow-hidden rounded-[2rem] border-4 border-foreground/15 bg-black shadow-xl',
        className
      )}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}
