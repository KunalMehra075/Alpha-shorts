import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Captions as CaptionsIcon,
  Clapperboard,
  Download,
  Film,
  Layers,
  Library as LibraryIcon,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Settings2,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TabHeader } from '@/components/TabHeader';
import { TransitionIcon } from '@/components/TransitionIcon';
import { cn, elementUrl, libraryUrl, mediaUrl, relativeTime } from '@/lib/utils';
import {
  useAddElementLayer,
  useAssets,
  useCaptions,
  useDeleteMusic,
  useDeleteRender,
  useElementLibrary,
  useLibrary,
  useMediaLibrary,
  useMusicFromGlobal,
  useMusicFromLibrary,
  useAddTextElement,
  usePlaceElement,
  usePlaceElementFromLibrary,
  usePlaceSound,
  useProjectElements,
  useUploadProjectElement,
  useRemoveElement,
  useRemoveElementLayer,
  useRemovePlacement,
  useRenderVideo,
  useRenders,
  useScenes,
  useSoundLibrary,
  useUpdateElement,
  useUpdatePlacement,
  useUploadLibrary,
  useUploadMusic,
  useUploadSound,
  useVideoSounds
} from '@/lib/queries';
import { useProjectCtx } from '@/layouts/ProjectLayout';
import { placeholderDataUri } from '@/lib/placeholder';
import { formatBytes, formatDuration as fmt } from '@/lib/mockMedia';
import {
  PRESETS,
  TRANSITIONS,
  effectsFor,
  type Transition
} from '@/lib/editorOptions';
import { useEditorStore, useProjectEditor } from '@/lib/editorStore';
import type {
  CaptionSettings,
  ElementAnimation,
  ElementPatch,
  ElementPlacement,
  RenderRecord,
  Scene,
  SoundPlacement,
  VisualType
} from '@/lib/types';

type Clip = {
  index: number;
  spokenLine: string;
  visualType: VisualType;
  thumb: string;
  videoSrc?: string; // set when the selected asset is a project video file
  trimStartSec: number; // where the trimmed segment starts in the source video
  hasAsset: boolean;
  effect: string;
  transition: Transition;
  durationSec: number;
  motion: string;
  zoom: number;
  intensity: number;
  start: number; // cumulative
};

export function VideoEditorPage() {
  const { project, id } = useProjectCtx();
  const navigate = useNavigate();
  const { data: scenesData } = useScenes(id);
  const { data: caps } = useCaptions(id);
  const { data: assets } = useAssets(id);
  const scenes = scenesData ?? [];
  const assetRows = assets?.scenes ?? [];

  const editor = useProjectEditor(id);
  const ensureTimeline = useEditorStore((s) => s.ensureTimeline);
  const applyPreset = useEditorStore((s) => s.applyPreset);
  const setSceneEffect = useEditorStore((s) => s.setSceneEffect);
  const setSceneTransition = useEditorStore((s) => s.setSceneTransition);
  const setSceneDuration = useEditorStore((s) => s.setSceneDuration);
  const patchScene = useEditorStore((s) => s.patchScene);
  const setMusic = useEditorStore((s) => s.setMusic);
  const toggleCaptions = useEditorStore((s) => s.toggleCaptions);

  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (scenes.length) ensureTimeline(id, scenes);
  }, [id, scenes, ensureTimeline]);

  // Assemble the timeline clips (ordered by scene index) with cumulative timing.
  const clips = useMemo<Clip[]>(() => {
    let t = 0;
    return scenes.map((s: Scene, i) => {
      const ts = editor.timeline.scenes[i];
      const asset = assetRows.find((r) => r.sceneNumber === (s.scene ?? i + 1))?.selected ?? null;
      const isVideoFile = !!(asset?.file && asset.kind === 'video');
      const assetThumb =
        asset?.thumbUrl ||
        (asset?.file && asset.kind === 'image'
          ? `/media/${id}/${asset.file}?v=${asset.sizeBytes}`
          : null);
      const videoSrc = isVideoFile ? `/media/${id}/${asset!.file}?v=${asset!.sizeBytes}` : undefined;
      const durationSec = ts?.durationSec ?? Math.max(0.5, s.end - s.start);
      const clip: Clip = {
        index: i,
        spokenLine: s.spokenLine,
        visualType: s.visualType,
        thumb: assetThumb ?? placeholderDataUri(`${id}-scene-${i}`, { ratio: '9:16' }),
        videoSrc,
        trimStartSec: asset?.trimStartSec ?? 0,
        hasAsset: !!asset,
        effect: ts?.effect ?? effectsFor(s.visualType)[0],
        transition: ts?.transition ?? 'Fade',
        durationSec,
        motion: ts?.motion ?? 'cinematic',
        zoom: ts?.zoom ?? 50,
        intensity: ts?.intensity ?? 50,
        start: t
      };
      t += durationSec;
      return clip;
    });
  }, [scenes, editor, assetRows, id]);

  const total = clips.reduce((a, c) => a + c.durationSec, 0);
  const audioTake = project.audio.versions.find((v:any) => v.version === project.audio.currentVersion);
  const music = editor.timeline.music;
  const captionsEnabled = editor.timeline.captionsEnabled;

  const uploadMusic = useUploadMusic(id);
  const deleteMusic = useDeleteMusic(id);
  const musicFromLib = useMusicFromLibrary(id);
  const musicFromGlobal = useMusicFromGlobal(id);
  const { data: libraryData } = useLibrary(id);
  const audioLibrary = (libraryData ?? []).filter((i) => i.kind === 'audio');
  const { data: globalMusicData } = useMediaLibrary('audio');
  const globalMusic = globalMusicData ?? [];
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [musicSearch, setMusicSearch] = useState('');
  const [musicPreviewId, setMusicPreviewId] = useState<string | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement>(null);

  // Sound effects: global library (palette) + per-video placements.
  const toggleSounds = useEditorStore((s) => s.toggleSounds);
  const soundsEnabled = editor.timeline.soundsEnabled ?? true;
  const { data: soundLibData } = useSoundLibrary();
  const soundLib = soundLibData ?? [];
  const { data: placementsData } = useVideoSounds(id);
  const placements = placementsData ?? [];
  const placeSound = usePlaceSound(id);
  const updatePlacement = useUpdatePlacement(id);
  const removePlacement = useRemovePlacement(id);
  const uploadSound = useUploadSound();
  const [soundSearch, setSoundSearch] = useState('');

  // Elements: global library (palette) + per-project placements + lanes.
  const { data: elementLibData } = useElementLibrary();
  const elementLib = elementLibData ?? [];
  const { data: elementsData } = useProjectElements(id);
  const elements = elementsData ?? [];
  const elementLayers = project.elementLayers ?? 2;
  const placeElement = usePlaceElement(id);
  const uploadProjectElement = useUploadProjectElement(id);
  const placeFromLibrary = usePlaceElementFromLibrary(id);
  const addTextElement = useAddTextElement(id);
  const uploadLibrary = useUploadLibrary(id);
  const elementFileRef = useRef<HTMLInputElement>(null);
  const [elDragOver, setElDragOver] = useState(false);
  const elDragDepth = useRef(0);
  // Preview an element/asset in a modal (the small arrow on each card).
  const [previewItem, setPreviewItem] = useState<{ url: string; kind: string; name: string } | null>(null);

  // Drag & drop files onto the Add-elements sheet → add them to THIS project's
  // assets (the Asset Library). They then appear under the "This project" tab to
  // place as elements.
  const onDropToAssets = async (files: File[]) => {
    const media = files.filter(
      (f) => /^(image|video)\//.test(f.type) || /\.(gif|svg|avif|webp|mp4|mov|webm|mkv|m4v)$/i.test(f.name)
    );
    if (!media.length) {
      toast.error("Drop an image or video to add to this project's assets.");
      return;
    }
    let ok = 0;
    for (const f of media) {
      try {
        await uploadLibrary.mutateAsync(f);
        ok++;
      } catch (e: any) {
        toast.error(`${f.name}: ${String(e.message ?? e)}`);
      }
    }
    if (ok) toast.success(`Added ${ok} file${ok > 1 ? 's' : ''} to this project's assets`);
  };
  const updateElement = useUpdateElement(id);
  const removeElement = useRemoveElement(id);
  const addElementLayer = useAddElementLayer(id);
  const removeElementLayer = useRemoveElementLayer(id);

  // Upload project-specific file(s) straight onto the timeline (top lane, t=0).
  const onUploadElementFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const layer = Math.max(0, elementLayers - 1);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadProjectElement.mutateAsync({ file: f, layer, atSec: 0 });
        ok++;
      } catch (e: any) {
        toast.error(`${f.name}: ${String(e.message ?? e)}`);
      }
    }
    if (ok) {
      toast.success(`Added ${ok} element${ok > 1 ? 's' : ''}`);
      setElementSheetOpen(false);
    }
    if (elementFileRef.current) elementFileRef.current.value = '';
  };

  // Turn an existing project Asset Library item into a timeline element.
  const onAddAssetAsElement = (itemId: string) => {
    placeFromLibrary.mutate(
      { itemId, layer: Math.max(0, elementLayers - 1), atSec: 0 },
      {
        onSuccess: () => {
          toast.success('Added to timeline');
          setElementSheetOpen(false);
        },
        onError: (e: any) => toast.error(String(e.message ?? e))
      }
    );
  };

  // Add a text overlay at the playhead, then select it for editing.
  const onAddText = () => {
    addTextElement.mutate(
      { layer: Math.max(0, elementLayers - 1), atSec: Math.round(timeRef.current * 100) / 100 },
      {
        onSuccess: (rec) => {
          setSelectedElementId(rec.id);
          setSelectedSoundId(null);
          setElementSheetOpen(false);
          toast.success('Text added — edit it in the settings panel');
        },
        onError: (e: any) => toast.error(String(e.message ?? e))
      }
    );
  };
  const [elementSheetOpen, setElementSheetOpen] = useState(false);
  const [elementSearch, setElementSearch] = useState('');
  const [audioSheetOpen, setAudioSheetOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const selectedElement = elements.find((e) => e.id === selectedElementId) ?? null;
  // Element and sound selection are mutually exclusive — only one Delete target.
  const selectElement = (eid: string | null) => {
    setSelectedElementId(eid);
    if (eid) setSelectedSoundId(null);
  };
  const selectSound = (sid: string | null) => {
    setSelectedSoundId(sid);
    if (sid) setSelectedElementId(null);
  };
  // Commit a dragged element's new time AND lane (z-index) in one patch, so a
  // simultaneous horizontal+vertical move never races two updates.
  const moveElement = (pid: string, atSec: number, layer: number) => {
    const el = elements.find((e) => e.id === pid);
    if (!el) return;
    const dur = Math.max(0.5, el.endSec - el.startSec);
    updateElement.mutate({
      placementId: pid,
      patch: { startSec: atSec, endSec: atSec + dur, layer }
    });
  };

  // Shared playback clock for the timeline playhead (written by the preview each
  // frame; read imperatively so the page doesn't re-render at 60fps) + seek.
  const timeRef = useRef(0);
  const seekRef = useRef<(s: number) => void>(() => {});
  // Pause the transport imperatively (e.g. when the user grabs the timeline
  // playhead/ruler so scrubbing stops playback instead of playing from there).
  const pauseRef = useRef<() => void>(() => {});
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [tlZoom, setTlZoom] = useState(1); // timeline horizontal zoom multiplier

  // Delete/Backspace removes whichever timeline item is selected — a sound takes
  // priority over an element — unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (selectedSoundId) {
        e.preventDefault();
        removePlacement.mutate(selectedSoundId);
        setSelectedSoundId(null);
      } else if (selectedElementId) {
        e.preventDefault();
        removeElement.mutate(selectedElementId);
        setSelectedElementId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSoundId, selectedElementId]);

  // Real media for the preview player (served from the project).
  const narrationSrc = audioTake ? `/media/${id}/${audioTake.file}` : undefined;
  const musicTrack = project.music?.file ? project.music : null;
  const musicSrc = music.enabled && musicTrack ? `/media/${id}/${musicTrack.file}` : undefined;

  if (!scenes.length) {
    return (
      <div className="animate-fade-in">
        <TabHeader icon={Clapperboard} title="Video Editor" description="Arrange scenes, effects and transitions, then render." status={project.stages.video.status} />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Film className="size-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold">No scenes yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">Generate a script and assign assets first — your timeline builds automatically.</p>
            <Button variant="primary" onClick={() => navigate(`/w/${id}/script`)}>Go to Script Generator</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selClip = clips[selected];

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={Clapperboard}
        title="Video Editor"
        description="Auto-built timeline — tweak effects & transitions, then render."
        status={project.stages.video.status}
        actions={
          <Badge variant="outline" title="UI preview — real render wired later">
            preview
          </Badge>
        }
      />

      {/* Effect presets */}
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <span className="mr-1 text-sm font-medium">Presets</span>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(id, p.name, scenes)}
              title={p.description}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                editor.timeline.preset === p.name
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border hover:bg-muted",
              )}
            >
              {p.name}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {clips.length} scenes · {fmt(total)} · 1080×1920 @ 30fps
          </span>
        </CardContent>
      </Card>

      {/* Top: preview (left) + scene settings (right) */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <EditorPreview
              clips={clips}
              total={total}
              captionsEnabled={captionsEnabled}
              captionSettings={caps?.settings}
              captionLines={caps?.lines ?? []}
              narrationSrc={narrationSrc}
              musicSrc={musicSrc}
              musicVolume={music.volume / 100}
              placements={placements}
              soundsEnabled={soundsEnabled}
              elements={elements}
              selectedElementId={selectedElementId}
              onSelectElement={selectElement}
              onElementMove={(pid, x, y) => updateElement.mutate({ placementId: pid, patch: { x, y } })}
              onElementResize={(pid, size) => updateElement.mutate({ placementId: pid, patch: { size } })}
              onElementTextResize={(pid, fontSize) =>
                updateElement.mutate({ placementId: pid, patch: { textStyle: { fontSize } } })
              }
              projectId={id}
              onScrubToScene={setSelected}
              timeRef={timeRef}
              seekRef={seekRef}
              pauseRef={pauseRef}
              onPlayingChange={setPreviewPlaying}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          {selClip && (
            <SceneSettings
              clip={selClip}
              onEffect={(e) => setSceneEffect(id, selClip.index, e)}
              onTransition={(t) => setSceneTransition(id, selClip.index, t)}
              onDuration={(d) => setSceneDuration(id, selClip.index, d)}
              onMotion={(m) => patchScene(id, selClip.index, { motion: m })}
              onZoom={(z) => patchScene(id, selClip.index, { zoom: z })}
              onIntensity={(v) => patchScene(id, selClip.index, { intensity: v })}
            />
          )}

          {/* Elements */}
          <ElementInspector
            total={total}
            selected={selectedElement}
            onBrowse={() => setElementSheetOpen(true)}
            onAddText={onAddText}
            onChange={(patch) =>
              selectedElement && updateElement.mutate({ placementId: selectedElement.id, patch })
            }
            onRemove={() => {
              if (selectedElement) {
                removeElement.mutate(selectedElement.id);
                setSelectedElementId(null);
              }
            }}
          />

          {/* Audio settings — opens in a side sheet */}
          <button
            type="button"
            onClick={() => setAudioSheetOpen(true)}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-left transition hover:bg-muted"
          >
            <span className="text-sm font-semibold">Audio Settings</span>
            <Settings2 className="size-4 text-muted-foreground" />
          </button>

          <Sheet open={audioSheetOpen} onOpenChange={setAudioSheetOpen}>
            <SheetContent className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Audio Settings</SheetTitle>
              </SheetHeader>
              <div className="grid gap-3 sm:grid-cols-1">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-accent/15">
                  <Music className="size-4 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Narration</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {audioTake
                      ? `${audioTake.voiceName} · ${fmt(audioTake.durationSec)}`
                      : "No narration yet — generate it in the Audio tab."}
                  </p>
                
                </div>
                <Badge variant="accent" className="ml-2">
                  primary
                </Badge>
              </div>

              {/* Captions (beside Narration) */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CaptionsIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Captions</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {caps?.hasTranscript ? `${caps.lines.length} lines` : 'None yet'} ·{' '}
                      <button className="underline hover:text-accent" onClick={() => navigate(`/w/${id}/caption`)}>
                        edit style
                      </button>
                    </p>
                  </div>
                </div>
                <Switch checked={captionsEnabled} onCheckedChange={(v) => toggleCaptions(id, v)} />
              </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Music className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Background music
                    </span>
                  </div>
                  <Switch
                    checked={music.enabled}
                    onCheckedChange={(v) => setMusic(id, { enabled: v })}
                  />
                </div>
                {music.enabled && (
                  <div className="mt-3 grid gap-3">
                    {musicTrack ? (
                      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
                        <Music className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1 truncate text-xs">{musicTrack.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          disabled={deleteMusic.isPending}
                          onClick={async () => {
                            try {
                              await deleteMusic.mutateAsync();
                            } catch (e: any) {
                              toast.error(String(e.message ?? e));
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                          {uploadMusic.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Music className="size-4" />
                          )}
                          Upload track
                          <input
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (!f) return;
                              try {
                                await uploadMusic.mutateAsync(f);
                                toast.success('Music track added');
                              } catch (err: any) {
                                toast.error(String(err.message ?? err));
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setMusicPickerOpen(true)}
                          className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          <LibraryIcon className="size-4" /> Browse music
                        </button>
                      </div>
                    )}
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Volume</span>
                        <span>{music.volume}%</span>
                      </div>
                      <Slider
                        value={music.volume}
                        min={0}
                        max={100}
                        onValueChange={(v) => setMusic(id, { volume: v })}
                      />
                    </div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={music.fadeIn}
                          onCheckedChange={(v) => setMusic(id, { fadeIn: v })}
                        />{" "}
                        Fade in
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={music.fadeOut}
                          onCheckedChange={(v) => setMusic(id, { fadeOut: v })}
                        />{" "}
                        Fade out
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Add Sounds */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LibraryIcon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Sound effects</span>
                  </div>
                  <Switch checked={soundsEnabled} onCheckedChange={(v) => toggleSounds(id, v)} />
                </div>
                {soundsEnabled && (
                  <div className="mt-3 grid gap-2">
                    <div className="flex gap-2">
                      <Input
                        value={soundSearch}
                        onChange={(e) => setSoundSearch(e.target.value)}
                        placeholder="Search sounds…"
                        className="h-8 text-sm"
                      />
                      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 text-sm hover:bg-muted">
                        {uploadSound.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            try {
                              await uploadSound.mutateAsync(f);
                              toast.success('Sound added to library');
                            } catch (err: any) {
                              toast.error(String(err.message ?? err));
                            }
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Drag a sound onto the audio track below the timeline.
                    </p>
                    <div className="grid max-h-[180px] grid-cols-2 gap-2 overflow-y-auto">
                      {soundLib
                        .filter((s) => s.name.toLowerCase().includes(soundSearch.toLowerCase()))
                        .map((s) => (
                          <div
                            key={s.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-sound-id', s.id);
                              e.dataTransfer.effectAllowed = 'copy';
                              // Close the sheet so the sound bar becomes droppable.
                              setTimeout(() => setAudioSheetOpen(false), 0);
                            }}
                            title="Drag onto the audio track"
                            className="flex cursor-grab items-center justify-between gap-1 rounded-md border border-border px-2 py-1.5 text-xs hover:border-accent/50 active:cursor-grabbing"
                          >
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            <span className="shrink-0 text-muted-foreground">{s.durationSec}s</span>
                          </div>
                        ))}
                      {soundLib.length === 0 && (
                        <p className="col-span-full py-3 text-center text-xs text-muted-foreground">
                          No sounds yet — add one with +.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Unified timeline (scenes + element lanes + sound track) */}
      <Timeline
        clips={clips}
        total={total}
        selectedScene={selected}
        onSelectScene={setSelected}
        elements={elements}
        elementLayers={elementLayers}
        selectedElementId={selectedElementId}
        onSelectElement={selectElement}
        onPlaceElement={(elementId, layer, atSec) => placeElement.mutate({ elementId, layer, atSec })}
        onPlaceFromLibrary={(itemId, layer, atSec) => placeFromLibrary.mutate({ itemId, layer, atSec })}
        onMoveElement={moveElement}
        onAddElementLayer={() => addElementLayer.mutate()}
        onRemoveElementLayer={(layer) => removeElementLayer.mutate(layer)}
        onBrowseElements={() => setElementSheetOpen(true)}
        placements={placements}
        soundsEnabled={soundsEnabled}
        selectedSoundId={selectedSoundId}
        onSelectSound={selectSound}
        onPlaceSound={(soundId, atSec) => placeSound.mutate({ soundId, atSec })}
        onMoveSound={(placementId, atSec) => updatePlacement.mutate({ placementId, patch: { atSec } })}
        onSoundVolume={(placementId, volume) => updatePlacement.mutate({ placementId, patch: { volume } })}
        onRemoveSound={(placementId) => removePlacement.mutate(placementId)}
        timeRef={timeRef}
        seekRef={seekRef}
        pauseRef={pauseRef}
        playing={previewPlaying}
        zoom={tlZoom}
        onZoom={setTlZoom}
      />

      {/* Render */}
      <RenderSection
        sceneCount={clips.length}
        totalDuration={total}
        projectId={id}
        buildPayload={() => ({
          scenes: clips.map((c) => ({
            index: c.index,
            effect: c.effect,
            transition: c.transition,
            durationSec: c.durationSec,
            motion: c.motion,
            zoom: c.zoom,
            intensity: c.intensity
          })),
          captionsEnabled,
          preset: editor.timeline.preset,
          music: {
            enabled: music.enabled && !!musicTrack,
            volume: music.volume,
            fadeIn: music.fadeIn,
            fadeOut: music.fadeOut
          },
          soundsEnabled
        })}
        onProceed={() => navigate(`/w/${id}/upload`)}
      />

      <Dialog
        open={musicPickerOpen}
        onOpenChange={(o) => {
          setMusicPickerOpen(o);
          if (!o) setMusicPreviewId(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose background music</DialogTitle>
          </DialogHeader>
          {(() => {
            const q = musicSearch.trim().toLowerCase();
            const match = (n: string) => !q || n.toLowerCase().includes(q);
            const ws = audioLibrary.filter((a) => match(a.name));
            const gl = globalMusic.filter((a) => match(a.name));
            const useTrack = async (fn: Promise<unknown>) => {
              try {
                await fn;
                if (!music.enabled) setMusic(id, { enabled: true });
                toast.success('Background music set');
                setMusicPickerOpen(false);
              } catch (e: any) {
                toast.error(String(e.message ?? e));
              }
            };
            const busy = musicFromLib.isPending || musicFromGlobal.isPending;
            const togglePreview = (uid: string, src: string) => {
              const el = musicPreviewRef.current;
              if (!el) return;
              if (musicPreviewId === uid) {
                el.pause();
                setMusicPreviewId(null);
                return;
              }
              el.src = src;
              setMusicPreviewId(uid);
              el.play().catch(() => {});
            };
            const Card = ({ uid, name, src, onUse }: { uid: string; name: string; src: string; onUse: () => void }) => (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
                <button
                  onClick={() => togglePreview(uid, src)}
                  title="Preview"
                  className="flex min-w-0 items-start gap-1.5 text-left"
                >
                  {musicPreviewId === uid ? (
                    <Pause className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  ) : (
                    <Play className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  )}
                  <span className="line-clamp-2 text-xs font-medium leading-snug" title={name}>
                    {name}
                  </span>
                </button>
                <Button variant="primary" size="sm" className="h-7 w-full text-xs" disabled={busy} onClick={onUse}>
                  Use
                </Button>
              </div>
            );
            const Section = ({
              title,
              items,
              empty,
              kind
            }: {
              title: string;
              items: { id: string; name: string; file: string }[];
              empty: string;
              kind: 'ws' | 'gl';
            }) => (
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {title} ({items.length})
                </p>
                {items.length === 0 ? (
                  <p className="rounded-lg bg-muted/40 p-3 text-center text-xs text-muted-foreground">{empty}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((a) => (
                      <Card
                        key={`${kind}-${a.id}`}
                        uid={`${kind}-${a.id}`}
                        name={a.name}
                        src={kind === 'ws' ? `/media/${id}/${a.file}` : libraryUrl(a.file)}
                        onUse={() =>
                          useTrack(kind === 'ws' ? musicFromLib.mutateAsync(a.id) : musicFromGlobal.mutateAsync(a.id))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
            return (
              <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-1 ">
                <Input
                  value={musicSearch}
                  onChange={(e) => setMusicSearch(e.target.value)}
                  placeholder="Search music in both libraries…"
                  className="h-9 my-2"
                />
                <Section
                  title="Project"
                  items={ws}
                  kind="ws"
                  empty={
                    audioLibrary.length === 0
                      ? 'No audio in this project yet — add some in the Assets step.'
                      : 'No matches.'
                  }
                />
                <Section
                  title="Global library"
                  items={gl}
                  kind="gl"
                  empty={globalMusic.length === 0 ? 'No global music yet — add some on the Audios page.' : 'No matches.'}
                />
                <audio ref={musicPreviewRef} onEnded={() => setMusicPreviewId(null)} className="hidden" />
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Elements side sheet */}
      <Sheet open={elementSheetOpen} onOpenChange={setElementSheetOpen}>
        <SheetContent
          onDragEnter={(e) => {
            e.preventDefault();
            elDragDepth.current += 1;
            setElDragOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            elDragDepth.current = Math.max(0, elDragDepth.current - 1);
            if (elDragDepth.current === 0) setElDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            elDragDepth.current = 0;
            setElDragOver(false);
            onDropToAssets(Array.from(e.dataTransfer.files));
          }}
        >
          {elDragOver && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-background/85 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-center">
                <Upload className="size-8 text-accent" />
                <p className="text-sm font-semibold">Drop to add to this project's assets</p>
                <p className="text-xs text-muted-foreground">Images &amp; videos</p>
              </div>
            </div>
          )}
          <SheetHeader>
            <SheetTitle>Add elements</SheetTitle>
            <SheetDescription>
              Drag &amp; drop files here to add them to this project's assets, upload straight onto the
              timeline, or pick an asset/global element. Manage the global library on the Elements page.
            </SheetDescription>
          </SheetHeader>

          {/* Upload a project-specific file straight onto the timeline. */}
          <input
            ref={elementFileRef}
            type="file"
            accept="image/*,.gif,video/*"
            multiple
            className="hidden"
            onChange={(e) => onUploadElementFiles(e.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={uploadProjectElement.isPending}
            onClick={() => elementFileRef.current?.click()}
          >
            {uploadProjectElement.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Upload to this project
          </Button>

          {/* Add a text overlay (pink accent) at the playhead. */}
          <Button
            size="sm"
            className="w-full border border-pink-400/50 bg-pink-500/15 text-pink-700 hover:bg-pink-500/25 dark:text-pink-200"
            disabled={addTextElement.isPending}
            onClick={onAddText}
          >
            {addTextElement.isPending ? <Loader2 className="size-4 animate-spin" /> : <Type className="size-4" />}
            Add text
          </Button>

          <Input
            value={elementSearch}
            onChange={(e) => setElementSearch(e.target.value)}
            placeholder="Search elements…"
            className="h-9"
          />

          {(() => {
            const q = elementSearch.trim().toLowerCase();
            const projectAssets = (libraryData ?? []).filter(
              (it) => it.kind !== 'audio' && (!q || it.name.toLowerCase().includes(q))
            );
            const globalList = elementLib.filter((el) => !q || el.name.toLowerCase().includes(q));
            return (
              <Tabs defaultValue="project">
                <TabsList className="w-full">
                  <TabsTrigger value="project" className="flex-1">
                    This project ({projectAssets.length})
                  </TabsTrigger>
                  <TabsTrigger value="global" className="flex-1">
                    Global ({globalList.length})
                  </TabsTrigger>
                </TabsList>

                {/* This project's assets → click to add as a timeline element. */}
                <TabsContent value="project">
                  {projectAssets.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {(libraryData ?? []).some((it) => it.kind !== 'audio')
                        ? 'No matches.'
                        : "No images or videos in this project's assets yet — add some in the Assets step."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 overflow-y-auto p-0.5">
                      {projectAssets.map((it) => (
                        <button
                          key={it.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-library-item-id', it.id);
                            e.dataTransfer.effectAllowed = 'copy';
                            // Close the sheet so the lanes underneath become a drop target.
                            setTimeout(() => setElementSheetOpen(false), 0);
                          }}
                          onClick={() => onAddAssetAsElement(it.id)}
                          disabled={placeFromLibrary.isPending}
                          title={`${it.name} — drag onto a lane or click to add`}
                          className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-1.5 hover:border-accent/60 disabled:opacity-60"
                        >
                          {it.kind === 'video' ? (
                            <video src={mediaUrl(id, it.file)} muted preload="metadata" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <img src={mediaUrl(id, it.file)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                          )}
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[8px] uppercase text-white">
                            {it.kind}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            draggable={false}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewItem({ url: mediaUrl(id, it.file), kind: it.kind, name: it.name });
                            }}
                            title="Preview"
                            className="absolute bottom-1 right-1 hidden rounded bg-black/65 p-1 text-white hover:bg-black/85 group-hover:block"
                          >
                            <ArrowUpRight className="size-3" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Global element library (drag onto a lane or click to add). */}
                <TabsContent value="global">
                  {globalList.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {elementLib.length === 0
                        ? 'No elements yet — upload some on the Elements page.'
                        : 'No matches.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 overflow-y-auto p-0.5">
                      {globalList.map((el) => (
                        <button
                          key={el.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-element-id', el.id);
                            e.dataTransfer.effectAllowed = 'copy';
                            // Close the sheet so the lanes underneath become a drop
                            // target — deferred so the native drag fully starts first.
                            setTimeout(() => setElementSheetOpen(false), 0);
                          }}
                          onClick={() => {
                            placeElement.mutate({ elementId: el.id, layer: Math.max(0, elementLayers - 1), atSec: 0 });
                            setElementSheetOpen(false);
                          }}
                          title={`${el.name} — drag onto a lane or click to add`}
                          className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-1.5 hover:border-accent/60"
                        >
                          {el.kind === 'video' && !el.thumb ? (
                            <video src={elementUrl(el.file)} muted preload="metadata" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <img src={elementUrl(el.thumb || el.file)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                          )}
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[8px] uppercase text-white">
                            {el.kind}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            draggable={false}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewItem({ url: elementUrl(el.file), kind: el.kind, name: el.name });
                            }}
                            title="Preview"
                            className="absolute bottom-1 right-1 hidden rounded bg-black/65 p-1 text-white hover:bg-black/85 group-hover:block"
                          >
                            <ArrowUpRight className="size-3" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Preview an element/asset (the small arrow on each card in the sheet). */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{previewItem?.name || 'Preview'}</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-black/90">
              {previewItem.kind === 'video' ? (
                <video
                  src={previewItem.url}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="max-h-[70vh] max-w-full object-contain"
                />
              ) : (
                <img src={previewItem.url} alt={previewItem.name} className="max-h-[70vh] max-w-full object-contain" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Scene settings panel ──────────────────────────────────────────────────────
function SceneSettings({
  clip,
  onEffect,
  onTransition,
  onDuration,
  onMotion,
  onZoom,
  onIntensity
}: {
  clip: Clip;
  onEffect: (e: string) => void;
  onTransition: (t: Transition) => void;
  onDuration: (d: number) => void;
  onMotion: (m: string) => void;
  onZoom: (z: number) => void;
  onIntensity: (v: number) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="accent" className="whitespace-nowrap">Scene {clip.index + 1}</Badge>
          <p className="line-clamp-1 text-sm text-muted-foreground">{clip.spokenLine}</p>
        </div>

        {/* Top row: three sliders */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Duration</Label>
              <span className="text-xs text-muted-foreground">{clip.durationSec.toFixed(1)}s</span>
            </div>
            <Slider value={clip.durationSec} min={1} max={15} step={0.5} onValueChange={onDuration} />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Zoom level</Label>
              <span className="text-xs text-muted-foreground">{Math.round(clip.zoom)}%</span>
            </div>
            <Slider value={clip.zoom} min={0} max={100} onValueChange={onZoom} />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Animation intensity</Label>
              <span className="text-xs text-muted-foreground">{Math.round(clip.intensity)}%</span>
            </div>
            <Slider value={clip.intensity} min={0} max={100} onValueChange={onIntensity} />
          </div>
        </div>

        {/* Bottom row: three dropdowns */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>Effect</Label>
            <Select value={clip.effect} onChange={(e) => onEffect(e.target.value)}>
              {effectsFor(clip.visualType).map((eff) => (
                <option key={eff} value={eff}>{eff}</option>
              ))}
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Motion style</Label>
            <Select value={clip.motion} onChange={(e) => onMotion(e.target.value)}>
              <option value="subtle">Subtle</option>
              <option value="cinematic">Cinematic</option>
              <option value="energetic">Energetic</option>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Transition (in)</Label>
            <Select value={clip.transition} onChange={(e) => onTransition(e.target.value as Transition)}>
              {TRANSITIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Live preview (mock player) ────────────────────────────────────────────────
type MotionOpts = { zoom: number; intensity: number; motion: string };

// Dashboard effect label → engine effect token (mirror of server video.ts maps),
// split by asset kind so the preview resolves the same token the render does.
const IMG_EFFECT_TOKENS: Record<string, string> = {
  'zoom in': 'kenburns-in',
  'zoom out': 'kenburns-out',
  'pan left': 'pan-left',
  'pan right': 'pan-right',
  'ken burns': 'kenburns-in',
  parallax: 'parallax',
  'slow rotate': 'parallax',
  'depth effect': 'parallax'
};
const VID_EFFECT_TOKENS: Record<string, string> = {
  'slow zoom': 'zoom-in',
  'crop and scale': 'zoom-in',
  'speed adjustment': 'zoom-in',
  'motion blur': 'drift',
  'dynamic focus': 'zoom-out',
  'zoom in': 'zoom-in',
  'zoom out': 'zoom-out'
};
function effectToken(effect: string, kind: 'video' | 'image'): string {
  const k = (effect || '').toLowerCase();
  return kind === 'video' ? VID_EFFECT_TOKENS[k] ?? 'zoom-in' : IMG_EFFECT_TOKENS[k] ?? 'kenburns-in';
}

// Canonical scene scale/pan — must stay identical to remotion/lib/sceneMotion.js
// so the preview matches the render. zoom 50→1×, 100→2×, 0→½×.
function effectTransform(
  effect: string,
  p: number,
  kind: 'video' | 'image',
  opts: MotionOpts = { zoom: 50, intensity: 50, motion: 'cinematic' }
): { transform: string; filter?: string } {
  const token = effectToken(effect, kind);
  const base = Math.pow(2, (opts.zoom - 50) / 50);
  const mm = opts.motion === 'subtle' ? 0.6 : opts.motion === 'energetic' ? 1.6 : 1.0;
  const zoomAmt = 0.12 * mm;
  const pan = 4 * (opts.intensity / 50) * mm;
  const edge = 1 + (Math.abs(pan) * 1.5) / 100;

  let scale = base * edge;
  let x = 0;
  let y = 0;
  switch (token) {
    case 'kenburns-out':
      scale = base * edge * (1 + zoomAmt * (1 - p));
      x = pan * 0.3 * (2 * p - 1);
      break;
    case 'zoom-out':
      scale = base * edge * (1 + zoomAmt * (1 - p));
      break;
    case 'pan-left':
      scale = base * edge;
      x = pan * (1 - 2 * p);
      break;
    case 'pan-right':
      scale = base * edge;
      x = -pan * (1 - 2 * p);
      break;
    case 'parallax':
      scale = base * edge * (1 + zoomAmt * 0.6 * p);
      y = pan * 0.6 * (1 - 2 * p);
      break;
    case 'drift':
      scale = base * edge * (1 + zoomAmt * 0.3);
      x = pan * 0.5 * (2 * p - 1);
      break;
    case 'kenburns-in':
      scale = base * edge * (1 + zoomAmt * p);
      x = pan * 0.3 * (1 - 2 * p);
      break;
    case 'zoom-in':
    default:
      scale = base * edge * (1 + zoomAmt * p);
      break;
  }
  return { transform: `translate(${x}%, ${y}%) scale(${scale})` };
}

// Dashboard transition label → engine token (mirror of server video.ts).
const TRANSITION_TOKENS: Record<string, string> = {
  fade: 'fade',
  crossfade: 'fade',
  'blur transition': 'fade',
  zoom: 'zoom',
  'scale transition': 'zoom',
  'slide left': 'slide-left',
  push: 'slide-left',
  'slide right': 'slide-right'
};

// Entrance transition for the PREVIEW — mirrors remotion/components/SceneTransition.
// `t` is 0→1 progress over the transition window; frameW is the preview width so a
// slide travels exactly one frame, matching the render's full-width slide.
function transitionStyle(transition: string, t: number, frameW: number): { opacity: number; transform: string } {
  const tok = TRANSITION_TOKENS[(transition || '').toLowerCase()] ?? 'fade';
  switch (tok) {
    case 'slide-left':
      return { opacity: 1, transform: `translateX(${(1 - t) * frameW}px)` };
    case 'slide-right':
      return { opacity: 1, transform: `translateX(${-(1 - t) * frameW}px)` };
    case 'zoom':
      return { opacity: t, transform: `scale(${1.15 + (1 - 1.15) * t})` };
    case 'fade':
    default:
      return { opacity: t, transform: '' };
  }
}

// Element entrance/idle animation for the PREVIEW, in seconds-since-start.
// Mirrors remotion/components/Elements.jsx (which works in frames) so the
// preview matches the render.
function elementPreviewAnim(animation: string, localSec: number): { extra: string; opacity: number } {
  const lt = Math.max(0, localSec);
  const IN = 0.4;
  switch (animation) {
    case 'fade':
      return { extra: '', opacity: Math.min(1, lt / IN) };
    case 'pop': {
      const x = Math.min(1, lt / 0.45);
      const c1 = 1.70158;
      const c3 = c1 + 1; // easeOutBack ≈ the spring's overshoot
      const e = 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
      return { extra: ` scale(${0.6 + 0.4 * e})`, opacity: 1 };
    }
    case 'pulse':
      return { extra: ` scale(${1 + 0.06 * Math.sin(lt * Math.PI * 2 * 1.5)})`, opacity: 1 };
    case 'slide': {
      const x = Math.min(1, lt / IN);
      return { extra: ` translateX(${-8 * (1 - x)}%)`, opacity: x };
    }
    default:
      return { extra: '', opacity: 1 };
  }
}

// Split a caption line into evenly-timed words — mirrors the render's caption
// layer + the engine overlay so the preview shows the same karaoke highlight.
function captionWords(line: { start: number; end: number; text: string }) {
  const toks = (line.text || '').trim().split(/\s+/).filter(Boolean);
  const dur = Math.max(0.2, line.end - line.start);
  const per = dur / Math.max(1, toks.length);
  return toks.map((w, i) => ({ word: w, start: line.start + per * i, end: line.start + per * (i + 1) }));
}

function EditorPreview({
  clips,
  total,
  captionsEnabled,
  captionSettings,
  captionLines,
  narrationSrc,
  musicSrc,
  musicVolume = 0.3,
  placements = [],
  soundsEnabled = true,
  elements = [],
  selectedElementId = null,
  onSelectElement,
  onElementMove,
  onElementResize,
  onElementTextResize,
  projectId,
  onScrubToScene,
  timeRef,
  seekRef,
  pauseRef,
  onPlayingChange
}: {
  clips: Clip[];
  total: number;
  captionsEnabled: boolean;
  captionSettings?: CaptionSettings;
  captionLines: { id: number; start: number; end: number; text: string }[];
  narrationSrc?: string;
  musicSrc?: string;
  musicVolume?: number;
  placements?: { id: string; file: string; atSec: number; volume: number }[];
  soundsEnabled?: boolean;
  elements?: ElementPlacement[];
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onElementMove?: (id: string, x: number, y: number) => void;
  onElementResize?: (id: string, size: number) => void;
  onElementTextResize?: (id: string, fontSize: number) => void;
  projectId: string;
  onScrubToScene: (i: number) => void;
  timeRef?: React.MutableRefObject<number>;
  seekRef?: React.MutableRefObject<(s: number) => void>;
  pauseRef?: React.MutableRefObject<() => void>;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const narrRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const sfxRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const lastT = useRef(0);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const elVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Imperative-playback refs: the rAF loop is the authoritative clock (`tRef`) and
  // paints the smooth per-frame visuals (scene transform, scrubber) directly to
  // the DOM, so playback no longer forces a React re-render on every frame. React
  // `time` state is updated at a throttled cadence (≈15 Hz) for the structural
  // bits it owns (which scene base is mounted, caption line, visible elements).
  const tRef = useRef(0);
  const lastStateUpdate = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const timeTextRef = useRef<HTMLSpanElement>(null);
  const renderedActiveIdx = useRef(-1);
  // Live mirrors of props/state read inside the rAF loop (avoids stale closures
  // while keeping the loop's effect deps minimal).
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const totalRef = useRef(total);
  totalRef.current = total;
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  const soundsEnabledRef = useRef(soundsEnabled);
  soundsEnabledRef.current = soundsEnabled;

  // While paused/scrubbing, keep the sound-firing baseline at the playhead so a
  // seek doesn't refire past sounds. Firing during playback happens in the rAF
  // loop (see `fireSounds`).
  useEffect(() => {
    if (!playing) lastT.current = time;
  }, [time, playing]);

  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(300);
  const frameWRef = useRef(frameW);
  frameWRef.current = frameW;
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setFrameW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The active clip at timeline position `t` (falls back to the first clip).
  const clipAt = (t: number) =>
    clipsRef.current.find((c) => t >= c.start && t < c.start + c.durationSec) ?? clipsRef.current[0];

  // Imperatively paint the smooth, per-frame visuals (scene Ken-Burns transform +
  // entrance transition + scrubber + time readout) straight to the DOM so the
  // motion is decoupled from React's throttled re-renders.
  const paint = (t: number, active: Clip | undefined) => {
    // Only drive the scene transform when the mounted base matches the active
    // clip. On the single frame of a cut (before React mounts the new base) we
    // skip it — the new element's initial style covers that frame.
    if (active && active.index === renderedActiveIdx.current) {
      const p = Math.min(1, (t - active.start) / Math.max(0.001, active.durationSec));
      const kind: 'video' | 'image' = active.visualType === 'Video' ? 'video' : 'image';
      const fx = effectTransform(active.effect, p, kind, {
        zoom: active.zoom,
        intensity: active.intensity,
        motion: active.motion
      });
      const transP = Math.min(1, (t - active.start) / 0.5);
      const tr = transitionStyle(active.transition, transP, frameWRef.current);
      const node = active.videoSrc ? videoElRef.current : imgElRef.current;
      if (node) {
        node.style.transform = `${tr.transform} ${fx.transform}`.trim();
        node.style.opacity = String(tr.opacity);
        if (fx.filter) node.style.filter = fx.filter;
        else node.style.removeProperty('filter');
      }
    }
    const total = totalRef.current;
    if (barRef.current) barRef.current.style.width = `${(t / Math.max(0.001, total)) * 100}%`;
    if (timeTextRef.current) timeTextRef.current.textContent = `${fmt(t)} / ${fmt(total)}`;
    if (timeRef) timeRef.current = t;
  };

  // Fire each placed sound when the playhead crosses its start (called per frame).
  const fireSounds = (t: number) => {
    const prev = lastT.current;
    lastT.current = t;
    if (t < prev || !soundsEnabledRef.current) return; // wrapped / disabled
    for (const pl of placementsRef.current) {
      if (prev <= pl.atSec && pl.atSec < t) {
        const el = sfxRefs.current[pl.id];
        if (el) {
          try {
            el.currentTime = 0;
            el.volume = Math.max(0, Math.min(1, pl.volume ?? 1));
            el.play().catch(() => {});
          } catch {
            /* ignore */
          }
        }
      }
    }
  };

  // Keep in-range element <video>s playing on their own media clock during
  // playback (paused/scrub handling lives in a separate effect below).
  const syncElementVideos = (t: number) => {
    for (const el of elementsRef.current) {
      if (el.kind !== 'video') continue;
      if (t < el.startSec || t >= el.endSec) continue;
      const v = elVideoRefs.current[el.id];
      if (!v) continue;
      v.muted = !!el.muted;
      if (v.paused) {
        const desired = Math.max(0, t - el.startSec);
        if (Math.abs(v.currentTime - desired) > 0.3) {
          try {
            v.currentTime = desired;
          } catch {
            /* ignore */
          }
        }
        v.play().catch(() => {});
      }
    }
  };

  // Point the audio elements at a given timeline position (music loops).
  const syncAudio = (t: number) => {
    const n = narrRef.current;
    const mu = musicRef.current;
    if (n && isFinite(n.duration)) n.currentTime = Math.min(t, n.duration);
    else if (n) n.currentTime = t;
    if (mu) mu.currentTime = mu.duration ? t % mu.duration : 0;
  };

  // Seek the transport (used by the scrub bar AND the timeline playhead).
  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(total, t));
    tRef.current = clamped;
    lastT.current = clamped; // don't refire past sounds after a seek
    setTime(clamped);
    syncAudio(clamped);
    paint(clamped, clipAt(clamped));
    const c = clips.find((x) => clamped >= x.start && clamped < x.start + x.durationSec);
    if (c) onScrubToScene(clips.indexOf(c));
  };

  // Expose the clock to the timeline: mirror time into a ref (read each frame by
  // the playhead) and publish seek + playing.
  useEffect(() => {
    if (timeRef) timeRef.current = time;
  }, [time, timeRef]);
  useEffect(() => {
    if (seekRef) seekRef.current = seek;
    if (pauseRef) pauseRef.current = () => setPlaying(false);
  });
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  // Start/stop audio with the transport.
  useEffect(() => {
    const n = narrRef.current;
    const mu = musicRef.current;
    if (playing) {
      syncAudio(time);
      n?.play().catch(() => {});
      mu?.play().catch(() => {});
    } else {
      n?.pause();
      mu?.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Keep music volume in sync with the slider.
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = Math.max(0, Math.min(1, musicVolume));
  }, [musicVolume]);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    lastStateUpdate.current = last.current;
    tRef.current = time; // resume from the current playhead
    lastT.current = time; // don't refire already-passed sounds
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      let t = tRef.current + dt;
      if (t >= totalRef.current) {
        // Loop: rewind AND replay the audio (it may have ended/paused, in which
        // case rewinding alone won't resume it).
        const n = narrRef.current;
        const mu = musicRef.current;
        if (n) {
          n.currentTime = 0;
          n.play().catch(() => {});
        }
        if (mu) {
          mu.currentTime = 0;
          mu.play().catch(() => {});
        }
        lastT.current = 0; // so placed sound effects fire again next loop
        t = 0;
      }
      tRef.current = t;
      const active = clipAt(t);
      fireSounds(t);
      syncElementVideos(t);
      paint(t, active); // smooth 60 fps visuals, no React render

      // Update React state at ≈15 Hz for the structural bits it owns — but
      // immediately at a scene cut so the correct scene base mounts without delay.
      if ((active?.index ?? -1) !== renderedActiveIdx.current || now - lastStateUpdate.current > 66) {
        lastStateUpdate.current = now;
        setTime(t);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Which clip is active at `time` (throttled). The rAF loop paints the live
  // transform every frame; these memoized values are the initial/fallback style
  // for the mounted scene base and avoid recompute on unrelated re-renders.
  const active = useMemo(
    () => clips.find((c) => time >= c.start && time < c.start + c.durationSec) ?? clips[0],
    [clips, time]
  );
  // Mirror which scene base is mounted so the rAF loop knows when a cut needs an
  // immediate React update (see the throttle check in the tick).
  renderedActiveIdx.current = active?.index ?? -1;
  const p = active ? Math.min(1, (time - active.start) / Math.max(0.001, active.durationSec)) : 0;
  const activeKind: 'video' | 'image' = active?.visualType === 'Video' ? 'video' : 'image';
  const fx = useMemo(
    () =>
      active
        ? effectTransform(active.effect, p, activeKind, {
            zoom: active.zoom,
            intensity: active.intensity,
            motion: active.motion
          })
        : { transform: 'none', filter: undefined as string | undefined },
    [active, p, activeKind]
  );
  // Entrance transition — mirrors the render (fade / zoom / slide) over a 0.5s
  // window. Combine the transition transform (outer) with the scene's Ken Burns
  // transform (inner), the same nesting the render uses.
  const transP = active ? Math.min(1, (time - active.start) / 0.5) : 1;
  const tr = useMemo(
    () => (active ? transitionStyle(active.transition, transP, frameW) : { opacity: 1, transform: '' }),
    [active, transP, frameW]
  );
  const fxTransform = useMemo(() => `${tr.transform} ${fx.transform}`.trim(), [tr, fx]);
  const fadeT = tr.opacity;

  // Scrub the preview <video> to match the playhead — only while PAUSED.
  // During playback we let the element run on its own media clock (see the
  // play/pause effect below); forcing currentTime every frame would trigger a
  // seek per frame and make the preview jitter, even though the render is fine.
  useEffect(() => {
    if (playing) return;
    const v = videoElRef.current;
    if (!v || !active?.videoSrc) return;
    const desired = (active.trimStartSec ?? 0) + Math.max(0, time - active.start);
    if (Math.abs(v.currentTime - desired) > 0.05) {
      try {
        v.currentTime = desired;
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, playing, active?.index, active?.videoSrc, active?.trimStartSec, active?.start]);

  // Start/stop the preview <video> with the transport. On play (or when a new
  // video clip becomes active mid-playback) we seek once to the correct trim
  // offset, then let it play freely — self-correcting at every clip boundary.
  useEffect(() => {
    const v = videoElRef.current;
    if (!v || !active?.videoSrc) return;
    if (playing) {
      const desired = (active.trimStartSec ?? 0) + Math.max(0, time - active.start);
      if (Math.abs(v.currentTime - desired) > 0.15) {
        try {
          v.currentTime = desired;
        } catch {
          /* ignore */
        }
      }
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, active?.index, active?.videoSrc]);

  const line = captionLines.find((l) => time >= l.start && time < l.end);
  const scale = frameW / 1080;

  // Drag a selected element on the preview to set its x/y (center %).
  const [elDrag, setElDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!elDrag) return;
    const move = (e: PointerEvent) => {
      const el = frameRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      setElDrag((d) => (d ? { ...d, x, y } : d));
    };
    const up = () => {
      setElDrag((d) => {
        if (d) onElementMove?.(d.id, Math.round(d.x * 10) / 10, Math.round(d.y * 10) / 10);
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elDrag?.id]);

  // Resize a selected element via its bottom-right handle. For media (aspect
  // locked) we derive width % from the pointer's horizontal distance to center.
  // For TEXT the handle scales the font size proportionally (start font × drag
  // ratio), since the box width is the wrap width, not the visual size.
  const [elResize, setElResize] = useState<
    { id: string; size: number; font: number; startFont: number; startHalfW: number; isText: boolean } | null
  >(null);
  useEffect(() => {
    if (!elResize) return;
    const move = (e: PointerEvent) => {
      const frame = frameRef.current;
      const el = elements.find((x) => x.id === elResize.id);
      if (!frame || !el) return;
      const r = frame.getBoundingClientRect();
      const centerX = r.left + (el.x / 100) * r.width;
      const halfW = Math.abs(e.clientX - centerX);
      setElResize((d) => {
        if (!d) return d;
        if (d.isText) {
          const font = Math.max(8, Math.min(400, d.startFont * (halfW / Math.max(1, d.startHalfW))));
          return { ...d, font };
        }
        return { ...d, size: Math.max(3, Math.min(200, (halfW / r.width) * 200)) };
      });
    };
    const up = () => {
      setElResize((d) => {
        if (d) {
          if (d.isText) onElementTextResize?.(d.id, Math.round(d.font));
          else onElementResize?.(d.id, Math.round(d.size * 10) / 10);
        }
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elResize?.id]);

  // Memoized so its identity is stable between unrelated re-renders (it used to be
  // rebuilt every frame, which re-fired the element-video effect 60×/sec).
  const visibleElements = useMemo(
    () =>
      elements
        .filter((el) => time >= el.startSec && time < el.endSec)
        .slice()
        .sort((a, b) => a.layer - b.layer),
    [elements, time]
  );

  // While PAUSED/scrubbing, pause + seek in-range element <video>s to the
  // playhead. During playback the rAF loop drives them (see `syncElementVideos`).
  useEffect(() => {
    if (playing) return;
    for (const el of visibleElements) {
      if (el.kind !== 'video') continue;
      const v = elVideoRefs.current[el.id];
      if (!v) continue;
      v.muted = !!el.muted;
      if (!v.paused) v.pause();
      const desired = Math.max(0, time - el.startSec);
      if (Math.abs(v.currentTime - desired) > 0.05) {
        try {
          v.currentTime = desired;
        } catch {
          /* ignore */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, playing, visibleElements]);

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-xl border-2 border-accent bg-black"
      >
        <div className="absolute inset-0 overflow-hidden bg-black">
          {active &&
            (active.videoSrc ? (
              <video
                key={`v-${active.index}`}
                ref={videoElRef}
                src={active.videoSrc}
                muted
                playsInline
                preload="auto"
                className="size-full object-cover"
                style={{ transform: fxTransform, filter: fx.filter, opacity: fadeT }}
              />
            ) : (
              <img
                key={active.index}
                ref={imgElRef}
                src={active.thumb}
                alt=""
                className="size-full object-cover"
                style={{ transform: fxTransform, filter: fx.filter, opacity: fadeT }}
              />
            ))}
          {/* Element overlays (below captions). Selected one is draggable. */}
          {visibleElements.map((el) => {
            const isText = el.kind === 'text';
            const resizing = elResize && elResize.id === el.id;
            const pos = elDrag && elDrag.id === el.id ? elDrag : { x: el.x, y: el.y };
            // Media: live width %. Text: width is the wrap width (unchanged by resize).
            const liveSize = resizing && !isText ? elResize!.size : el.size;
            const liveFont = resizing && isText ? elResize!.font : el.textStyle?.fontSize ?? 72;
            const selected = el.id === selectedElementId;
            const busy = (elDrag && elDrag.id === el.id) || resizing;
            const src = el.file ? `/media/${projectId}/${el.file}` : '';
            const accent = isText ? '#EC4899' : 'hsl(var(--accent))';
            // No entrance animation while actively dragging/resizing this element,
            // so positioning stays steady; otherwise mirror the render.
            const anim = busy
              ? { extra: '', opacity: 1 }
              : elementPreviewAnim(el.animation, time - el.startSec);
            return (
              <div
                key={el.id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectElement?.(el.id);
                  setElDrag({ id: el.id, x: pos.x, y: pos.y });
                }}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: `${liveSize}%`,
                  transform: `translate(-50%, -50%) rotate(${el.rotation || 0}deg)${anim.extra}`,
                  opacity: anim.opacity,
                  cursor: 'move',
                  outline: selected ? `2px solid ${accent}` : 'none',
                  outlineOffset: 2
                }}
              >
                {isText ? (
                  <div
                    className="pointer-events-none w-full"
                    style={{
                      fontFamily: `'${el.textStyle?.fontFamily || 'Inter'}', sans-serif`,
                      fontSize: liveFont * scale,
                      fontWeight: el.textStyle?.fontWeight || 800,
                      color: el.textStyle?.color || '#FFFFFF',
                      WebkitTextStroke:
                        (el.textStyle?.strokeWidth || 0) > 0
                          ? `${(el.textStyle?.strokeWidth || 0) * scale}px ${el.textStyle?.strokeColor || '#000000'}`
                          : undefined,
                      paintOrder: 'stroke fill',
                      textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                      textTransform: el.textStyle?.uppercase ? 'uppercase' : 'none',
                      textAlign: el.textStyle?.align || 'center',
                      lineHeight: 1.1,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {el.text || ' '}
                  </div>
                ) : el.kind === 'video' ? (
                  <video
                    ref={(n) => {
                      elVideoRefs.current[el.id] = n;
                    }}
                    src={src}
                    loop
                    playsInline
                    muted={el.muted}
                    className="pointer-events-none block w-full"
                  />
                ) : (
                  <img src={src} alt="" className="pointer-events-none block w-full" />
                )}
                {/* Bottom-right resize handle (aspect locked) — only on the selected element. */}
                {selected && (
                  <div
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectElement?.(el.id);
                      const frame = frameRef.current;
                      let startHalfW = 1;
                      if (frame) {
                        const r = frame.getBoundingClientRect();
                        const centerX = r.left + (el.x / 100) * r.width;
                        startHalfW = Math.max(1, Math.abs(e.clientX - centerX));
                      }
                      const startFont = el.textStyle?.fontSize ?? 72;
                      setElResize({ id: el.id, size: liveSize, font: startFont, startFont, startHalfW, isText });
                    }}
                    title={isText ? 'Drag to scale text' : 'Drag to resize'}
                    style={{
                      position: 'absolute',
                      right: -6,
                      bottom: -6,
                      width: 12,
                      height: 12,
                      borderRadius: 9999,
                      background: accent,
                      border: '2px solid white',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                      cursor: 'nwse-resize'
                    }}
                  />
                )}
              </div>
            );
          })}
          {captionsEnabled && line && captionSettings && (() => {
            const words = captionWords(line);
            const activeIdx = words.findIndex((w) => time >= w.start && time < w.end);
            const elapsed = time - line.start;
            const remain = line.end - time;
            let popScale = 1;
            if (elapsed < 0.12) popScale = 0.55 + (0.45 * Math.min(1, elapsed / 0.12));
            else if (remain < 0.09) popScale = 0.9 + 0.1 * Math.min(1, remain / 0.09);
            return (
              <div
                className="absolute inset-x-0 px-3 text-center"
                style={{ top: `${8 + 0.84 * captionSettings.positionY}%`, transform: 'translateY(-50%)' }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    fontFamily: `'${captionSettings.fontFamily}', sans-serif`,
                    fontSize: captionSettings.fontSize * scale,
                    fontWeight: captionSettings.fontWeight,
                    WebkitTextStroke:
                      captionSettings.strokeWidth > 0
                        ? `${captionSettings.strokeWidth * scale}px ${captionSettings.strokeColor}`
                        : undefined,
                    paintOrder: 'stroke fill',
                    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    textTransform: captionSettings.uppercase ? 'uppercase' : 'none',
                    lineHeight: 1.1,
                    transform: `scale(${popScale})`,
                    transformOrigin: 'center'
                  }}
                >
                  {words.map((w, i) => (
                    <span
                      key={i}
                      style={{ color: i === activeIdx ? captionSettings.highlightColor : captionSettings.textColor }}
                    >
                      {w.word}
                      {i < words.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </span>
              </div>
            );
          })()}
          {active && (
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
              Scene {active.index + 1} · {active.effect}
            </span>
          )}
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-3">
        <Button variant="primary" size="icon" className="size-10" onClick={() => setPlaying((v) => !v)}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div
          className="relative h-2 flex-1 cursor-pointer overflow-hidden rounded-full bg-foreground/10"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            seek(frac * total);
          }}
        >
          <div ref={barRef} className="h-full rounded-full bg-accent" style={{ width: `${(time / Math.max(0.001, total)) * 100}%` }} />
        </div>
        <span ref={timeTextRef} className="text-[11px] tabular-nums text-muted-foreground">
          {fmt(time)} / {fmt(total)}
        </span>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Preview plays narration{musicSrc ? ' + music' : ''} with simplified visuals — the final
        render (Remotion) is exact.
      </p>

      {/* Real audio elements driven by the transport (hidden). */}
      {narrationSrc && <audio ref={narrRef} src={narrationSrc} preload="auto" className="hidden" />}
      {musicSrc && <audio ref={musicRef} src={musicSrc} loop preload="auto" className="hidden" />}
      {soundsEnabled &&
        placements.map((p) => (
          <audio
            key={p.id}
            ref={(el) => {
              sfxRefs.current[p.id] = el;
            }}
            src={`/media/${projectId}/${p.file}`}
            preload="auto"
            className="hidden"
          />
        ))}
    </div>
  );
}

// ── Render section (real Remotion render via background job) ───────────────────
type RenderPayload = {
  scenes: {
    index: number;
    effect: string;
    transition: string;
    durationSec: number;
    motion: string;
    zoom: number;
    intensity: number;
  }[];
  captionsEnabled: boolean;
  preset: string | null;
  music: { enabled: boolean; volume: number; fadeIn: boolean; fadeOut: boolean };
  soundsEnabled: boolean;
};

function RenderSection({
  sceneCount,
  totalDuration,
  projectId,
  buildPayload,
  onProceed
}: {
  sceneCount: number;
  totalDuration: number;
  projectId: string;
  buildPayload: () => RenderPayload;
  onProceed: () => void;
}) {
  const { data: renders = [] } = useRenders(projectId);
  const render = useRenderVideo(projectId);
  const del = useDeleteRender(projectId);

  const active = renders.find((r) => r.status === 'rendering');
  const hasCompleted = renders.some((r) => r.status === 'completed');
  const busy = !!active || render.isPending;

  const createVideo = async () => {
    if (busy) return;
    try {
      await render.mutateAsync(buildPayload());
      toast.success('Render started');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const phaseLabel =
    active?.phase === 'bundling' ? 'Bundling project…' : `Rendering ${active?.progress ?? 0}%`;

  return (
    <Card className="mt-5">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Render</h3>
            <p className="text-xs text-muted-foreground">
              {sceneCount} scenes · {fmt(totalDuration)} · 1080×1920 @ 30fps
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={createVideo} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Rendering…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Create Video
              </>
            )}
          </Button>
        </div>

        {active && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${Math.max(3, active.progress)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{phaseLabel}</span>
              <span>Rendering in the background — you can keep editing.</span>
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Generated Videos</h4>
            {hasCompleted && (
              <Button variant="secondary" size="sm" onClick={onProceed}>
                Proceed to Upload <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
          {renders.length === 0 ? (
            <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">
              Rendered videos will appear here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {renders.map((r) => (
                <RenderCard
                  key={r.id}
                  r={r}
                  projectId={projectId}
                  onDelete={() => del.mutate(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RenderCard({
  r,
  projectId,
  onDelete
}: {
  r: RenderRecord;
  projectId: string;
  onDelete: () => void;
}) {
  const src = r.file ? `/media/${projectId}/${r.file}?v=${r.sizeBytes}` : null;

  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-[9/16] bg-black">
        {r.status === 'completed' && src ? (
          <video src={src} controls playsInline className="size-full object-contain" />
        ) : r.status === 'failed' ? (
          <div className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center">
            <Trash2 className="size-5 text-destructive" />
            <p className="text-[11px] text-destructive">Render failed</p>
            {r.error && <p className="line-clamp-3 text-[10px] text-muted-foreground">{r.error}</p>}
          </div>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2">
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="text-[11px] text-muted-foreground">
              {r.phase === 'bundling' ? 'Bundling…' : `Rendering ${r.progress}%`}
            </p>
          </div>
        )}
        {r.status === 'completed' && (
          <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
            {fmt(r.durationSec)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.resolution}</p>
          <p className="text-[11px] text-muted-foreground">
            {r.status === 'completed' ? formatBytes(r.sizeBytes) : r.status} · {relativeTime(r.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          {r.status === 'completed' && src && (
            <a
              href={src}
              download
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-accent"
              title="Download"
            >
              <Download className="size-4" />
            </a>
          )}
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Unified timeline (scenes + element lanes + sound track) ───────────────────
const TL_RULER_H = 22;
const TL_ELEM_LANE_H = 30;
const TL_SCENE_H = 64;
const TL_SOUND_H = 40;
const TL_TRACK_GAP = 8;
const TL_GUTTER_W = 36;

function pickTickStep(pxPerSec: number): number {
  for (const s of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (s * pxPerSec >= 48) return s;
  return 1200;
}

function Timeline({
  clips,
  total,
  selectedScene,
  onSelectScene,
  elements,
  elementLayers,
  selectedElementId,
  onSelectElement,
  onPlaceElement,
  onPlaceFromLibrary,
  onMoveElement,
  onAddElementLayer,
  onRemoveElementLayer,
  onBrowseElements,
  placements,
  soundsEnabled,
  selectedSoundId,
  onSelectSound,
  onPlaceSound,
  onMoveSound,
  onSoundVolume,
  onRemoveSound,
  timeRef,
  seekRef,
  pauseRef,
  playing,
  zoom,
  onZoom
}: {
  clips: Clip[];
  total: number;
  selectedScene: number;
  onSelectScene: (i: number) => void;
  elements: ElementPlacement[];
  elementLayers: number;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onPlaceElement: (elementId: string, layer: number, atSec: number) => void;
  onPlaceFromLibrary: (itemId: string, layer: number, atSec: number) => void;
  onMoveElement: (placementId: string, atSec: number, layer: number) => void;
  onAddElementLayer: () => void;
  onRemoveElementLayer: (layer: number) => void;
  onBrowseElements: () => void;
  placements: SoundPlacement[];
  soundsEnabled: boolean;
  selectedSoundId: string | null;
  onSelectSound: (id: string | null) => void;
  onPlaceSound: (soundId: string, atSec: number) => void;
  onMoveSound: (placementId: string, atSec: number) => void;
  onSoundVolume: (placementId: string, volume: number) => void;
  onRemoveSound: (placementId: string) => void;
  timeRef: React.MutableRefObject<number>;
  seekRef: React.MutableRefObject<(s: number) => void>;
  pauseRef: React.MutableRefObject<() => void>;
  playing: boolean;
  zoom: number;
  onZoom: (z: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [laneW, setLaneW] = useState(640);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((ents) => setLaneW(ents[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Small horizontal inset so the t=0 tick label + playhead head aren't clipped
  // at the left edge.
  const PAD_X = 8;
  const fitPps = total > 0 ? Math.max(1, laneW - PAD_X * 2) / total : 1;
  const pxPerSec = Math.max(fitPps, fitPps * zoom); // zoom 1 = fit, >1 = zoom in
  const contentW = Math.max(laneW, total * pxPerSec + PAD_X * 2);
  const secToX = (s: number) => PAD_X + s * pxPerSec; // position (includes inset)
  const secToW = (s: number) => s * pxPerSec; // width (no inset)
  const xToSec = (clientX: number) => {
    const el = contentRef.current;
    if (!el || total <= 0) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(total, (clientX - r.left - PAD_X) / pxPerSec));
  };

  // Imperative playhead — follows the shared clock without re-rendering, and
  // auto-scrolls to stay in view during playback.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const x = secToX(timeRef?.current ?? 0);
      const ph = playheadRef.current;
      if (ph) ph.style.transform = `translateX(${x}px)`;
      const sc = scrollRef.current;
      if (sc && playing) {
        if (x < sc.scrollLeft + 24 || x > sc.scrollLeft + sc.clientWidth - 24) {
          sc.scrollLeft = Math.max(0, x - sc.clientWidth / 2);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerSec, playing]);

  const seek = (clientX: number) => seekRef?.current?.(xToSec(clientX));

  // Playhead / ruler scrubbing.
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: PointerEvent) => seek(e.clientX);
    const up = () => setScrubbing(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, pxPerSec]);

  // Block time-drag (elements + sounds) with click-vs-drag detection. Elements
  // can also be dragged vertically between lanes to change their z-index (layer).
  const [drag, setDrag] = useState<{ kind: 'element' | 'sound'; id: string } | null>(null);
  const [dragAt, setDragAt] = useState(0);
  const [dragLayer, setDragLayer] = useState<number | null>(null);
  const movedRef = useRef(false);
  const selElRef = useRef(selectedElementId);
  selElRef.current = selectedElementId;
  const lanesRef = useRef<HTMLDivElement>(null);

  // Which element lane (layer) sits under a given screen Y. Lanes are stacked
  // top→bottom in `laneOrder` (front-most first); each row is TL_ELEM_LANE_H tall
  // with a 4px gap. Clamped so dragging past the edges snaps to the end lanes.
  const layerAtY = (clientY: number): number => {
    const box = lanesRef.current;
    if (!box) return 0;
    const r = box.getBoundingClientRect();
    const idx = Math.floor((clientY - r.top) / (TL_ELEM_LANE_H + 4));
    const clamped = Math.max(0, Math.min(elementLayers - 1, idx));
    return elementLayers - 1 - clamped; // laneOrder[clamped]
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      movedRef.current = true;
      setDragAt(xToSec(e.clientX));
      if (drag.kind === 'element') setDragLayer(layerAtY(e.clientY));
    };
    const up = (e: PointerEvent) => {
      const at = xToSec(e.clientX);
      if (drag.kind === 'element') {
        if (movedRef.current) {
          onMoveElement(drag.id, at, layerAtY(e.clientY));
          onSelectElement(drag.id);
        } else {
          onSelectElement(selElRef.current === drag.id ? null : drag.id);
        }
      } else {
        if (movedRef.current) onMoveSound(drag.id, at);
        onSelectSound(drag.id);
      }
      setDrag(null);
      setDragLayer(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, pxPerSec, elementLayers]);

  const step = pickTickStep(pxPerSec);
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(total); s += step) ticks.push(s);
  const grid = ticks.map((s) => (
    <div key={s} className="pointer-events-none absolute bottom-0 top-0 w-px bg-border/25" style={{ left: secToX(s) }} />
  ));
  const laneOrder = Array.from({ length: elementLayers }, (_, i) => elementLayers - 1 - i);
  const elemTrackH = elementLayers * TL_ELEM_LANE_H + (elementLayers - 1) * 4;
  const selSound = placements.find((p) => p.id === selectedSoundId) ?? null;

  return (
    <Card className="mt-5">
      <CardContent className="p-5">
        {/* Header: title + element controls + zoom */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold">Timeline</h3>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7" onClick={onBrowseElements}>
              <Shapes className="size-3.5" /> Add element
            </Button>
            <Button variant="ghost" size="sm" className="h-7" onClick={onAddElementLayer} title="Add an element layer">
              <Layers className="size-3.5" /> Layer
            </Button>
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <ZoomOut className="size-4 text-muted-foreground" />
              <input
                type="range"
                min={1}
                max={10}
                step={0.1}
                value={zoom}
                onChange={(e) => onZoom(Number(e.target.value))}
                title="Zoom timeline"
                className="h-1.5 w-28 cursor-pointer accent-accent"
              />
              <ZoomIn className="size-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Left icon gutter (aligned to track heights) */}
          <div className="shrink-0" style={{ width: TL_GUTTER_W }}>
            <div style={{ height: TL_RULER_H }} />
            <div
              style={{ height: elemTrackH, marginTop: TL_TRACK_GAP }}
              className="flex items-center justify-center rounded-md bg-sky-500/10 text-sky-400"
              title="Elements"
            >
              <Shapes className="size-4" />
            </div>
            <div
              style={{ height: TL_SCENE_H, marginTop: TL_TRACK_GAP }}
              className="flex items-center justify-center rounded-md bg-accent/10 text-accent"
              title="Scenes"
            >
              <Clapperboard className="size-4" />
            </div>
            <div
              style={{ height: TL_SOUND_H, marginTop: TL_TRACK_GAP }}
              className="flex items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400"
              title="Sound effects"
            >
              <Music className="size-4" />
            </div>
          </div>

          {/* Scrollable lane area (shared time axis) */}
          <div
            ref={scrollRef}
            className="relative flex-1 overflow-x-auto overflow-y-hidden pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30"
          >
            <div ref={contentRef} className="relative" style={{ width: contentW }}>
              {/* Ruler (click/drag to scrub) */}
              <div
                className="relative cursor-pointer"
                style={{ height: TL_RULER_H }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  pauseRef?.current?.(); // grabbing the ruler stops playback at the playhead
                  setScrubbing(true);
                  seek(e.clientX);
                }}
              >
                {ticks.map((s) => (
                  <div
                    key={s}
                    className="absolute top-0 flex flex-col items-center"
                    style={{ left: secToX(s), transform: 'translateX(-50%)' }}
                  >
                    <div className="h-1.5 w-px bg-border" />
                    <span className="mt-0.5 text-[9px] leading-none tabular-nums text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>

              {/* Element lanes */}
              <div ref={lanesRef} className="flex flex-col gap-1" style={{ marginTop: TL_TRACK_GAP }}>
                {laneOrder.map((layer) => {
                  // While an element is being dragged, show it in the lane under the
                  // pointer (its target z-index) instead of its original lane.
                  const draggingId = drag?.kind === 'element' ? drag.id : null;
                  const dragged = draggingId ? elements.find((e) => e.id === draggingId) ?? null : null;
                  let laneEls = elements.filter((e) => e.layer === layer && e.id !== draggingId);
                  if (dragged && dragLayer === layer) laneEls = [...laneEls, dragged];
                  const empty = laneEls.length === 0;
                  return (
                    <div
                      key={layer}
                      onDragOver={(e) => {
                        const t = e.dataTransfer.types;
                        if (
                          t.includes('application/x-element-id') ||
                          t.includes('application/x-library-item-id')
                        )
                          e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const eid = e.dataTransfer.getData('application/x-element-id');
                        if (eid) {
                          onPlaceElement(eid, layer, xToSec(e.clientX));
                          return;
                        }
                        const lid = e.dataTransfer.getData('application/x-library-item-id');
                        if (lid) onPlaceFromLibrary(lid, layer, xToSec(e.clientX));
                      }}
                      className="relative overflow-hidden rounded-md border border-dashed border-border/60 bg-muted/20"
                      style={{ height: TL_ELEM_LANE_H }}
                    >
                      {grid}
                      <span className="pointer-events-none absolute left-1 top-0.5 z-10 text-[8px] font-medium text-muted-foreground">
                        L{layer + 1}
                      </span>
                      {empty && elementLayers > 1 && (
                        <button
                          onClick={() => onRemoveElementLayer(layer)}
                          title="Remove this empty layer"
                          className="absolute right-1 top-0.5 z-10 rounded text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                      {laneEls.map((el) => {
                        const start = drag?.kind === 'element' && drag.id === el.id ? dragAt : el.startSec;
                        const dur = Math.max(0.3, el.endSec - el.startSec);
                        return (
                          <div
                            key={el.id}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              movedRef.current = false;
                              setDrag({ kind: 'element', id: el.id });
                              setDragAt(el.startSec);
                              setDragLayer(el.layer);
                            }}
                            title={`${el.name} · ${start.toFixed(1)}–${(start + dur).toFixed(1)}s · L${el.layer + 1}`}
                            style={{ left: secToX(start), width: Math.max(10, secToW(dur)) }}
                            className={cn(
                              'absolute bottom-0.5 top-0.5 z-[5] flex cursor-grab items-center gap-1 overflow-hidden rounded border px-1 text-[9px] active:cursor-grabbing',
                              el.kind === 'text'
                                ? selectedElementId === el.id
                                  ? 'border-pink-400 bg-pink-500/30 ring-1 ring-pink-400'
                                  : 'border-pink-500/40 bg-pink-500/15'
                                : selectedElementId === el.id
                                  ? 'border-sky-400 bg-sky-500/30 ring-1 ring-sky-400'
                                  : 'border-sky-500/40 bg-sky-500/15'
                            )}
                          >
                            {el.kind === 'text' ? (
                              <>
                                <Type className="size-2.5 shrink-0 text-pink-600 dark:text-pink-300" />
                                <span className="truncate text-pink-800 dark:text-pink-50">
                                  {el.text || el.name}
                                </span>
                              </>
                            ) : (
                              <>
                                <Shapes className="size-2.5 shrink-0 text-sky-600 dark:text-sky-300" />
                                <span className="truncate text-sky-800 dark:text-sky-50">{el.name}</span>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Scenes track (proportional, gray outline → red when selected) */}
              <div
                className="relative overflow-hidden rounded-md border border-border bg-muted/20"
                style={{ height: TL_SCENE_H, marginTop: TL_TRACK_GAP }}
              >
                {clips.map((c, i) => {
                  const left = secToX(c.start);
                  const w = Math.max(18, secToW(c.durationSec));
                  return (
                    <button
                      key={c.index}
                      onClick={() => onSelectScene(i)}
                      title={`Scene ${c.index + 1} · ${c.effect} · ${c.durationSec.toFixed(1)}s`}
                      style={{ left, width: w }}
                      className={cn(
                        'group absolute bottom-1 top-1 overflow-hidden rounded-md border-2 text-left transition',
                        selectedScene === i
                          ? 'z-10 border-accent ring-1 ring-accent'
                          : 'border-border/70 hover:border-border'
                      )}
                    >
                      {c.videoSrc ? (
                        <video src={c.videoSrc} muted preload="metadata" className="absolute inset-0 size-full object-cover opacity-70" />
                      ) : (
                        <img src={c.thumb} alt="" className="absolute inset-0 size-full object-cover opacity-70" />
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[9px] font-bold text-white">{c.index + 1}</span>
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-1 pb-0.5 pt-3 text-[8px] text-white">
                        <span className="truncate">{c.spokenLine || c.effect}</span>
                        <span className="shrink-0">{c.durationSec.toFixed(1)}s</span>
                      </div>
                    </button>
                  );
                })}
                {/* Transition icons at scene boundaries */}
                {clips.slice(1).map((c, idx) => {
                  const i = idx + 1;
                  return (
                    <button
                      key={`t-${c.index}`}
                      onClick={() => onSelectScene(i)}
                      title={`Transition: ${c.transition}`}
                      style={{ left: secToX(c.start), top: '50%', transform: 'translate(-50%, -50%)' }}
                      className="absolute z-20 flex size-6 items-center justify-center rounded-full border border-amber-500/70 bg-card text-amber-500 hover:bg-amber-500/10"
                    >
                      <TransitionIcon name={c.transition} className="size-3.5" />
                    </button>
                  );
                })}
              </div>

              {/* Sound track */}
              <div
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-sound-id')) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sid = e.dataTransfer.getData('application/x-sound-id');
                  if (sid) onPlaceSound(sid, xToSec(e.clientX));
                }}
                className={cn(
                  'relative overflow-hidden rounded-md border border-dashed border-border/60 bg-muted/20',
                  !soundsEnabled && 'opacity-50'
                )}
                style={{ height: TL_SOUND_H, marginTop: TL_TRACK_GAP }}
              >
                {grid}
                {placements.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                    Drag a sound here
                  </div>
                )}
                {placements.map((p) => {
                  const at = drag?.kind === 'sound' && drag.id === p.id ? dragAt : p.atSec;
                  const w = Math.max(10, secToW(Math.max(0.3, p.durationSec)));
                  return (
                    <div
                      key={p.id}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        movedRef.current = false;
                        setDrag({ kind: 'sound', id: p.id });
                        setDragAt(p.atSec);
                      }}
                      title={`${p.name} @ ${at.toFixed(1)}s`}
                      style={{ left: secToX(at), width: w }}
                      className={cn(
                        'absolute bottom-1 top-1 z-[5] flex cursor-grab items-center gap-1 overflow-hidden rounded border px-1 text-[9px] active:cursor-grabbing',
                        selectedSoundId === p.id
                          ? 'border-emerald-400 bg-emerald-500/30 ring-1 ring-emerald-400'
                          : 'border-emerald-500/40 bg-emerald-500/15'
                      )}
                    >
                      <Music className="size-2.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                      <span className="truncate text-emerald-800 dark:text-emerald-50">{p.name}</span>
                    </div>
                  );
                })}
              </div>

              {/* Playhead (spans all tracks; draggable handle) */}
              <div ref={playheadRef} className="pointer-events-none absolute left-0 top-0 z-30 h-full w-px bg-accent">
                <div
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pauseRef?.current?.(); // grabbing the playhead stops playback at that position
                    setScrubbing(true);
                  }}
                  className="pointer-events-auto absolute -left-[7px] top-0 size-3.5 cursor-ew-resize rounded-full border-2 border-accent bg-background"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Selected sound inspector */}
        {selSound && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
            <Music className="size-4 shrink-0 text-emerald-400" />
            <span className="truncate font-medium">{selSound.name}</span>
            <span className="shrink-0 text-muted-foreground">@ {selSound.atSec.toFixed(1)}s</span>
            <div className="ml-2 flex items-center gap-2">
              <span className="text-muted-foreground">Vol</span>
              <Slider
                value={Math.round((selSound.volume ?? 1) * 100)}
                min={0}
                max={100}
                onValueChange={(v) => onSoundVolume(selSound.id, v / 100)}
                className="w-28"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7 text-destructive"
              onClick={() => {
                onRemoveSound(selSound.id);
                onSelectSound(null);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Selected-element inspector (right panel) ───────────────────────────────────
// Module-level so they aren't redefined each render (an inline component would
// remount its subtree on every keystroke, dropping focus mid-edit).
function parseNum(v: string, fallback: number) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// Two of these sit side-by-side in a single row (heading + control each), used
// for the compact Size/Rotate and Animation/Audio pairs.
function HalfRow({ first, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 px-3 py-1.5',
        !first && 'border-t border-border/60'
      )}
    >
      {children}
    </div>
  );
}

function InlineSetting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Three controls side-by-side in one row (used for the text style triples).
function ThirdRow({ first, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('grid grid-cols-3 gap-2 px-3 py-1.5', !first && 'border-t border-border/60')}>
      {children}
    </div>
  );
}

// Four controls side-by-side in one row (the most compact text style rows).
function QuadRow({ first, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('grid grid-cols-4 gap-1.5 px-3 py-1.5', !first && 'border-t border-border/60')}>
      {children}
    </div>
  );
}

// A compact stacked field — tiny label above the control — so three fit per row.
function StackField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// A compact, full-width color swatch (click to open the native picker). Sized to
// fit a narrow one-quarter column.
function ColorMini({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={value.toUpperCase()}
      className="h-8 w-full cursor-pointer rounded-md border border-input bg-background p-0.5"
    />
  );
}

// Compact numeric field with an inline label; commits on blur / Enter so typing
// is smooth (no per-keystroke mutation) and the cursor never jumps.
function NumField({
  label,
  value,
  onCommit,
  step = 1,
  suffix,
  disabled
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(Math.round(value * 10) / 10);
  const commit = () => {
    if (draft !== null) {
      onCommit(parseNum(draft, value));
      setDraft(null);
    }
  };
  return (
    <label className={cn('flex items-center gap-2 text-sm', disabled && 'opacity-50')}>
      {label && <span className="w-11 shrink-0 text-xs text-muted-foreground">{label}</span>}
      <input
        type="number"
        step={step}
        disabled={disabled}
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix && <span className="w-3 shrink-0 text-xs text-muted-foreground">{suffix}</span>}
    </label>
  );
}

// Fonts available for text elements (mirrors the Caption Maker's list).
const TEXT_FONTS = ['Inter', 'Arial', 'Impact', 'Montserrat', 'Poppins', 'Bebas Neue', 'Noto Sans Devanagari'];

function ElementInspector({
  total,
  selected,
  onBrowse,
  onAddText,
  onChange,
  onRemove
}: {
  total: number;
  selected: ElementPlacement | null;
  onBrowse: () => void;
  onAddText: () => void;
  onChange: (patch: ElementPatch) => void;
  onRemove: () => void;
}) {
  const wholeVideo = !!selected && selected.startSec <= 0.05 && selected.endSec >= total - 0.05;
  const isImage = selected?.kind === 'image';
  const isText = selected?.kind === 'text';
  const ts = selected?.textStyle;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Element settings</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddText}
              className="border-pink-400/50 bg-pink-500/10 text-pink-700 hover:bg-pink-500/20 dark:text-pink-200"
            >
              <Type className="size-4" /> Add text
            </Button>
            <Button variant="outline" size="sm" onClick={onBrowse}>
              <Plus className="size-4" /> Add element
            </Button>
          </div>
        </div>

        {!selected ? (
          <p className="rounded-lg bg-muted/40 p-3 text-center text-xs text-muted-foreground">
            Select an element on a lane to edit its position, size, timing, and animation.
          </p>
        ) : (
          // key by id so in-progress field drafts reset cleanly when the
          // selection changes.
          <div key={selected.id} className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5">
              <span className="truncate text-sm font-medium" title={selected.name}>
                {selected.name}
              </span>
              <button
                onClick={onRemove}
                title="Remove element (or press Delete)"
                className="shrink-0 rounded-md p-1 text-destructive transition hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            {/* Media (image/gif/video) transform + timing. */}
            {!isText && (
              <>
            <ThirdRow first>
              <StackField label="X">
                <NumField label="" value={selected.x} suffix="%" onCommit={(v) => onChange({ x: v })} />
              </StackField>
              <StackField label="Y">
                <NumField label="" value={selected.y} suffix="%" onCommit={(v) => onChange({ y: v })} />
              </StackField>
              <StackField label="Rotate">
                <NumField label="" value={selected.rotation} suffix="°" onCommit={(v) => onChange({ rotation: v })} />
              </StackField>
            </ThirdRow>

            {/* Duration Start · End · Width */}
            <ThirdRow>
              <StackField label="Start">
                <NumField
                  label=""
                  value={selected.startSec}
                  step={0.1}
                  suffix="s"
                  disabled={isImage && wholeVideo}
                  onCommit={(v) => onChange({ startSec: Math.max(0, v) })}
                />
              </StackField>
              <StackField label="End">
                <NumField
                  label=""
                  value={selected.endSec}
                  step={0.1}
                  suffix="s"
                  disabled={isImage && wholeVideo}
                  onCommit={(v) => onChange({ endSec: v })}
                />
              </StackField>
              <StackField label="Size">
                <NumField label="" value={selected.size} suffix="%" onCommit={(v) => onChange({ size: v })} />
              </StackField>
            </ThirdRow>

            {/* "Full length" only makes sense for static images — videos/gifs
                already default to their own native duration. */}
            {isImage && (
              <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Full length
                </span>
                <Switch
                  checked={wholeVideo}
                  onCheckedChange={(on) =>
                    on
                      ? onChange({ startSec: 0, endSec: Math.max(0.5, total) })
                      : onChange({ endSec: Math.min(selected.startSec + 3, total) })
                  }
                />
              </div>
            )}

            <HalfRow>
              <InlineSetting label="Animation">
                <Select
                  value={selected.animation}
                  onChange={(e) => onChange({ animation: e.target.value as ElementAnimation })}
                  className="h-8 w-full"
                >
                  <option value="none">None</option>
                  <option value="fade">Fade in</option>
                  <option value="pop">Pop in</option>
                  <option value="pulse">Pulse</option>
                  <option value="slide">Slide in</option>
                </Select>
              </InlineSetting>
              {selected.kind === 'video' && (
                <InlineSetting label="Audio">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={!selected.muted} onCheckedChange={(on) => onChange({ muted: !on })} />
                    <span className="text-xs text-muted-foreground">{selected.muted ? 'Muted' : 'Plays sound'}</span>
                  </label>
                </InlineSetting>
              )}
            </HalfRow>
              </>
            )}

            {/* Text element — ultra-compact 4-per-row (pink accent). */}
            {isText && (
              <>
                {/* X · Y · Rotate · Align */}
                <QuadRow first>
                  <StackField label="X">
                    <NumField label="" value={selected.x} suffix="%" onCommit={(v) => onChange({ x: v })} />
                  </StackField>
                  <StackField label="Y">
                    <NumField label="" value={selected.y} suffix="%" onCommit={(v) => onChange({ y: v })} />
                  </StackField>
                  <StackField label="Rotate">
                    <NumField label="" value={selected.rotation} suffix="°" onCommit={(v) => onChange({ rotation: v })} />
                  </StackField>
                  <StackField label="Align">
                    <Select
                      value={ts?.align ?? 'center'}
                      onChange={(e) => onChange({ textStyle: { align: e.target.value as 'left' | 'center' | 'right' } })}
                      className="h-8 w-full min-w-0"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </Select>
                  </StackField>
                </QuadRow>

                {/* Start · End · Size · Width */}
                <QuadRow>
                  <StackField label="Start">
                    <NumField
                      label=""
                      value={selected.startSec}
                      step={0.1}
                      suffix="s"
                      onCommit={(v) => onChange({ startSec: Math.max(0, v) })}
                    />
                  </StackField>
                  <StackField label="End">
                    <NumField label="" value={selected.endSec} step={0.1} suffix="s" onCommit={(v) => onChange({ endSec: v })} />
                  </StackField>
                  <StackField label="Size">
                    <NumField
                      label=""
                      value={ts?.fontSize ?? 72}
                      suffix="px"
                      onCommit={(v) => onChange({ textStyle: { fontSize: Math.max(8, v) } })}
                    />
                  </StackField>
                  <StackField label="Width">
                    <NumField label="" value={selected.size} suffix="%" onCommit={(v) => onChange({ size: v })} />
                  </StackField>
                </QuadRow>

                {/* Color · Stroke · Stroke w · Animation */}
                <QuadRow>
                  <StackField label="Color">
                    <ColorMini value={ts?.color ?? '#FFFFFF'} onChange={(v) => onChange({ textStyle: { color: v } })} />
                  </StackField>
                  <StackField label="Stroke">
                    <ColorMini
                      value={ts?.strokeColor ?? '#000000'}
                      onChange={(v) => onChange({ textStyle: { strokeColor: v } })}
                    />
                  </StackField>
                  <StackField label="Stroke w">
                    <NumField
                      label=""
                      value={ts?.strokeWidth ?? 0}
                      suffix="px"
                      onCommit={(v) => onChange({ textStyle: { strokeWidth: Math.max(0, v) } })}
                    />
                  </StackField>
                  <StackField label="Anim">
                    <Select
                      value={selected.animation}
                      onChange={(e) => onChange({ animation: e.target.value as ElementAnimation })}
                      className="h-8 w-full min-w-0"
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade</option>
                      <option value="pop">Pop</option>
                      <option value="pulse">Pulse</option>
                      <option value="slide">Slide</option>
                    </Select>
                  </StackField>
                </QuadRow>

                {/* Text · Font · Weight */}
                <div className="grid grid-cols-[1.5fr_1fr_0.8fr] gap-2 border-t border-border/60 px-3 py-1.5">
                  <StackField label="Text">
                    <textarea
                      value={selected.text ?? ''}
                      onChange={(e) => onChange({ text: e.target.value })}
                      rows={1}
                      placeholder="Your text"
                      className="block h-8 w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-sm leading-tight outline-none focus:ring-2 focus:ring-ring"
                    />
                  </StackField>
                  <StackField label="Font">
                    <Select
                      value={ts?.fontFamily ?? 'Inter'}
                      onChange={(e) => onChange({ textStyle: { fontFamily: e.target.value } })}
                      className="h-8 w-full min-w-0"
                    >
                      {TEXT_FONTS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                  </StackField>
                  <StackField label="Weight">
                    <Select
                      value={String(ts?.fontWeight ?? 800)}
                      onChange={(e) => onChange({ textStyle: { fontWeight: Number(e.target.value) } })}
                      className="h-8 w-full min-w-0"
                    >
                      {[400, 500, 600, 700, 800, 900].map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </Select>
                  </StackField>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
