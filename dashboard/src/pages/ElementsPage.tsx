import { useEffect, useRef, useState } from 'react';
import { Eraser, Loader2, MoreVertical, Pencil, Pipette, Shapes, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { elementUrl, formatBytes } from '@/lib/utils';
import {
  useApplyElementBg,
  useDeleteElement,
  useElementLibrary,
  useRenameElement,
  useUploadElement
} from '@/lib/queries';
import type { BgParams, ElementItem } from '@/lib/types';

// Faint checkerboard so transparency is visible in previews.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'repeating-conic-gradient(#00000000 0% 25%, rgba(255,255,255,0.10) 0% 50%)',
  backgroundSize: '16px 16px'
};

export function ElementsPage() {
  const { data: items, isLoading } = useElementLibrary();
  const upload = useUploadElement();
  const del = useDeleteElement();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bgFor, setBgFor] = useState<ElementItem | null>(null);
  const [renameFor, setRenameFor] = useState<ElementItem | null>(null);

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
            Reusable overlays — arrows, icons, badges, subscribe gifs. Use the ⋮ menu to remove a
            green-screen background, then drop them onto any project's timeline.
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
              <ElementCard
                key={el.id}
                el={el}
                onDelete={() => del.mutate(el.id)}
                onRemoveBg={() => setBgFor(el)}
                onRename={() => setRenameFor(el)}
              />
            ))}
          </div>
        )}
      </div>

      {bgFor && <RemoveBackgroundModal element={bgFor} onClose={() => setBgFor(null)} />}
      {renameFor && <RenameDialog element={renameFor} onClose={() => setRenameFor(null)} />}
    </div>
  );
}

function RenameDialog({ element, onClose }: { element: ElementItem; onClose: () => void }) {
  const rename = useRenameElement();
  const [name, setName] = useState(element.name);
  const save = async () => {
    if (!name.trim()) return;
    try {
      await rename.mutateAsync({ id: element.id, name: name.trim() });
      toast.success('Renamed');
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename element</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Element name"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim() || rename.isPending} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ElementCard({
  el,
  onDelete,
  onRemoveBg,
  onRename
}: {
  el: ElementItem;
  onDelete: () => void;
  onRemoveBg: () => void;
  onRename: () => void;
}) {
  // Videos show their middle-frame poster, and play (with sound) on hover.
  const poster = el.thumb ? elementUrl(el.thumb) : undefined;
  const vidRef = useRef<HTMLVideoElement>(null);
  const onEnter = () => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.play().catch(() => {});
  };
  const onLeave = () => {
    const v = vidRef.current;
    if (!v) return;
    v.pause();
    v.load(); // restore the poster frame
  };
  return (
    <Card className="group overflow-hidden">
      <div
        className="relative flex aspect-square w-full items-center justify-center p-3"
        style={CHECKER}
        onMouseEnter={el.kind === 'video' ? onEnter : undefined}
        onMouseLeave={el.kind === 'video' ? onLeave : undefined}
      >
        {el.kind === 'video' ? (
          <video
            ref={vidRef}
            src={elementUrl(el.file)}
            poster={poster}
            loop
            playsInline
            preload="none"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <img src={elementUrl(el.file)} alt={el.name} className="max-h-full max-w-full object-contain" loading="lazy" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
          {el.kind}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Options"
              className="absolute right-1.5 top-1.5 hidden size-7 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur group-hover:flex data-[state=open]:flex hover:bg-background"
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRemoveBg}>
              <Eraser className="size-4" /> Remove background
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

function RemoveBackgroundModal({ element, onClose }: { element: ElementItem; onClose: () => void }) {
  const apply = useApplyElementBg();
  const [params, setParams] = useState<BgParams>({
    color: '#00ff00',
    similarity: 0.2,
    blend: 0.1,
    despill: true
  });
  const [strength, setStrength] = useState(0.2);
  const [soft, setSoft] = useState(0.1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Debounced server-side keyed preview whenever params change.
  useEffect(() => {
    let cancelled = false;
    setPreviewing(true);
    const h = setTimeout(async () => {
      try {
        const { file } = await api.elementBgPreview(element.id, params);
        if (!cancelled) setPreviewUrl(`${elementUrl(file)}?t=${Date.now()}`);
      } catch (e: any) {
        if (!cancelled) toast.error(String(e.message ?? e));
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [element.id, params]);

  const pickColor = async () => {
    const ED = (window as any).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      if (res?.sRGBHex) setParams((p) => ({ ...p, color: res.sRGBHex }));
    } catch {
      /* cancelled */
    }
  };

  const onApply = async () => {
    try {
      await apply.mutateAsync({ elementId: element.id, params });
      toast.success('Transparent element added');
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const isVideoOut = element.kind !== 'image'; // keyed video/gif → webm

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Remove background</DialogTitle>
          <DialogDescription>
            Key out a solid color from “{element.name}”. The result is saved as a new transparent
            element (the original is kept).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Original</span>
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border" style={CHECKER}>
              {element.kind === 'video' ? (
                <video src={elementUrl(element.file)} className="max-h-full max-w-full object-contain" muted loop autoPlay playsInline />
              ) : (
                <img src={elementUrl(element.file)} alt="" className="max-h-full max-w-full object-contain" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview</span>
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border" style={CHECKER}>
              {previewUrl &&
                (isVideoOut ? (
                  <video key={previewUrl} src={previewUrl} className="max-h-full max-w-full object-contain" muted loop autoPlay playsInline />
                ) : (
                  <img key={previewUrl} src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
                ))}
              {previewing && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-16 text-muted-foreground">Color</span>
            <input
              type="color"
              value={params.color}
              onChange={(e) => setParams((p) => ({ ...p, color: e.target.value }))}
              className="h-8 w-12 cursor-pointer rounded border border-input bg-background"
            />
            <span className="font-mono text-xs text-muted-foreground">{params.color}</span>
            {typeof window !== 'undefined' && (window as any).EyeDropper && (
              <Button variant="outline" size="sm" className="ml-auto h-8" onClick={pickColor} title="Pick the color to remove from the original">
                <Pipette className="size-3.5" /> Pick from image
              </Button>
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center justify-between text-muted-foreground">
              <span>Strength</span>
              <span className="tabular-nums">{Math.round(strength * 100)}%</span>
            </span>
            <Slider
              value={Math.round(strength * 100)}
              min={1}
              max={100}
              onValueChange={(v) => setStrength(v / 100)}
              onValueCommit={(v) => setParams((p) => ({ ...p, similarity: v / 100 }))}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center justify-between text-muted-foreground">
              <span>Edge softness</span>
              <span className="tabular-nums">{Math.round(soft * 100)}%</span>
            </span>
            <Slider
              value={Math.round(soft * 100)}
              min={0}
              max={100}
              onValueChange={(v) => setSoft(v / 100)}
              onValueCommit={(v) => setParams((p) => ({ ...p, blend: v / 100 }))}
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Remove edge spill</span>
            <Switch checked={params.despill} onCheckedChange={(on) => setParams((p) => ({ ...p, despill: on }))} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={apply.isPending} onClick={onApply}>
            {apply.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Eraser className="size-4" /> Add transparent element
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
