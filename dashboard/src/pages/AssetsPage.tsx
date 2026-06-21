import { useRef } from 'react';
import { Film, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn, formatBytes, libraryUrl } from '@/lib/utils';
import { useDeleteMedia, useMediaLibrary, useUploadMedia } from '@/lib/queries';
import type { MediaItem, MediaKind } from '@/lib/types';

export function AssetsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Assets</h1>
      <p className="mt-1 text-muted-foreground">
        Global images and videos, reusable across all your workspaces.
      </p>

      <Tabs defaultValue="image" className="mt-6">
        <TabsList>
          <TabsTrigger value="image">
            <ImageIcon className="size-4" /> Images
          </TabsTrigger>
          <TabsTrigger value="video">
            <Film className="size-4" /> Videos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="image">
          <MediaGrid kind="image" />
        </TabsContent>
        <TabsContent value="video">
          <MediaGrid kind="video" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MediaGrid({ kind }: { kind: Extract<MediaKind, 'image' | 'video'> }) {
  const { data: items, isLoading } = useMediaLibrary(kind);
  const upload = useUploadMedia();
  const del = useDeleteMedia();
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = kind === 'image' ? 'image/*' : 'video/*';
  const label = kind === 'image' ? 'image' : 'video';

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      try {
        await upload.mutateAsync(f);
      } catch (e: any) {
        toast.error(`${f.name}: ${String(e.message ?? e)}`);
      }
    }
    toast.success(`Uploaded ${files.length} ${label}${files.length > 1 ? 's' : ''}`);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{items?.length ?? 0} {label}s</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
          <Upload className="size-4" /> Upload {label}
        </Button>
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : (items?.length ?? 0) === 0 ? (
        <EmptyState kind={kind} onUpload={() => inputRef.current?.click()} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items!.map((m) => (
            <MediaCard key={m.id} m={m} onDelete={() => del.mutate(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ m, onDelete }: { m: MediaItem; onDelete: () => void }) {
  return (
    <Card className="group overflow-hidden">
      <div className="relative aspect-[9/16] w-full bg-muted">
        {m.kind === 'image' ? (
          <img src={libraryUrl(m.file)} alt={m.name} className="size-full object-cover" loading="lazy" />
        ) : (
          <video src={libraryUrl(m.file)} className="size-full object-cover" muted playsInline preload="metadata" />
        )}
        <button
          onClick={onDelete}
          title="Delete"
          className="absolute right-1.5 top-1.5 hidden size-7 items-center justify-center rounded-md bg-background/80 text-destructive backdrop-blur group-hover:flex hover:bg-background"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <CardContent className="p-3">
        <p className="truncate text-xs font-medium" title={m.name}>{m.name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{formatBytes(m.sizeBytes)}</p>
      </CardContent>
    </Card>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="aspect-[9/16] animate-pulse rounded-xl bg-muted/40" />
      ))}
    </div>
  );
}

function EmptyState({ kind, onUpload }: { kind: 'image' | 'video'; onUpload: () => void }) {
  const Icon = kind === 'image' ? ImageIcon : Film;
  return (
    <Card className={cn('border-dashed')}>
      <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-base font-semibold">No {kind}s yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload {kind}s to reuse them across your workspaces.
          </p>
        </div>
        <Button variant="primary" onClick={onUpload}>
          <Upload className="size-4" /> Upload {kind}
        </Button>
      </CardContent>
    </Card>
  );
}
