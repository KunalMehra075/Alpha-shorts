import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/lib/theme';

export function Toaster() {
  const { resolved } = useTheme();
  return (
    <SonnerToaster
      theme={resolved}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg border border-border bg-card text-card-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'btn-red-gradient rounded-full',
          error: 'text-destructive'
        }
      }}
    />
  );
}
