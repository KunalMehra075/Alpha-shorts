import { useRef } from 'react';
import { Shapes, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { elementUrl, formatBytes } from '@/lib/utils';
import { useDeleteElement, useElementLibrary, useUploadElement } from '@/lib/queries';
import type { ElementItem } from '@/lib/types';

export function ElementsPage() {
  const { data: items, isLoading } = useElementLibrary();
  const upload = useUploadElement();
  const del = useDeleteElement();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await upload.mutateAsync(f);
        ok++;
      } catch (e: any) {
        toast.error(`${f.name}: ${String(e.message ?? e)}`);
      }
    }
    if (ok) toast.success(`Uploaded ${ok} element${ok > 1 ? 's' : ''}`);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Elements</h1>
          <p className="mt-1 text-muted-foreground">
            Reusable overlays — arrows, icons, badges, subscribe gifs — droppable onto any project's
            video timeline.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.gif,video/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
          <Upload className="size-4" /> Upload element
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <GridSkeleton />
        ) : (items?.length ?? 0) === 0 ? (
          <EmptyState onUpload={() => inputRef.current?.click()} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {items!.map((el) => (
              <ElementCard key={el.id} el={el} onDelete={() => del.mutate(el.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ElementCard({ el, onDelete }: { el: ElementItem; onDelete: () => void }) {
  return (
    <Card className="group overflow-hidden">
      <div className="relative flex aspect-square w-full items-center justify-center bg-[conic-gradient(at_50%_50%,#0000_25%,#ffffff0a_0_50%)_50%/16px_16px] p-3">
        {el.kind === 'video' ? (
          <video src={elementUrl(el.file)} className="max-h-full max-w-full object-contain" muted playsInline preload="metadata" />
        ) : (
          <img src={elementUrl(el.file)} alt={el.name} className="max-h-full max-w-full object-contain" loading="lazy" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
          {el.kind}
        </span>
        <button
          onClick={onDelete}
          title="Delete"
          className="absolute right-1.5 top-1.5 hidden size-7 items-center justify-center rounded-md bg-background/80 text-destructive backdrop-blur group-hover:flex hover:bg-background"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <CardContent className="p-3">
        <p className="truncate text-xs font-medium" title={el.name}>
          {el.name}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{formatBytes(el.sizeBytes)}</p>
      </CardContent>
    </Card>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted/40" />
      ))}
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Shapes className="size-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-base font-semibold">No elements yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload PNG/SVG icons, animated gifs, or short videos (arrows, badges, a subscribe
            animation) to overlay on your videos.
          </p>
        </div>
        <Button variant="primary" onClick={onUpload}>
          <Upload className="size-4" /> Upload element
        </Button>
      </CardContent>
    </Card>
  );
}
