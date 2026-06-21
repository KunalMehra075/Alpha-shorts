import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Film,
  ImagePlus,
  Images,
  Loader2,
  Play,
  Search,
  Sparkles,
  Upload,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TabHeader } from '@/components/TabHeader';
import { cn } from '@/lib/utils';
import {
  useAssets,
  useAutofillAssets,
  useClearSceneAsset,
  useSaveSceneMeta,
  useScript,
  useSearchSceneAssets,
  useSelectSceneAsset,
  useUploadSceneAsset
} from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import { placeholderDataUri } from '@/lib/placeholder';
import { formatBytes } from '@/lib/mockMedia';
import type { AssetRef, Scene, SceneAssets } from '@/lib/types';

// Media URL for a downloaded/uploaded workspace file (cache-busted by size so a
// re-selected scene-N file doesn't show the stale cached version).
function mediaUrl(id: string, file: string, bust: number) {
  return `/media/${id}/${file}?v=${bust}`;
}

// Best preview image URL for an asset ref, or null (caller falls back to a tile).
function thumbFor(id: string, ref: AssetRef | null): string | null {
  if (!ref) return null;
  if (ref.thumbUrl) return ref.thumbUrl;
  if (ref.file && ref.kind === 'image') return mediaUrl(id, ref.file, ref.sizeBytes);
  return null;
}

export function AssetPage() {
  const { workspace, id } = useWorkspaceCtx();
  const navigate = useNavigate();
  const { data: script } = useScript(id);
  const { data: assets } = useAssets(id);
  const scenes = script?.scenes ?? [];
  const rows = assets?.scenes ?? [];

  const search = useSearchSceneAssets(id);
  const select = useSelectSceneAsset(id);
  const clear = useClearSceneAsset(id);
  const saveMeta = useSaveSceneMeta(id);
  const upload = useUploadSceneAsset(id);
  const autofill = useAutofillAssets(id);

  const [selected, setSelected] = useState(0);

  if (!scenes.length) {
    return (
      <div className="animate-fade-in">
        <TabHeader
          icon={Images}
          title="Assets"
          description="Gather and assign a visual to every scene."
          status={workspace.stages.assets.status}
        />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Film className="size-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold">No scenes yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generate a script with a scene breakdown first — each scene gets its own asset here.
            </p>
            <Button variant="primary" onClick={() => navigate(`/w/${id}/script`)}>
              Go to Script Generator
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rowFor = (s: Scene, i: number): SceneAssets | undefined =>
    rows.find((r) => r.sceneNumber === (s.scene ?? i + 1));

  const selScene = scenes[selected];
  const selNumber = selScene.scene ?? selected + 1;
  const selRow = rowFor(selScene, selected);
  const assignedCount = scenes.filter((s, i) => rowFor(s, i)?.selected).length;

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={Images}
        title="Assets"
        description="Search stock, pick a visual for each scene, or upload your own."
        status={workspace.stages.assets.status}
        actions={
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
            {autofill.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Auto-fill all
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
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
                    const thumb = thumbFor(id, r?.selected ?? null);
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelected(i)}
                        className={cn(
                          'cursor-pointer border-b border-border/60 transition-colors',
                          selected === i ? 'bg-accent/10' : 'hover:bg-muted/50'
                        )}
                      >
                        <td className="p-3 align-top">
                          <Badge variant={selected === i ? 'accent' : 'default'}>{i + 1}</Badge>
                        </td>
                        <td className="max-w-[260px] p-3 align-top">
                          <p className="line-clamp-2 text-foreground/90">{s.spokenLine || '—'}</p>
                        </td>
                        <td className="whitespace-nowrap p-3 align-top text-xs text-muted-foreground">
                          {(s.end - s.start).toFixed(1)}s
                        </td>
                        <td className="max-w-[160px] p-3 align-top">
                          <div className="flex flex-wrap gap-1">
                            {(r?.keywords ?? []).slice(0, 3).map((k) => (
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
                          {r?.selected ? (
                            thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                className="h-12 w-8 rounded object-cover ring-1 ring-border"
                              />
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
          {selRow && (
            <SceneInspector
              key={selNumber}
              id={id}
              index={selected}
              sceneNumber={selNumber}
              spokenLine={selScene.spokenLine}
              row={selRow}
              searching={search.isPending && search.variables?.sceneNumber === selNumber}
              selecting={select.isPending}
              onSearch={(keywords) =>
                search.mutateAsync({ sceneNumber: selNumber, keywords }).catch((e) =>
                  toast.error(String(e.message ?? e))
                )
              }
              onSelect={(ref) =>
                select.mutateAsync({ sceneNumber: selNumber, ref }).catch((e) =>
                  toast.error(String(e.message ?? e))
                )
              }
              onClear={() => clear.mutate(selNumber)}
              onSaveMeta={(keywords, imagePrompt) =>
                saveMeta.mutate({ sceneNumber: selNumber, keywords, imagePrompt })
              }
              onUpload={(file) =>
                upload.mutateAsync({ sceneNumber: selNumber, file }).then(
                  () => toast.success('Uploaded'),
                  (e) => toast.error(String(e.message ?? e))
                )
              }
            />
          )}
        </div>
      </div>

      {/* Asset library */}
      <AssetLibrary id={id} rows={rows} />

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {assignedCount}/{scenes.length} scenes have an assigned asset.
        </p>
        <Button variant="primary" onClick={() => navigate(`/w/${id}/video`)}>
          Proceed to Video Editor <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function SceneInspector({
  id,
  index,
  sceneNumber,
  spokenLine,
  row,
  searching,
  selecting,
  onSearch,
  onSelect,
  onClear,
  onSaveMeta,
  onUpload
}: {
  id: string;
  index: number;
  sceneNumber: number;
  spokenLine: string;
  row: SceneAssets;
  searching: boolean;
  selecting: boolean;
  onSearch: (keywords: string[]) => void;
  onSelect: (ref: AssetRef) => void;
  onClear: () => void;
  onSaveMeta: (keywords: string[], imagePrompt: string) => void;
  onUpload: (file: File) => void;
}) {
  const [keywords, setKeywords] = useState(row.keywords.join(', '));
  const [imagePrompt, setImagePrompt] = useState(row.imagePrompt);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef(onSaveMeta);
  saveRef.current = onSaveMeta;

  const parsedKeywords = () =>
    keywords.split(',').map((k) => k.trim()).filter(Boolean);

  // Debounced persist of keyword/prompt edits (no API search on its own).
  useEffect(() => {
    if (!dirty) return;
    const h = setTimeout(() => {
      saveRef.current(parsedKeywords(), imagePrompt);
      setDirty(false);
    }, 900);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords, imagePrompt, dirty]);

  const candidates = row.candidates;
  const selected = row.selected;
  const selectedThumb = thumbFor(id, selected);

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="accent" className="whitespace-nowrap text-sm">
            Scene {index + 1}
          </Badge>
          <p className="line-clamp-1 text-sm text-muted-foreground">{spokenLine}</p>
        </div>

        {/* Current asset */}
        <div className="grid gap-2 max-w-full">
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
              <div className="min-w-0 flex-1 max-w-[310px]">
                <p className="truncate text-sm font-medium ">{selected.label || selected.kind}</p>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-4" /> Upload image
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
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
        <div className="grid gap-2">
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
            <Button
              variant="primary"
              size="sm"
              className="shrink-0"
              disabled={searching}
              onClick={() => onSearch(parsedKeywords())}
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </Button>
          </div>
        </div>

        {/* Image prompt (persisted; AI generation comes later) */}
        <div className="grid gap-2">
          <Label>AI image prompt</Label>
          <Textarea
            value={imagePrompt}
            onChange={(e) => {
              setImagePrompt(e.target.value);
              setDirty(true);
            }}
            className="min-h-[100px] font-mono text-[12px] leading-relaxed"
            placeholder="Saved for later — AI image generation is wired in a future round."
          />
        </div>

        {/* Suggestions */}
        <div className="grid gap-2">
          <Label>Suggested assets</Label>
          {candidates.length === 0 ? (
            <p className="rounded-lg bg-muted/50 p-4 text-center text-xs text-muted-foreground">
              No suggestions yet — click <span className="font-medium">Search</span>. Stock results
              need <code>PEXELS_API_KEY</code> / <code>PIXABAY_API_KEY</code> set in your{' '}
              <code>.env</code>.
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

function AssetLibrary({ id, rows }: { id: string; rows: SceneAssets[] }) {
  const used = rows.map((r) => r.selected).filter(Boolean) as AssetRef[];
  const images = used.filter((a) => a.kind === 'image');
  const videos = used.filter((a) => a.kind === 'video');
  const uploaded = used.filter((a) => a.origin === 'upload');
  const stock = used.filter((a) => a.source === 'pexels' || a.source === 'pixabay');

  const Section = ({ items }: { items: AssetRef[] }) =>
    items.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>
    ) : (
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {items.map((a, i) => {
          const t = thumbFor(id, a) ?? placeholderDataUri(`${a.source}-${i}`, { ratio: '9:16' });
          return (
            <div key={`${a.file ?? a.downloadUrl ?? i}`} className="relative">
              <img
                src={t}
                alt=""
                className="aspect-[9/16] w-full rounded-md object-cover ring-1 ring-border"
              />
              {a.kind === 'video' && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5">
                  <Play className="size-2.5 text-white" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    );

  return (
    <Card className="mt-5">
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Asset Library</h3>
        <Tabs defaultValue="images">
          <TabsList>
            <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
            <TabsTrigger value="videos">Videos ({videos.length})</TabsTrigger>
            <TabsTrigger value="uploaded">Uploaded ({uploaded.length})</TabsTrigger>
            <TabsTrigger value="stock">Stock ({stock.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="images">
            <Section items={images} />
          </TabsContent>
          <TabsContent value="videos">
            <Section items={videos} />
          </TabsContent>
          <TabsContent value="uploaded">
            <Section items={uploaded} />
          </TabsContent>
          <TabsContent value="stock">
            <Section items={stock} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
