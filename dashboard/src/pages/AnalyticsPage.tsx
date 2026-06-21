import { BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
      <p className="mt-1 text-muted-foreground">Performance insights across your shorts.</p>

      <Card className="mt-8 border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <BarChart3 className="size-7 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold">Analytics — coming soon</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This page is reserved for the dedicated analytics build.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
