import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Film,
  HardDriveUpload,
  ImagePlus,
  Images,
  Layers,
  Loader2,
  Music,
  Play,
  Plus,
  Scissors,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TabHeader } from '@/components/TabHeader';
import { cn } from '@/lib/utils';
import {
  useAddLibraryFromGlobal,
  useAddSceneFromMedia,
  useAssets,
  useAutofillAssets,
  useBuildBreakdown,
  useClearSceneAsset,
  useDeleteLibrary,
  useGenerateLibraryImage,
  useGenerateSceneImage,
  useImageGenStatus,
  useLibrary,
  useMediaLibrary,
  useRemoveScene,
  useScenes,
  useSceneJobs,
  useSearchSceneAssets,
  useSelectSceneAsset,
  useSelectSceneFromLibrary,
  useTrimSceneAsset,
  useUpdateScene,
  useUploadLibrary,
  useUploadSceneAsset,
  qk
} from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectCtx } from '@/layouts/ProjectLayout';
import { placeholderDataUri } from '@/lib/placeholder';
import { formatBytes } from '@/lib/mockMedia';
import { libraryUrl } from '@/lib/utils';
import type { AssetRef, LibraryItem, MediaItem, Scene, SceneAssets, ScenePatch, VisualType } from '@/lib/types';

// Scenes are only Image or Video (Animation/SplitScreen are no longer used).
const VISUAL_TYPES: VisualType[] = ['Image', 'Video'];
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
  const { project, id } = useProjectCtx();
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
  const addFromMedia = useAddSceneFromMedia(id);
  const removeScene = useRemoveScene(id);
  const trimAsset = useTrimSceneAsset(id);
  const genScene = useGenerateSceneImage(id);
  const qc = useQueryClient();

  // Background jobs (breakdown / autofill) — polled so progress persists across
  // page navigation and the table can fill in scene-by-scene.
  const { data: jobs } = useSceneJobs(id);
  const breakdownRunning = jobs?.breakdown?.status === 'running';
  const autofillRunning = jobs?.autofill?.status === 'running';

  // Scenes currently generating an AI image (their asset cell shows a spinner).
  const [generatingScenes, setGeneratingScenes] = useState<Set<number>>(new Set());

  // While autofill runs, refresh scenes/assets on every poll tick so selected
  // assets appear top-to-bottom as the backend fills them.
  useEffect(() => {
    if (!autofillRunning) return;
    qc.invalidateQueries({ queryKey: qk.assets(id) });
    qc.invalidateQueries({ queryKey: qk.scenes(id) });
  }, [jobs?.autofill?.updatedAt, autofillRunning, id, qc]);

  // On job completion (running → not), refresh data and surface a toast once.
  const prevBreakdown = useRef(false);
  const prevAutofill = useRef(false);
  useEffect(() => {
    if (prevBreakdown.current && !breakdownRunning) {
      const j = jobs?.breakdown;
      qc.invalidateQueries({ queryKey: qk.scenes(id) });
      qc.invalidateQueries({ queryKey: qk.assets(id) });
      qc.invalidateQueries({ queryKey: qk.project(id) });
      qc.invalidateQueries({ queryKey: qk.projects });
      if (j?.status === 'error') {
        toast.error(`Breakdown failed: ${j.error ?? 'unknown error'}`);
      } else if (j?.meta?.mock) {
        toast.warning(
          `Breakdown used the mock fallback (${j.meta.sceneCount ?? 0} scenes) — the AI provider failed or no API key is set.`
        );
      } else if (j) {
        toast.success(`Breakdown built via ${j.meta?.provider ?? 'AI'} — ${j.meta?.sceneCount ?? 0} scenes`);
        setSelected(0);
      }
    }
    prevBreakdown.current = !!breakdownRunning;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownRunning]);

  useEffect(() => {
    if (prevAutofill.current && !autofillRunning) {
      const j = jobs?.autofill;
      qc.invalidateQueries({ queryKey: qk.assets(id) });
      qc.invalidateQueries({ queryKey: qk.scenes(id) });
      qc.invalidateQueries({ queryKey: qk.project(id) });
      if (j?.status === 'error') toast.error(`Auto-fill failed: ${j.error ?? 'unknown error'}`);
      else toast.success(`Auto-filled ${j?.done ?? 0} scene${(j?.done ?? 0) === 1 ? '' : 's'} from stock`);
    }
    prevAutofill.current = !!autofillRunning;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillRunning]);

  // Generate an AI image for one scene; its row shows a spinner until it lands.
  const generateSceneImage = async (sceneNumber: number, prompt: string) => {
    setGeneratingScenes((s) => new Set(s).add(sceneNumber));
    try {
      await genScene.mutateAsync({ scene: sceneNumber, prompt });
      toast.success('Image generated & selected');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    } finally {
      setGeneratingScenes((s) => {
        const next = new Set(s);
        next.delete(sceneNumber);
        return next;
      });
    }
  };

  const [selected, setSelected] = useState(0);
  const [modalItem, setModalItem] = useState<LibraryItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  // Whether this short has a script/narration (drives spoken-line columns/fields).
  const hasScript =
    project.script.currentVersion != null || scenes.some((s) => (s.spokenLine ?? '').trim().length > 0);

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

  // Kicks off the background breakdown job; progress + completion are driven by
  // the jobs poll (so this survives navigating away and back).
  const runBuild = async () => {
    try {
      await build.mutateAsync();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const runAutofill = async () => {
    try {
      await autofill.mutateAsync();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  // Breakdown job in progress (and no scenes yet) → show a progress card. This
  // survives switching pages because the job state lives on the server.
  if (!scenes.length && breakdownRunning) {
    return <BreakdownProgress status={project.stages.assets.status} startedAt={jobs!.breakdown!.startedAt} />;
  }

  // No scenes yet and the user hasn't chosen manual → offer both entry points.
  if (!scenes.length && !manualMode) {
    const canAi = hasScript || project.captions.hasTranscript;
    return (
      <div className="animate-fade-in">
        <TabHeader
          icon={Images}
          title="Assets"
          description="Plan the scene-by-scene breakdown, then assign a visual to each scene."
          status={project.stages.assets.status}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {/* AI */}
          <Card className="border-dashed">
            <CardContent className="flex h-full flex-col items-center gap-3 p-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                <Wand2 className="size-7 text-muted-foreground" />
              </div>
              <p className="text-base font-semibold">Generate with AI</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Split your <span className="font-medium">script</span> (or the caption transcript)
                into scenes automatically. Every field stays editable.
              </p>
              <Button
                variant="primary"
                className="mt-auto"
                onClick={runBuild}
                disabled={build.isPending || breakdownRunning || scenesLoading || !canAi}
              >
                {build.isPending || breakdownRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Building…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" /> Generate with AI
                  </>
                )}
              </Button>
              {!canAi && (
                <p className="text-[11px] text-muted-foreground">
                  Needs a script (step 1) or audio + captions (steps 2–3) first.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Manual */}
          <Card className="border-dashed">
            <CardContent className="flex h-full flex-col items-center gap-3 p-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                <Layers className="size-7 text-muted-foreground" />
              </div>
              <p className="text-base font-semibold">Build manually</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Add scenes one by one from your assets — no script needed. Pick images and videos,
                trim clips, set durations.
              </p>
              <Button variant="secondary" className="mt-auto" onClick={() => setManualMode(true)}>
                <Layers className="size-4" /> Build manually
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const rowFor = (s: Scene, i: number): SceneAssets =>
    rows.find((r) => r.sceneNumber === (s.scene ?? i + 1)) ?? { ...EMPTY_ROW, sceneNumber: s.scene ?? i + 1 };

  const hasScenes = scenes.length > 0;
  const selIndex = scenes[selected] ? selected : 0;
  const selScene = scenes[selIndex];
  const selNumber = selScene ? selScene.scene ?? selIndex + 1 : 0;
  const selRow = selScene ? rowFor(selScene, selIndex) : EMPTY_ROW;
  const assignedCount = scenes.filter((s, i) => rowFor(s, i).selected).length;
  const colSpan = 5 + (hasScript ? 2 : 0); // # + [Spoken] + Type + Dur + [Keywords] + Asset + remove

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
        status={project.stages.assets.status}
        actions={
          <div className="flex gap-2">
            {hasScript && (
              <Button
                variant="outline"
                size="sm"
                disabled={build.isPending || breakdownRunning}
                onClick={runBuild}
              >
                {build.isPending || breakdownRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                Rebuild breakdown
              </Button>
            )}
            {hasScript && (
              <Button
                variant="outline"
                size="sm"
                disabled={autofill.isPending || autofillRunning}
                onClick={runAutofill}
              >
                {autofill.isPending || autofillRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {autofillRunning ? `Auto-filling… ${jobs?.autofill?.done ?? 0}/${jobs?.autofill?.total ?? 0}` : 'Auto-fill all'}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add Scene
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
                    {hasScript && <th className="p-3 font-medium">Spoken Line</th>}
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Dur</th>
                    {hasScript && <th className="p-3 font-medium">Keywords</th>}
                    <th className="p-3 font-medium">Asset</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((s, i) => {
                    const r = rowFor(s, i);
                    const thumb = thumbFor(id, r.selected);
                    const sceneNo = s.scene ?? i + 1;
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelected(i)}
                        className={cn(
                          'group cursor-pointer border-b border-border/60 transition-colors',
                          selIndex === i ? 'bg-accent/10' : 'hover:bg-muted/50'
                        )}
                      >
                        <td className="p-3 align-top">
                          <Badge variant={selIndex === i ? 'accent' : 'default'}>{i + 1}</Badge>
                        </td>
                        {hasScript && (
                          <td className="max-w-[260px] p-3 align-top">
                            <p className="line-clamp-2 text-foreground/90">{s.spokenLine || '—'}</p>
                          </td>
                        )}
                        <td className="whitespace-nowrap p-3 align-top text-xs text-muted-foreground">
                          {s.visualType}
                        </td>
                        <td className="whitespace-nowrap p-3 align-top text-xs text-muted-foreground">
                          {(s.end - s.start).toFixed(1)}s
                        </td>
                        {hasScript && (
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
                        )}
                        <td className="p-3 align-top">
                          {(() => {
                            // A scene shows a loading box when it's generating an
                            // AI image (even if an asset is already attached — it's
                            // being replaced), or while auto-fill is still working
                            // toward an empty scene that has keywords.
                            const generating = generatingScenes.has(sceneNo);
                            const autofilling =
                              autofillRunning && !r.selected && (s.searchKeywords ?? []).length > 0;
                            if (generating || autofilling) {
                              return (
                                <span className="inline-flex h-12 w-12 items-center justify-center rounded bg-muted ring-1 ring-border">
                                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                </span>
                              );
                            }
                            if (r.selected) {
                              return r.selected.file && r.selected.kind === 'video' ? (
                                <video
                                  src={`/media/${id}/${r.selected.file}?v=${r.selected.sizeBytes}`}
                                  muted
                                  preload="metadata"
                                  className="h-12 w-12 rounded object-cover ring-1 ring-border"
                                />
                              ) : thumb ? (
                                <img src={thumb} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-border" />
                              ) : (
                                <span className="inline-flex h-12 w-8 items-center justify-center rounded bg-muted ring-1 ring-border">
                                  <Film className="size-4 text-muted-foreground" />
                                </span>
                              );
                            }
                            return <span className="text-xs text-muted-foreground">none</span>;
                          })()}
                        </td>
                        <td className="p-3 align-top">
                          <button
                            title="Remove scene"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeScene
                                .mutateAsync(sceneNo)
                                .then(
                                  () => setSelected((cur) => Math.max(0, cur - (i <= cur ? 1 : 0))),
                                  (err) => toast.error(String(err.message ?? err))
                                );
                            }}
                            className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Full-width Add Scene row */}
                  <tr>
                    <td colSpan={colSpan} className="p-0">
                      <button
                        onClick={() => setAddOpen(true)}
                        className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-accent"
                      >
                        <Plus className="size-4" /> Add Scene
                      </button>
                    </td>
                  </tr>
                  {!hasScenes && (
                    <tr>
                      <td colSpan={colSpan} className="px-3 pb-4 text-center text-xs text-muted-foreground">
                        No scenes yet — click “Add Scene” to pick your first asset.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Inspector — remounts per scene so local edits reset cleanly */}
        <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          {hasScenes && selScene ? (
            <SceneInspector
              key={selNumber}
              id={id}
              index={selIndex}
              sceneNumber={selNumber}
              scene={selScene}
              row={selRow}
              hasScript={hasScript}
              searching={search.isPending && search.variables?.sceneNumber === selNumber}
              selecting={select.isPending}
              generating={generatingScenes.has(selNumber)}
              onGenerate={(prompt) => generateSceneImage(selNumber, prompt)}
              onUpdate={(patch) => updateScene.mutate({ sceneNumber: selNumber, patch })}
              onDuration={(dur) => {
                const sel = selRow.selected;
                if (sel && sel.kind === 'video' && sel.file) {
                  const start = sel.trimStartSec ?? 0;
                  trimAsset
                    .mutateAsync({ sceneNumber: selNumber, trimStartSec: start, trimEndSec: start + dur })
                    .catch((e) => toast.error(String(e.message ?? e)));
                } else {
                  updateScene.mutate({ sceneNumber: selNumber, patch: { durationSec: dur } });
                }
              }}
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
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <Layers className="size-7" />
                <p className="text-sm">Add a scene to start building your timeline.</p>
              </CardContent>
            </Card>
          )}
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

      {addOpen && (
        <AddSceneModal
          id={id}
          library={library}
          adding={addFromMedia.isPending}
          onImport={addToLibrary}
          uploading={uploadLib.isPending}
          onAdd={async (payload) => {
            try {
              const { scenes: next } = await addFromMedia.mutateAsync(payload);
              setSelected(Math.max(0, next.length - 1));
              setAddOpen(false);
              toast.success('Scene added');
            } catch (e: any) {
              toast.error(String(e.message ?? e));
            }
          }}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

// Full-page progress while the AI breakdown job runs. The bar is a "guess" (the
// LLM gives no progress signal) that eases toward 95%; the page swaps to the
// scene table once the job completes. Persists across navigation because the job
// lives on the server.
function BreakdownProgress({
  status,
  startedAt
}: {
  status: ComponentProps<typeof TabHeader>['status'];
  startedAt: string;
}) {
  const [pct, setPct] = useState(6);
  useEffect(() => {
    const start = Date.parse(startedAt) || Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      setPct(Math.min(95, Math.max(6, 95 * (1 - Math.exp(-elapsed / 11)))));
    };
    tick();
    const h = setInterval(tick, 250);
    return () => clearInterval(h);
  }, [startedAt]);

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={Images}
        title="Assets"
        description="Generating the scene-by-scene breakdown…"
        status={status}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <Wand2 className="size-7 animate-pulse text-accent" />
          </div>
          <div>
            <p className="text-base font-semibold">Generating scenes with AI…</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Splitting your script into scenes with English keywords and detailed image prompts. This
              usually takes 20–30 seconds.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">{Math.round(pct)}%</p>
          </div>
          <p className="text-[11px] text-muted-foreground">You can switch tabs — this keeps running.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SceneInspector({
  id,
  index,
  sceneNumber,
  scene,
  row,
  hasScript,
  searching,
  selecting,
  generating,
  onGenerate,
  onUpdate,
  onDuration,
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
  hasScript: boolean;
  searching: boolean;
  selecting: boolean;
  generating: boolean;
  onGenerate: (prompt: string) => void;
  onUpdate: (patch: ScenePatch) => void;
  onDuration: (durationSec: number) => void;
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
  const [durDirty, setDurDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  const durRef = useRef(onDuration);
  durRef.current = onDuration;

  const { data: imageGen } = useImageGenStatus();
  const generateImage = () => {
    if (!imagePrompt.trim() || generating) return;
    onGenerate(imagePrompt.trim());
  };

  const parsedKeywords = () => keywords.split(',').map((k) => k.trim()).filter(Boolean);

  // Text fields → updateScene (duration handled separately so videos can trim).
  useEffect(() => {
    if (!dirty) return;
    const h = setTimeout(() => {
      updateRef.current({ spokenLine, searchKeywords: parsedKeywords(), imagePrompt, visualDescription });
      setDirty(false);
    }, 900);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenLine, keywords, imagePrompt, visualDescription, dirty]);

  // Duration → updateScene (image) or trim-from-end (video). Routed by parent.
  useEffect(() => {
    if (!durDirty) return;
    const h = setTimeout(() => {
      durRef.current(durationSec);
      setDurDirty(false);
    }, 700);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSec, durDirty]);

  const candidates = row.candidates;
  const selected = row.selected;
  const selectedThumb = thumbFor(id, selected);
  const isVideo = selected?.kind === 'video';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="accent" className="whitespace-nowrap text-sm">Scene {index + 1}</Badge>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span title={isVideo ? 'Trims the clip from the end' : undefined}>Duration</span>
            <Input
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              value={durationSec}
              onChange={(e) => {
                setDurationSec(Math.max(0.5, Math.min(60, Number(e.target.value) || 0.5)));
                setDurDirty(true);
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
        {hasScript && (
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
        )}

        {/* Current asset */}
        <div className="grid max-w-full gap-2">
          <Label>Selected asset</Label>
          {selected ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              {selected.file && selected.kind === 'video' ? (
                <video
                  src={`/media/${id}/${selected.file}?v=${selected.sizeBytes}`}
                  muted
                  preload="metadata"
                  className="h-14 w-14 rounded object-cover"
                />
              ) : selectedThumb ? (
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
        {hasScript && (
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
        )}

        {/* AI image prompt */}
        {hasScript && (
          <div className="grid gap-1.5">
            <Label>AI image prompt</Label>
            <Textarea
              value={imagePrompt}
              onChange={(e) => {
                setImagePrompt(e.target.value);
                setDirty(true);
              }}
              className="min-h-[80px] font-mono text-[12px] leading-relaxed"
              placeholder="e.g. ultra-realistic cinematic 9:16 portrait of…"
            />
            {imageGen && !imageGen.available ? (
              <p className="text-[11px] text-muted-foreground">
                Add <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code> to <code>.env</code> to
                enable AI image generation.
              </p>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={!imagePrompt.trim() || generating}
                onClick={generateImage}
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate image
                  </>
                )}
              </Button>
            )}
          </div>
        )}

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
                const isSel =
                  !!selected &&
                  (selected.downloadUrl === c.downloadUrl || selected.libraryPath === c.libraryPath) &&
                  selected.label === c.label;
                return (
                  <SuggestionCard
                    key={`${c.source}-${i}`}
                    c={c}
                    poster={c.thumbUrl || placeholderDataUri(`${sceneNumber}-${i}`, { ratio: '9:16' })}
                    isSel={isSel}
                    selecting={selecting}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// One suggested-asset tile. Videos play (with audio) on hover, restoring their
// poster on leave; images are static.
function SuggestionCard({
  c,
  poster,
  isSel,
  selecting,
  onSelect
}: {
  c: AssetRef;
  poster: string;
  isSel: boolean;
  selecting: boolean;
  onSelect: (c: AssetRef) => void;
}) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const isVideo = c.kind === 'video' && !!c.downloadUrl;
  const enter = () => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.play().catch(() => {});
  };
  const leave = () => {
    const v = vidRef.current;
    if (!v) return;
    v.pause();
    v.load(); // restore the poster frame
  };
  return (
    <button
      onClick={() => onSelect(c)}
      disabled={selecting}
      onMouseEnter={isVideo ? enter : undefined}
      onMouseLeave={isVideo ? leave : undefined}
      className={cn(
        'group relative aspect-[9/16] overflow-hidden rounded-lg ring-1 transition disabled:opacity-60',
        isSel ? 'ring-2 ring-accent' : 'ring-border hover:ring-accent/50'
      )}
      title={`${c.kind} · ${c.source}`}
    >
      {isVideo ? (
        <video
          ref={vidRef}
          src={c.downloadUrl!}
          poster={poster}
          loop
          playsInline
          preload="none"
          className="size-full object-cover"
        />
      ) : (
        <img src={poster} alt="" className="size-full object-cover" />
      )}
      {c.kind === 'video' && (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5 group-hover:opacity-0">
          <Play className="size-3 text-white" />
        </span>
      )}
      <span className="absolute right-1 top-1 rounded bg-black/55 px-1 text-[9px] uppercase text-white">
        {c.source}
      </span>
    </button>
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
  const [globalOpen, setGlobalOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const genLib = useGenerateLibraryImage(id);
  const { data: imageGen } = useImageGenStatus();
  const generate = async () => {
    if (!genPrompt.trim()) return;
    try {
      await genLib.mutateAsync(genPrompt.trim());
      toast.success('Image generated & added to library');
      setGenPrompt('');
      setGenOpen(false);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setGenOpen(true)}>
              <Sparkles className="size-4" /> Generate with AI
            </Button>
            <Button variant="outline" size="sm" onClick={() => setGlobalOpen(true)}>
              <Layers className="size-4" /> Add from global media
            </Button>
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add media
            </Button>
          </div>
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
      {globalOpen && <GlobalLibraryPicker id={id} onClose={() => setGlobalOpen(false)} />}

      <Dialog open={genOpen} onOpenChange={(o) => setGenOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate image with AI</DialogTitle>
            <DialogDescription>
              Describe the image — generated in 9:16 and added to this project's library.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            placeholder="e.g. ultra-realistic cinematic 9:16 portrait of an ancient temple at golden hour"
            className="min-h-[110px] text-sm"
          />
          {imageGen && !imageGen.available && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              Image generation isn’t configured. Add <code>GEMINI_API_KEY</code> (or{' '}
              <code>OPENAI_API_KEY</code>) to <code>.env</code> and restart.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGenOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!genPrompt.trim() || genLib.isPending || (imageGen && !imageGen.available)}
              onClick={generate}
            >
              {genLib.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Add-from-global-media modal (copies global items into the project library) ──
function GlobalLibraryPicker({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: gImages } = useMediaLibrary('image');
  const { data: gVideos } = useMediaLibrary('video');
  const { data: gAudio } = useMediaLibrary('audio');
  const addFromGlobal = useAddLibraryFromGlobal(id);
  const [search, setSearch] = useState('');
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const q = search.trim().toLowerCase();
  const filt = (list: MediaItem[] | undefined) =>
    (list ?? []).filter((m) => !q || m.name.toLowerCase().includes(q));

  const add = async (m: MediaItem) => {
    try {
      await addFromGlobal.mutateAsync(m.id);
      setAdded((a) => ({ ...a, [m.id]: true }));
      toast.success(`Added “${m.name}” to the library`);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const VisualGrid = ({ list, empty }: { list: MediaItem[]; empty: string }) =>
    list.length === 0 ? (
      <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      <div className="grid max-h-[48vh] grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-4">
        {list.map((m) => (
          <button
            key={m.id}
            onClick={() => add(m)}
            disabled={addFromGlobal.isPending}
            title={`${m.name} — add to project`}
            className={cn(
              'group relative aspect-[9/16] overflow-hidden rounded-lg ring-1 transition disabled:opacity-60',
              added[m.id] ? 'ring-2 ring-accent' : 'ring-border hover:ring-2 hover:ring-accent'
            )}
          >
            {m.kind === 'image' ? (
              <img src={libraryUrl(m.file)} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
              <video src={libraryUrl(m.file)} muted preload="metadata" className="size-full object-cover" />
            )}
            {added[m.id] && (
              <span className="absolute inset-0 flex items-center justify-center bg-accent/30 text-[11px] font-semibold text-white">
                Added ✓
              </span>
            )}
          </button>
        ))}
      </div>
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from global media</DialogTitle>
          <DialogDescription>Copy images, videos, or music from your global library into this project.</DialogDescription>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search global media…" className="h-9" />
        <Tabs defaultValue="images" className="mt-1">
          <TabsList>
            <TabsTrigger value="images">Images ({filt(gImages).length})</TabsTrigger>
            <TabsTrigger value="videos">Videos ({filt(gVideos).length})</TabsTrigger>
            <TabsTrigger value="music">Music ({filt(gAudio).length})</TabsTrigger>
          </TabsList>
          <TabsContent value="images">
            <VisualGrid list={filt(gImages)} empty="No global images — add some on the Assets page." />
          </TabsContent>
          <TabsContent value="videos">
            <VisualGrid list={filt(gVideos)} empty="No global videos — add some on the Assets page." />
          </TabsContent>
          <TabsContent value="music">
            {filt(gAudio).length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No global music — add some on the Audios page.</p>
            ) : (
              <div className="flex max-h-[48vh] flex-col gap-2 overflow-y-auto">
                {filt(gAudio).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    <Music className="size-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                    <audio src={libraryUrl(m.file)} controls preload="none" className="h-8 max-w-[160px]" />
                    <Button variant={added[m.id] ? 'secondary' : 'primary'} size="sm" disabled={addFromGlobal.isPending} onClick={() => add(m)}>
                      {added[m.id] ? 'Added ✓' : 'Add'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add-Scene modal ───────────────────────────────────────────────────────────
type PickItem = { id: string; kind: 'image' | 'video'; name: string; url: string; source: 'library' | 'global' };

function AddSceneModal({
  id,
  library,
  adding,
  onImport,
  uploading,
  onAdd,
  onClose
}: {
  id: string;
  library: LibraryItem[];
  adding: boolean;
  onImport: (files: File[]) => void;
  uploading: boolean;
  onAdd: (payload: {
    source: 'library' | 'global';
    itemId: string;
    durationSec?: number;
    trimStartSec?: number;
    trimEndSec?: number;
  }) => void;
  onClose: () => void;
}) {
  const { data: gImages } = useMediaLibrary('image');
  const { data: gVideos } = useMediaLibrary('video');
  const fileRef = useRef<HTMLInputElement>(null);
  const [trimTarget, setTrimTarget] = useState<PickItem | null>(null);

  const localItems: PickItem[] = library
    .filter((i) => i.kind === 'image' || i.kind === 'video')
    .map((i) => ({ id: i.id, kind: i.kind as 'image' | 'video', name: i.name, url: `/media/${id}/${i.file}`, source: 'library' }));
  const globalItems: PickItem[] = [...(gImages ?? []), ...(gVideos ?? [])].map((m: MediaItem) => ({
    id: m.id,
    kind: m.kind as 'image' | 'video',
    name: m.name,
    url: libraryUrl(m.file),
    source: 'global'
  }));

  const pick = (it: PickItem) => {
    if (it.kind === 'video') setTrimTarget(it);
    else onAdd({ source: it.source, itemId: it.id, durationSec: 3 });
  };

  const Grid = ({ list, empty }: { list: PickItem[]; empty: string }) =>
    list.length === 0 ? (
      <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-4">
        {list.map((it) => (
          <button
            key={`${it.source}-${it.id}`}
            onClick={() => pick(it)}
            disabled={adding}
            title={`${it.name} — ${it.kind}`}
            className="group relative aspect-[9/16] overflow-hidden rounded-lg ring-1 ring-border transition hover:ring-2 hover:ring-accent disabled:opacity-60"
          >
            {it.kind === 'image' ? (
              <img src={it.url} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
              <video src={it.url} muted preload="metadata" className="size-full object-cover" />
            )}
            {it.kind === 'video' && (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5">
                <Play className="size-2.5 text-white" />
              </span>
            )}
          </button>
        ))}
      </div>
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {trimTarget ? (
          <TrimView
            item={trimTarget}
            busy={adding}
            onBack={() => setTrimTarget(null)}
            onConfirm={(trimStartSec, trimEndSec) =>
              onAdd({ source: trimTarget.source, itemId: trimTarget.id, trimStartSec, trimEndSec })
            }
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a scene</DialogTitle>
              <DialogDescription>Pick an image or video. Videos can be trimmed next.</DialogDescription>
            </DialogHeader>

            <div className="flex justify-end">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (fs.length) onImport(fs);
                }}
              />
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <HardDriveUpload className="size-4" />} Import
              </Button>
            </div>

            <Tabs defaultValue="local">
              <TabsList>
                <TabsTrigger value="local">Local ({localItems.length})</TabsTrigger>
                <TabsTrigger value="global">Global ({globalItems.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="local">
                <Grid list={localItems} empty="No project assets yet — use Import to add some." />
              </TabsContent>
              <TabsContent value="global">
                <Grid list={globalItems} empty="No global assets yet — add them on the Assets page." />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Step 2 of Add-Scene for videos: choose a trim window (0.5s–60s).
const MAX_WIN = 60;
const MIN_WIN = 0.5;

function TrimView({
  item,
  busy,
  onBack,
  onConfirm
}: {
  item: PickItem;
  busy: boolean;
  onBack: () => void;
  onConfirm: (startSec: number, endSec: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [drag, setDrag] = useState<null | 'start' | 'end' | 'region'>(null);
  const regionAnchor = useRef<{ x: number; start: number; end: number } | null>(null);

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const onMeta = () => {
    const d = round1(videoRef.current?.duration || 0);
    setDuration(d);
    setStart(0);
    setEnd(Math.min(MAX_WIN, d > 0 ? d : 5));
  };

  const pxToSec = (clientX: number) => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - r.left) / r.width) * duration));
  };

  // Drag the handles / selection region with the pointer.
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const t = pxToSec(e.clientX);
      if (drag === 'start') {
        let s = Math.max(0, Math.min(t, end - MIN_WIN));
        if (end - s > MAX_WIN) s = end - MAX_WIN;
        s = round1(s);
        setStart(s);
        if (videoRef.current) videoRef.current.currentTime = s;
      } else if (drag === 'end') {
        let en = Math.min(duration, Math.max(t, start + MIN_WIN));
        if (en - start > MAX_WIN) en = start + MAX_WIN;
        en = round1(en);
        setEnd(en);
        if (videoRef.current) videoRef.current.currentTime = en;
      } else if (drag === 'region' && regionAnchor.current && trackRef.current) {
        const a = regionAnchor.current;
        const deltaSec = ((e.clientX - a.x) / trackRef.current.getBoundingClientRect().width) * duration;
        const winLen = a.end - a.start;
        const ns = round1(Math.max(0, Math.min(duration - winLen, a.start + deltaSec)));
        setStart(ns);
        setEnd(round1(ns + winLen));
      }
    };
    const up = () => {
      setDrag(null);
      regionAnchor.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, start, end, duration]);

  const len = Math.max(0, round1(end - start));
  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (end / duration) * 100 : 100;

  const Handle = ({ side, left }: { side: 'start' | 'end'; left: number }) => (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(side);
      }}
      className="absolute inset-y-0 z-20 flex w-3.5 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded bg-accent shadow"
      style={{ left: `${left}%` }}
      title={side === 'start' ? 'Trim start' : 'Trim end'}
    >
      <span className="h-5 w-0.5 rounded-full bg-white/90" />
    </div>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="line-clamp-2 break-words text-base">Trim “{item.name}”</DialogTitle>
        <DialogDescription>Drag the handles to pick the slice (0.5s–60s).</DialogDescription>
      </DialogHeader>
      <div className="mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-lg border border-border bg-black">
        <video
          ref={videoRef}
          src={item.url}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={onMeta}
          className="size-full object-contain"
        />
      </div>

      {/* Trim bar: video strip with two draggable handles */}
      <div className="select-none px-1.5 pt-1">
        <div ref={trackRef} className="relative h-16 w-full rounded-lg border border-border bg-muted/30">
          {/* clip strip */}
          <div className="absolute inset-0 overflow-hidden rounded-lg">
            <video src={item.url} muted preload="metadata" className="h-full w-full object-cover opacity-50" />
          </div>
          {/* dim outside the selection */}
          <div className="absolute inset-y-0 left-0 rounded-l-lg bg-background/70" style={{ width: `${startPct}%` }} />
          <div className="absolute inset-y-0 right-0 rounded-r-lg bg-background/70" style={{ width: `${100 - endPct}%` }} />
          {/* selection region (drag to move the whole window) */}
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              regionAnchor.current = { x: e.clientX, start, end };
              setDrag('region');
            }}
            className="absolute inset-y-0 z-10 cursor-grab border-y-2 border-accent active:cursor-grabbing"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
          <Handle side="start" left={startPct} />
          <Handle side="end" left={endPct} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Start {start.toFixed(1)}s</span>
          <span className="font-medium text-foreground">Clip {len.toFixed(1)}s</span>
          <span>End {end.toFixed(1)}s</span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" disabled={busy || len < MIN_WIN} onClick={() => onConfirm(start, end)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />} Add scene ({len.toFixed(1)}s)
        </Button>
      </DialogFooter>
    </>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="line-clamp-2 break-words text-base">{item.name}</DialogTitle>
        </DialogHeader>
        <div className="mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-lg border border-border bg-black">
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
