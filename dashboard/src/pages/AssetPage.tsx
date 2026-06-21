import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Film,
  ImagePlus,
  Images,
  Loader2,
  Music,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  Wand2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TabHeader } from '@/components/TabHeader';
import { cn } from '@/lib/utils';
import {
  useAssets,
  useAutofillAssets,
  useBuildBreakdown,
  useClearSceneAsset,
  useDeleteLibrary,
  useLibrary,
  useScenes,
  useSearchSceneAssets,
  useSelectSceneAsset,
  useSelectSceneFromLibrary,
  useUpdateScene,
  useUploadLibrary,
  useUploadSceneAsset
} from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import { placeholderDataUri } from '@/lib/placeholder';
import { formatBytes } from '@/lib/mockMedia';
import type { AssetRef, LibraryItem, Scene, SceneAssets, ScenePatch, VisualType } from '@/lib/types';

const VISUAL_TYPES: VisualType[] = ['Image', 'Video', 'Animation', 'SplitScreen'];
const EMPTY_ROW = { sceneNumber: 0, keywords: [], imagePrompt: '', candidates: [], selected: null } satisfies SceneAssets;

function mediaUrl(id: string, file: string, bust: number) {
  return `/media/${id}/${file}?v=${bust}`;
}

function thumbFor(id: string, ref: AssetRef | null): string | null {
  if (!ref) return null;
  if (ref.thumbUrl) return ref.thumbUrl;
  if (ref.file && ref.kind === 'image') return mediaUrl(id, ref.file, ref.sizeBytes);
  return null;
}

export function AssetPage() {
  const { workspace, id } = useWorkspaceCtx();
  const navigate = useNavigate();
  const { data: scenesData, isLoading: scenesLoading } = useScenes(id);
  const { data: assets } = useAssets(id);
  const scenes = scenesData ?? [];
  const rows = assets?.scenes ?? [];

  const build = useBuildBreakdown(id);
  const updateScene = useUpdateScene(id);
  const search = useSearchSceneAssets(id);
  const select = useSelectSceneAsset(id);
  const clear = useClearSceneAsset(id);
  const upload = useUploadSceneAsset(id);
  const autofill = useAutofillAssets(id);
  const { data: libraryData } = useLibrary(id);
  const library = libraryData ?? [];
  const uploadLib = useUploadLibrary(id);
  const delLib = useDeleteLibrary(id);

  const [selected, setSelected] = useState(0);
  const [modalItem, setModalItem] = useState<LibraryItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const addToLibrary = (files: File[]) => {
    const media = files.filter((f) => /^(image|video|audio)\//.test(f.type));
    if (!media.length) {
      toast.error('Drop image, video, or audio files.');
      return;
    }
    Promise.allSettled(media.map((f) => uploadLib.mutateAsync(f))).then((rs) => {
      const ok = rs.filter((r) => r.status === 'fulfilled').length;
      if (ok) toast.success(`Added ${ok} file${ok > 1 ? 's' : ''} to the library`);
      const fail = rs.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (fail) toast.error(String(fail.reason?.message ?? 'Some files failed to upload'));
    });
  };

  const runBuild = async () => {
    try {
      const r = await build.mutateAsync();
      toast.success(`Breakdown built from your ${r.source} — ${r.scenes.length} scenes`);
      setSelected(0);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  // No breakdown yet → offer to build it from script or transcript.
  if (!scenes.length) {
    return (
      <div className="animate-fade-in">
        <TabHeader
          icon={Images}
          title="Assets"
          description="Plan the scene-by-scene breakdown, then assign a visual to each scene."
          status={workspace.stages.assets.status}
        />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Wand2 className="size-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold">No scene breakdown yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Build a scene-by-scene breakdown from your <span className="font-medium">script</span> —
              or, if you skipped the Script step, from your <span className="font-medium">audio's
              caption transcript</span>. Every field stays editable afterwards.
            </p>
            <Button variant="primary" onClick={runBuild} disabled={build.isPending || scenesLoading}>
              {build.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Building…
                </>
              ) : (
                <>
                  <Wand2 className="size-4" /> Build scene breakdown
                </>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Needs a script (step 1) or audio + captions (steps 2–3) first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rowFor = (s: Scene, i: number): SceneAssets =>
    rows.find((r) => r.sceneNumber === (s.scene ?? i + 1)) ?? { ...EMPTY_ROW, sceneNumber: s.scene ?? i + 1 };

  const selScene = scenes[selected] ?? scenes[0];
  const selIndex = scenes[selected] ? selected : 0;
  const selNumber = selScene.scene ?? selIndex + 1;
  const selRow = rowFor(selScene, selIndex);
  const assignedCount = scenes.filter((s, i) => rowFor(s, i).selected).length;

  return (
    <div
      className="relative animate-fade-in"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        addToLibrary(Array.from(e.dataTransfer.files));
      }}
    >
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-card px-10 py-8 text-center">
            <UploadCloud className="size-8 text-accent" />
            <p className="text-sm font-semibold">Drop to add to the asset library</p>
            <p className="text-xs text-muted-foreground">Images, videos, and audio</p>
          </div>
        </div>
      )}
      <TabHeader
        icon={Images}
        title="Assets"
        description="Edit the breakdown and assign a visual to each scene."
        status={workspace.stages.assets.status}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={build.isPending} onClick={runBuild}>
              {build.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Rebuild breakdown
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={autofill.isPending}
              onClick={async () => {
                try {
                  await autofill.mutateAsync();
                  toast.success('Auto-filled scenes from top stock results');
                } catch (e: any) {
                  toast.error(String(e.message ?? e));
                }
              }}
            >
              {autofill.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Auto-fill all
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        {/* Scene table */}
        <Card className="min-w-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Spoken Line</th>
                    <th className="p-3 font-medium">Dur</th>
                    <th className="p-3 font-medium">Keywords</th>
                    <th className="p-3 font-medium">Asset</th>
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((s, i) => {
                    const r = rowFor(s, i);
                    const thumb = thumbFor(id, r.selected);
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelected(i)}
                        className={cn(
                          'cursor-pointer border-b border-border/60 transition-colors',
                          selIndex === i ? 'bg-accent/10' : 'hover:bg-muted/50'
                        )}
                      >
                        <td className="p-3 align-top">
                          <Badge variant={selIndex === i ? 'accent' : 'default'}>{i + 1}</Badge>
                        </td>
                        <td className="max-w-[260px] p-3 align-top">
                          <p className="line-clamp-2 text-foreground/90">{s.spokenLine || '—'}</p>
                        </td>
                        <td className="whitespace-nowrap p-3 align-top text-xs text-muted-foreground">
                          {(s.end - s.start).toFixed(1)}s
                        </td>
                        <td className="max-w-[160px] p-3 align-top">
                          <div className="flex flex-wrap gap-1">
                            {(s.searchKeywords ?? []).slice(0, 3).map((k) => (
                              <span
                                key={k}
                                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          {r.selected ? (
                            thumb ? (
                              <img src={thumb} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-border" />
                            ) : (
                              <span className="inline-flex h-12 w-8 items-center justify-center rounded bg-muted ring-1 ring-border">
                                <Film className="size-4 text-muted-foreground" />
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">none</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Inspector — remounts per scene so local edits reset cleanly */}
        <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          <SceneInspector
            key={selNumber}
            id={id}
            index={selIndex}
            sceneNumber={selNumber}
            scene={selScene}
            row={selRow}
            searching={search.isPending && search.variables?.sceneNumber === selNumber}
            selecting={select.isPending}
            onUpdate={(patch) => updateScene.mutate({ sceneNumber: selNumber, patch })}
            onSearch={(keywords) =>
              search.mutateAsync({ sceneNumber: selNumber, keywords }).catch((e) => toast.error(String(e.message ?? e)))
            }
            onSelect={(ref) =>
              select.mutateAsync({ sceneNumber: selNumber, ref }).catch((e) => toast.error(String(e.message ?? e)))
            }
            onClear={() => clear.mutate(selNumber)}
            onUpload={(file) =>
              upload
                .mutateAsync({ sceneNumber: selNumber, file })
                .then(() => toast.success('Uploaded'), (e) => toast.error(String(e.message ?? e)))
            }
          />
        </div>
      </div>

      <AssetLibrary
        id={id}
        items={library}
        uploading={uploadLib.isPending}
        onAdd={addToLibrary}
        onOpen={setModalItem}
        onDelete={(itemId) => delLib.mutate(itemId)}
      />

      <div className="mt-5 flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {assignedCount}/{scenes.length} scenes have an assigned asset.
        </p>
        <Button variant="primary" onClick={() => navigate(`/w/${id}/video`)}>
          Proceed to Video Editor <ArrowRight className="size-4" />
        </Button>
      </div>

      {modalItem && (
        <LibraryModal id={id} item={modalItem} sceneNumber={selNumber} onClose={() => setModalItem(null)} />
      )}
    </div>
  );
}

function SceneInspector({
  id,
  index,
  sceneNumber,
  scene,
  row,
  searching,
  selecting,
  onUpdate,
  onSearch,
  onSelect,
  onClear,
  onUpload
}: {
  id: string;
  index: number;
  sceneNumber: number;
  scene: Scene;
  row: SceneAssets;
  searching: boolean;
  selecting: boolean;
  onUpdate: (patch: ScenePatch) => void;
  onSearch: (keywords: string[]) => void;
  onSelect: (ref: AssetRef) => void;
  onClear: () => void;
  onUpload: (file: File) => void;
}) {
  // Local draft of the editable breakdown fields (debounced → updateScene).
  const [spokenLine, setSpokenLine] = useState(scene.spokenLine);
  const [keywords, setKeywords] = useState(scene.searchKeywords.join(', '));
  const [imagePrompt, setImagePrompt] = useState(scene.imagePrompt);
  const [visualDescription, setVisualDescription] = useState(scene.visualDescription);
  const [durationSec, setDurationSec] = useState(Math.max(0.5, Math.round((scene.end - scene.start) * 10) / 10));
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;

  const parsedKeywords = () => keywords.split(',').map((k) => k.trim()).filter(Boolean);

  useEffect(() => {
    if (!dirty) return;
    const h = setTimeout(() => {
      updateRef.current({ spokenLine, searchKeywords: parsedKeywords(), imagePrompt, visualDescription, durationSec });
      setDirty(false);
    }, 900);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenLine, keywords, imagePrompt, visualDescription, durationSec, dirty]);

  const candidates = row.candidates;
  const selected = row.selected;
  const selectedThumb = thumbFor(id, selected);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="accent" className="whitespace-nowrap text-sm">Scene {index + 1}</Badge>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>Duration</span>
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={durationSec}
              onChange={(e) => {
                setDurationSec(Math.max(0.5, Number(e.target.value) || 0.5));
                setDirty(true);
              }}
              className="h-8 w-20 text-sm"
            />
            <span>s</span>
            <Select
              value={scene.visualType}
              onChange={(e) => onUpdate({ visualType: e.target.value as VisualType })}
              className="h-8 w-32 text-xs"
            >
              {VISUAL_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Spoken line */}
        <div className="grid gap-1.5">
          <Label>Spoken line</Label>
          <Textarea
            value={spokenLine}
            onChange={(e) => {
              setSpokenLine(e.target.value);
              setDirty(true);
            }}
            className="min-h-[56px] text-sm"
          />
        </div>

        {/* Current asset */}
        <div className="grid max-w-full gap-2">
          <Label>Selected asset</Label>
          {selected ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              {selectedThumb ? (
                <img src={selectedThumb} alt="" className="h-14 w-14 rounded object-cover" />
              ) : (
                <span className="inline-flex h-14 w-14 items-center justify-center rounded bg-muted">
                  <Film className="size-5 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0 flex-1 max-w-[320px]">
                <p className="truncate text-sm font-medium">{selected.label || selected.kind}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {selected.kind} · {selected.source}
                  {selected.sizeBytes ? ` · ${formatBytes(selected.sizeBytes)}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={onClear}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-4" /> Upload image
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Upload video
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>

        {/* Keywords + search */}
        <div className="grid gap-1.5">
          <Label>Search keywords</Label>
          <div className="flex gap-2">
            <Input
              value={keywords}
              onChange={(e) => {
                setKeywords(e.target.value);
                setDirty(true);
              }}
              className="h-9 text-sm"
              placeholder="underwater ruins, ancient city"
            />
            <Button variant="primary" size="sm" className="shrink-0" disabled={searching} onClick={() => onSearch(parsedKeywords())}>
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </Button>
          </div>
        </div>

        {/* Visual description */}
        <div className="grid gap-1.5">
          <Label>Visual description</Label>
          <Input
            value={visualDescription}
            onChange={(e) => {
              setVisualDescription(e.target.value);
              setDirty(true);
            }}
            className="h-9 text-sm"
          />
        </div>

        {/* AI image prompt */}
        <div className="grid gap-1.5">
          <Label>AI image prompt</Label>
          <Textarea
            value={imagePrompt}
            onChange={(e) => {
              setImagePrompt(e.target.value);
              setDirty(true);
            }}
            className="min-h-[80px] font-mono text-[12px] leading-relaxed"
            placeholder="Saved for later — AI image generation is wired in a future round."
          />
        </div>

        {/* Suggestions */}
        <div className="grid gap-1.5">
          <Label>Suggested assets</Label>
          {candidates.length === 0 ? (
            <p className="rounded-lg bg-muted/50 p-4 text-center text-xs text-muted-foreground">
              No suggestions yet — click <span className="font-medium">Search</span>. Stock results
              need <code>PEXELS_API_KEY</code> / <code>PIXABAY_API_KEY</code> in your <code>.env</code>.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {candidates.map((c, i) => {
                const t = c.thumbUrl || placeholderDataUri(`${sceneNumber}-${i}`, { ratio: '9:16' });
                const isSel =
                  !!selected &&
                  (selected.downloadUrl === c.downloadUrl || selected.libraryPath === c.libraryPath) &&
                  selected.label === c.label;
                return (
                  <button
                    key={`${c.source}-${i}`}
                    onClick={() => onSelect(c)}
                    disabled={selecting}
                    className={cn(
                      'group relative aspect-[9/16] overflow-hidden rounded-lg ring-1 transition disabled:opacity-60',
                      isSel ? 'ring-2 ring-accent' : 'ring-border hover:ring-accent/50'
                    )}
                    title={`${c.kind} · ${c.source}`}
                  >
                    <img src={t} alt="" className="size-full object-cover" />
                    {c.kind === 'video' && (
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5">
                        <Play className="size-3 text-white" />
                      </span>
                    )}
                    <span className="absolute right-1 top-1 rounded bg-black/55 px-1 text-[9px] uppercase text-white">
                      {c.source}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AssetLibrary({
  id,
  items,
  uploading,
  onAdd,
  onOpen,
  onDelete
}: {
  id: string;
  items: LibraryItem[];
  uploading: boolean;
  onAdd: (files: File[]) => void;
  onOpen: (item: LibraryItem) => void;
  onDelete: (itemId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const images = items.filter((i) => i.kind === 'image');
  const videos = items.filter((i) => i.kind === 'video');
  const audios = items.filter((i) => i.kind === 'audio');

  const MediaCard = ({ item }: { item: LibraryItem }) => {
    const url = `/media/${id}/${item.file}`;
    return (
      <div className="group relative">
        <button
          onClick={() => onOpen(item)}
          title={`${item.name} — click to add to the selected scene`}
          className="block aspect-[9/16] w-full overflow-hidden rounded-md ring-1 ring-border transition hover:ring-2 hover:ring-accent/60"
        >
          {item.kind === 'image' ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <video src={url} muted preload="metadata" className="size-full object-cover" />
          )}
          {item.kind === 'video' && (
            <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5">
              <Play className="size-2.5 text-white" />
            </span>
          )}
        </button>
        <button
          onClick={() => onDelete(item.id)}
          title="Delete"
          className="absolute right-1 top-1 hidden rounded bg-black/65 p-1 text-white hover:text-destructive group-hover:block"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    );
  };

  const Grid = ({ list }: { list: LibraryItem[] }) =>
    list.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing here yet — drag &amp; drop media, or use Add media.
      </p>
    ) : (
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {list.map((it) => (
          <MediaCard key={it.id} item={it} />
        ))}
      </div>
    );

  return (
    <Card className="mt-5">
      <CardContent className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Asset Library</h3>
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add media
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (fs.length) onAdd(fs);
            }}
          />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Drag &amp; drop images, videos, or audio anywhere on this page. Click an image/video to add it
          to the selected scene; audio is used in the Video Editor's background music.
        </p>
        <Tabs defaultValue="images">
          <TabsList>
            <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
            <TabsTrigger value="videos">Videos ({videos.length})</TabsTrigger>
            <TabsTrigger value="audio">Audio ({audios.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="images">
            <Grid list={images} />
          </TabsContent>
          <TabsContent value="videos">
            <Grid list={videos} />
          </TabsContent>
          <TabsContent value="audio">
            {audios.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No audio yet — drop audio files to use as background music in the Video Editor.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {audios.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    <Music className="size-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                    <audio src={`/media/${id}/${a.file}`} controls className="h-8 max-w-[220px]" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => onDelete(a.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Preview a library image/video and add it to the currently selected scene.
function LibraryModal({
  id,
  item,
  sceneNumber,
  onClose
}: {
  id: string;
  item: LibraryItem;
  sceneNumber: number;
  onClose: () => void;
}) {
  const add = useSelectSceneFromLibrary(id);
  const url = `/media/${id}/${item.file}`;
  const doAdd = async () => {
    try {
      await add.mutateAsync({ sceneNumber, itemId: item.id });
      toast.success(`Added to Scene ${sceneNumber}`);
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate">{item.name}</DialogTitle>
        </DialogHeader>
        <div className="mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-lg border border-border bg-black">
          {item.kind === 'image' ? (
            <img src={url} alt="" className="size-full object-contain" />
          ) : (
            <video src={url} controls playsInline className="size-full object-contain" />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doAdd} disabled={add.isPending}>
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} Add to
            Scene {sceneNumber}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
