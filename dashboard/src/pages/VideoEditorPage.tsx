import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Captions as CaptionsIcon,
  Clapperboard,
  Download,
  Film,
  Library as LibraryIcon,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2
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
import { TabHeader } from '@/components/TabHeader';
import { TransitionIcon } from '@/components/TransitionIcon';
import { cn, libraryUrl, relativeTime } from '@/lib/utils';
import {
  useAssets,
  useCaptions,
  useDeleteMusic,
  useDeleteRender,
  useLibrary,
  useMediaLibrary,
  useMusicFromGlobal,
  useMusicFromLibrary,
  usePlaceSound,
  useRemovePlacement,
  useRenderVideo,
  useRenders,
  useScenes,
  useSoundLibrary,
  useUpdatePlacement,
  useUploadMusic,
  useUploadSound,
  useVideoSounds
} from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import { placeholderDataUri } from '@/lib/placeholder';
import { formatBytes, formatDuration as fmt } from '@/lib/mockMedia';
import {
  PRESETS,
  TRANSITIONS,
  effectsFor,
  type Transition
} from '@/lib/editorOptions';
import { useEditorStore, useWorkspaceEditor } from '@/lib/editorStore';
import type { CaptionSettings, RenderRecord, Scene, SoundPlacement, VisualType } from '@/lib/types';

type Clip = {
  index: number;
  spokenLine: string;
  visualType: VisualType;
  thumb: string;
  videoSrc?: string; // set when the selected asset is a workspace video file
  trimStartSec: number; // where the trimmed segment starts in the source video
  hasAsset: boolean;
  effect: string;
  transition: Transition;
  durationSec: number;
  start: number; // cumulative
};

export function VideoEditorPage() {
  const { workspace, id } = useWorkspaceCtx();
  const navigate = useNavigate();
  const { data: scenesData } = useScenes(id);
  const { data: caps } = useCaptions(id);
  const { data: assets } = useAssets(id);
  const scenes = scenesData ?? [];
  const assetRows = assets?.scenes ?? [];

  const editor = useWorkspaceEditor(id);
  const ensureTimeline = useEditorStore((s) => s.ensureTimeline);
  const applyPreset = useEditorStore((s) => s.applyPreset);
  const setSceneEffect = useEditorStore((s) => s.setSceneEffect);
  const setSceneTransition = useEditorStore((s) => s.setSceneTransition);
  const setSceneDuration = useEditorStore((s) => s.setSceneDuration);
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
        start: t
      };
      t += durationSec;
      return clip;
    });
  }, [scenes, editor, assetRows, id]);

  const total = clips.reduce((a, c) => a + c.durationSec, 0);
  const audioTake = workspace.audio.versions.find((v) => v.version === workspace.audio.currentVersion);
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

  // Real media for the preview player (served from the workspace).
  const narrationSrc = audioTake ? `/media/${id}/${audioTake.file}` : undefined;
  const musicTrack = workspace.music?.file ? workspace.music : null;
  const musicSrc = music.enabled && musicTrack ? `/media/${id}/${musicTrack.file}` : undefined;

  if (!scenes.length) {
    return (
      <div className="animate-fade-in">
        <TabHeader icon={Clapperboard} title="Video Editor" description="Arrange scenes, effects and transitions, then render." status={workspace.stages.video.status} />
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
        status={workspace.stages.video.status}
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
              workspaceId={id}
              onScrubToScene={setSelected}
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
            />
          )}

          {/* Audio tracks */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <h3 className="text-sm font-semibold">Audio</h3>
              <div className="grid gap-3 sm:grid-cols-2">
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Timeline — square cards with transition icons in circles between them */}
      <Card className="mt-5">
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Timeline</h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
            {clips.map((c, i) => (
              <div key={c.index} className="flex items-center gap-2">
                <button
                  onClick={() => setSelected(i)}
                  title={`Scene ${c.index + 1} · ${c.effect}`}
                  className={cn(
                    "group relative aspect-square w-[124px] shrink-0 overflow-hidden rounded-lg border transition",
                    selected === i
                      ? "border-accent ring-1 ring-accent"
                      : "border-border hover:opacity-90",
                  )}
                >
                  {c.videoSrc ? (
                    <video
                      src={c.videoSrc}
                      muted
                      preload="metadata"
                      className="size-full object-cover"
                    />
                  ) : (
                    <img src={c.thumb} alt="" className="size-full object-cover" />
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {c.index + 1}
                  </span>
                  {!c.hasAsset && (
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[9px] text-white/60">
                      no asset
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-4 text-[9px] text-white">
                    <span className="truncate">{c.effect}</span>
                    <span className="shrink-0">
                      {c.durationSec.toFixed(1)}s
                    </span>
                  </div>
                </button>
                {i < clips.length - 1 && (
                  <button
                    onClick={() => setSelected(i + 1)}
                    title={`Transition: ${clips[i + 1].transition}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    <TransitionIcon
                      name={clips[i + 1].transition}
                      className="size-4"
                    />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Sound effects track */}
          <SoundTrack
            id={id}
            total={total}
            placements={placements}
            enabled={soundsEnabled}
            onPlace={(soundId, atSec) => placeSound.mutate({ soundId, atSec })}
            onMove={(placementId, atSec) => updatePlacement.mutate({ placementId, patch: { atSec } })}
            onVolume={(placementId, volume) => updatePlacement.mutate({ placementId, patch: { volume } })}
            onRemove={(placementId) => removePlacement.mutate(placementId)}
          />
        </CardContent>
      </Card>

      {/* Render */}
      <RenderSection
        sceneCount={clips.length}
        totalDuration={total}
        workspaceId={id}
        buildPayload={() => ({
          scenes: clips.map((c) => ({
            index: c.index,
            effect: c.effect,
            transition: c.transition,
            durationSec: c.durationSec
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
                  title="Workspace"
                  items={ws}
                  kind="ws"
                  empty={
                    audioLibrary.length === 0
                      ? 'No audio in this workspace yet — add some in the Assets step.'
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
    </div>
  );
}

// ── Scene settings panel ──────────────────────────────────────────────────────
function SceneSettings({
  clip,
  onEffect,
  onTransition,
  onDuration
}: {
  clip: Clip;
  onEffect: (e: string) => void;
  onTransition: (t: Transition) => void;
  onDuration: (d: number) => void;
}) {
  const [zoom, setZoom] = useState(50);
  const [intensity, setIntensity] = useState(50);
  const [motion, setMotion] = useState('cinematic');

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="accent" className="whitespaces-nowrap">Scene {clip.index + 1}</Badge>
          <p className="line-clamp-1 text-sm text-muted-foreground">{clip.spokenLine}</p>
        </div>

        {/* 2-column grid of controls */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Duration</Label>
              <span className="text-xs text-muted-foreground">{clip.durationSec.toFixed(1)}s</span>
            </div>
            <Slider value={clip.durationSec} min={1} max={10} onValueChange={onDuration} />
          </div>

          <div className="grid gap-1.5">
            <Label>Transition (in)</Label>
            <Select value={clip.transition} onChange={(e) => onTransition(e.target.value as Transition)}>
              {TRANSITIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>

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
            <Select value={motion} onChange={(e) => setMotion(e.target.value)}>
              <option value="subtle">Subtle</option>
              <option value="cinematic">Cinematic</option>
              <option value="energetic">Energetic</option>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Zoom level</Label>
              <span className="text-xs text-muted-foreground">{zoom}%</span>
            </div>
            <Slider value={zoom} min={0} max={100} onValueChange={setZoom} />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Animation intensity</Label>
              <span className="text-xs text-muted-foreground">{intensity}%</span>
            </div>
            <Slider value={intensity} min={0} max={100} onValueChange={setIntensity} />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Zoom / motion / intensity are previews for now and apply at render time in a later round.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Live preview (mock player) ────────────────────────────────────────────────
function effectTransform(effect: string, p: number): { transform: string; filter?: string } {
  const e = effect.toLowerCase();
  if (e.includes('zoom out')) return { transform: `scale(${1.12 - 0.12 * p})` };
  if (e.includes('zoom') || e.includes('focus')) return { transform: `scale(${1.0 + 0.12 * p})` };
  if (e.includes('pan left')) return { transform: `scale(1.12) translateX(${-4 * p}%)` };
  if (e.includes('pan right')) return { transform: `scale(1.12) translateX(${4 * p}%)` };
  if (e.includes('ken burns')) return { transform: `scale(${1.05 + 0.13 * p}) translate(${-2 * p}%, ${-2 * p}%)` };
  if (e.includes('parallax')) return { transform: `scale(${1.08 + 0.06 * p}) translateY(${-3 * p}%)` };
  if (e.includes('rotate')) return { transform: `scale(1.1) rotate(${(p - 0.5) * 3}deg)` };
  if (e.includes('motion blur')) return { transform: 'scale(1.08)', filter: 'blur(1px)' };
  if (e.includes('crop')) return { transform: 'scale(1.06)' };
  return { transform: `scale(${1.04 + 0.06 * p})` };
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
  workspaceId,
  onScrubToScene
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
  workspaceId: string;
  onScrubToScene: (i: number) => void;
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

  // Fire each placed sound when the playhead crosses its start time.
  useEffect(() => {
    if (!playing) {
      lastT.current = time;
      return;
    }
    const prev = lastT.current;
    lastT.current = time;
    if (time < prev || !soundsEnabled) return; // wrapped / disabled
    for (const p of placements) {
      if (prev <= p.atSec && p.atSec < time) {
        const el = sfxRefs.current[p.id];
        if (el) {
          try {
            el.currentTime = 0;
            el.volume = Math.max(0, Math.min(1, p.volume ?? 1));
            el.play().catch(() => {});
          } catch {
            /* ignore */
          }
        }
      }
    }
  }, [time, playing, soundsEnabled, placements]);

  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(300);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setFrameW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Point the audio elements at a given timeline position (music loops).
  const syncAudio = (t: number) => {
    const n = narrRef.current;
    const mu = musicRef.current;
    if (n && isFinite(n.duration)) n.currentTime = Math.min(t, n.duration);
    else if (n) n.currentTime = t;
    if (mu) mu.currentTime = mu.duration ? t % mu.duration : 0;
  };

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
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= total) {
          // Loop: restart the audio tracks too.
          if (narrRef.current) narrRef.current.currentTime = 0;
          if (musicRef.current) musicRef.current.currentTime = 0;
          return 0;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, total]);

  // Which clip is active at `time`.
  const active = clips.find((c) => time >= c.start && time < c.start + c.durationSec) ?? clips[0];
  const p = active ? Math.min(1, (time - active.start) / Math.max(0.001, active.durationSec)) : 0;
  const fx = active ? effectTransform(active.effect, p) : { transform: 'none' };
  // Brief transition fade at the start of each clip.
  const fadeT = active ? Math.min(1, (time - active.start) / 0.4) : 1;

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
                style={{ transform: fx.transform, filter: fx.filter, opacity: fadeT, transition: 'opacity 80ms linear' }}
              />
            ) : (
              <img
                key={active.index}
                src={active.thumb}
                alt=""
                className="size-full object-cover"
                style={{ transform: fx.transform, filter: fx.filter, opacity: fadeT, transition: 'opacity 80ms linear' }}
              />
            ))}
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
            const t = frac * total;
            setTime(t);
            syncAudio(t);
            const c = clips.find((x) => t >= x.start && t < x.start + x.durationSec);
            if (c) onScrubToScene(clips.indexOf(c));
          }}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${(time / Math.max(0.001, total)) * 100}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
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
            src={`/media/${workspaceId}/${p.file}`}
            preload="auto"
            className="hidden"
          />
        ))}
    </div>
  );
}

// ── Render section (real Remotion render via background job) ───────────────────
type RenderPayload = {
  scenes: { index: number; effect: string; transition: string; durationSec: number }[];
  captionsEnabled: boolean;
  preset: string | null;
  music: { enabled: boolean; volume: number; fadeIn: boolean; fadeOut: boolean };
  soundsEnabled: boolean;
};

function RenderSection({
  sceneCount,
  totalDuration,
  workspaceId,
  buildPayload,
  onProceed
}: {
  sceneCount: number;
  totalDuration: number;
  workspaceId: string;
  buildPayload: () => RenderPayload;
  onProceed: () => void;
}) {
  const { data: renders = [] } = useRenders(workspaceId);
  const render = useRenderVideo(workspaceId);
  const del = useDeleteRender(workspaceId);

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
                  workspaceId={workspaceId}
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
  workspaceId,
  onDelete
}: {
  r: RenderRecord;
  workspaceId: string;
  onDelete: () => void;
}) {
  const src = r.file ? `/media/${workspaceId}/${r.file}?v=${r.sizeBytes}` : null;

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

// ── Sound effects track (below the timeline) ──────────────────────────────────
function SoundTrack({
  id: _id,
  total,
  placements,
  enabled,
  onPlace,
  onMove,
  onVolume,
  onRemove
}: {
  id: string;
  total: number;
  placements: SoundPlacement[];
  enabled: boolean;
  onPlace: (soundId: string, atSec: number) => void;
  onMove: (placementId: string, atSec: number) => void;
  onVolume: (placementId: string, volume: number) => void;
  onRemove: (placementId: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragPid, setDragPid] = useState<string | null>(null);
  const [dragAt, setDragAt] = useState(0);

  const xToSec = (clientX: number) => {
    const el = trackRef.current;
    if (!el || total <= 0) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(total, ((clientX - r.left) / r.width) * total));
  };

  useEffect(() => {
    if (!dragPid) return;
    const move = (e: PointerEvent) => setDragAt(xToSec(e.clientX));
    const up = (e: PointerEvent) => {
      onMove(dragPid, xToSec(e.clientX));
      setDragPid(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPid, total]);

  const sel = placements.find((p) => p.id === selected) ?? null;

  // One tick per whole second; labels at multiples of 5.
  const ticks: number[] = [];
  for (let s = 0; s <= Math.floor(total); s++) ticks.push(s);

  return (
    <div className={cn('mt-4', !enabled && 'opacity-50')}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        Sound effects track{!enabled && ' (disabled)'}
      </span>
      <div
        ref={trackRef}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-sound-id')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const sid = e.dataTransfer.getData('application/x-sound-id');
          if (sid) onPlace(sid, xToSec(e.clientX));
        }}
        className={cn(
          'relative h-14 w-full overflow-hidden rounded-lg border border-dashed',
          dragOver ? 'border-accent bg-accent/10' : 'border-border bg-muted/30'
        )}
      >
        {/* 5-second gridlines, behind the blocks */}
        <div className="pointer-events-none absolute inset-0">
          {ticks
            .filter((s) => s > 0 && s % 5 === 0)
            .map((s) => (
              <div
                key={s}
                className="absolute bottom-0 top-0 w-px bg-border/40"
                style={{ left: `${total > 0 ? (s / total) * 100 : 0}%` }}
              />
            ))}
        </div>
        {placements.length === 0 && !dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
            Drag a sound here to place it on the video
          </div>
        )}
        {placements.map((p) => {
          const at = dragPid === p.id ? dragAt : p.atSec;
          const left = total > 0 ? (at / total) * 100 : 0;
          const width = total > 0 ? Math.max(4, (Math.max(0.3, p.durationSec) / total) * 100) : 8;
          return (
            <div
              key={p.id}
              onPointerDown={(e) => {
                e.preventDefault();
                setSelected(p.id);
                setDragPid(p.id);
                setDragAt(p.atSec);
              }}
              title={`${p.name} @ ${at.toFixed(1)}s`}
              style={{ left: `${left}%`, width: `${width}%` }}
              className={cn(
                'absolute bottom-1.5 top-1.5 flex cursor-grab items-center gap-1 overflow-hidden rounded-md border px-1.5 text-[10px] active:cursor-grabbing',
                selected === p.id
                  ? 'border-accent bg-accent/25 ring-1 ring-accent'
                  : 'border-accent/40 bg-accent/15'
              )}
            >
              <Music className="size-3 shrink-0 text-accent" />
              <span className="truncate">{p.name}</span>
            </div>
          );
        })}
      </div>
      {/* Per-second ruler; numbered every 5s */}
      {total > 0 && (
        <div className="relative mt-1 h-5 w-full select-none">
          {ticks.map((s) => {
            const left = (s / total) * 100;
            const major = s % 5 === 0;
            return (
              <div
                key={s}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
              >
                <div className={cn('w-px bg-border', major ? 'h-2' : 'h-1')} />
                {major && (
                  <span className="mt-0.5 text-[9px] leading-none tabular-nums text-muted-foreground">
                    {s}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {sel && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-border p-2 text-xs">
          <Music className="size-4 shrink-0 text-accent" />
          <span className="truncate font-medium">{sel.name}</span>
          <span className="shrink-0 text-muted-foreground">@ {sel.atSec.toFixed(1)}s</span>
          <div className="ml-2 flex items-center gap-2">
            <span className="text-muted-foreground">Vol</span>
            <Slider
              value={Math.round((sel.volume ?? 1) * 100)}
              min={0}
              max={100}
              onValueChange={(v) => onVolume(sel.id, v / 100)}
              className="w-28"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-7 text-destructive"
            onClick={() => {
              onRemove(sel.id);
              setSelected(null);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
