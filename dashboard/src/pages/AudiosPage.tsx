import { useRef } from 'react';
import { Music, Trash2, Upload, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { formatBytes, libraryUrl } from '@/lib/utils';
import {
  useDeleteMedia,
  useDeleteSound,
  useMediaLibrary,
  useSoundLibrary,
  useUploadMedia,
  useUploadSound
} from '@/lib/queries';

type AudioRow = { id: string; name: string; src: string; durationSec: number; sizeBytes?: number };

export function AudiosPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Audios</h1>
      <p className="mt-1 text-muted-foreground">
        Global background music and sound effects, reusable across all workspaces.
      </p>

      <Tabs defaultValue="music" className="mt-6">
        <TabsList>
          <TabsTrigger value="music">
            <Music className="size-4" /> Music
          </TabsTrigger>
          <TabsTrigger value="sounds">
            <Volume2 className="size-4" /> Sounds
          </TabsTrigger>
        </TabsList>
        <TabsContent value="music">
          <MusicTab />
        </TabsContent>
        <TabsContent value="sounds">
          <SoundsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MusicTab() {
  const { data, isLoading } = useMediaLibrary('audio');
  const upload = useUploadMedia();
  const del = useDeleteMedia();
  const rows: AudioRow[] = (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    src: libraryUrl(m.file),
    durationSec: m.durationSec,
    sizeBytes: m.sizeBytes
  }));
  return (
    <AudioList
      kindLabel="track"
      rows={rows}
      isLoading={isLoading}
      onUpload={(f) => upload.mutateAsync(f)}
      uploading={upload.isPending}
      onDelete={(id) => del.mutate(id)}
    />
  );
}

function SoundsTab() {
  const { data, isLoading } = useSoundLibrary();
  const upload = useUploadSound();
  const del = useDeleteSound();
  const rows: AudioRow[] = (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    src: `/sounds/${s.file}`,
    durationSec: s.durationSec,
    sizeBytes: s.sizeBytes
  }));
  return (
    <AudioList
      kindLabel="sound"
      rows={rows}
      isLoading={isLoading}
      onUpload={(f) => upload.mutateAsync(f)}
      uploading={upload.isPending}
      onDelete={(id) => del.mutate(id)}
    />
  );
}

function AudioList({
  kindLabel,
  rows,
  isLoading,
  onUpload,
  uploading,
  onDelete
}: {
  kindLabel: string;
  rows: AudioRow[];
  isLoading: boolean;
  onUpload: (file: File) => Promise<unknown>;
  uploading: boolean;
  onDelete: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      try {
        await onUpload(f);
      } catch (e: any) {
        toast.error(`${f.name}: ${String(e.message ?? e)}`);
      }
    }
    toast.success(`Uploaded ${files.length} ${kindLabel}${files.length > 1 ? 's' : ''}`);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{rows.length} {kindLabel}s</span>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Upload className="size-4" /> Upload {kindLabel}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Music className="size-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold">No {kindLabel}s yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload audio to reuse it across your workspaces.
              </p>
            </div>
            <Button variant="primary" onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" /> Upload {kindLabel}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Music className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={r.name}>{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.durationSec ? `${r.durationSec.toFixed(1)}s` : '—'}
                    {r.sizeBytes ? ` · ${formatBytes(r.sizeBytes)}` : ''}
                  </p>
                </div>
                <audio src={r.src} controls preload="none" className="h-8 max-w-[260px]" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-destructive"
                  title="Delete"
                  onClick={() => onDelete(r.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
