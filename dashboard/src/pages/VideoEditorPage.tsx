import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Captions as CaptionsIcon,
  Clapperboard,
  Film,
  Loader2,
  Music,
  Pause,
  Play,
  Sparkles,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TabHeader } from '@/components/TabHeader';
import { TransitionIcon } from '@/components/TransitionIcon';
import { cn, relativeTime } from '@/lib/utils';
import { useCaptions, useScript } from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import { placeholderDataUri } from '@/lib/placeholder';
import { formatDuration as fmt } from '@/lib/mockMedia';
import {
  PRESETS,
  TRANSITIONS,
  effectsFor,
  type Transition
} from '@/lib/editorOptions';
import { useEditorStore, useWorkspaceEditor } from '@/lib/editorStore';
import type { CaptionSettings, Scene, VisualType } from '@/lib/types';

type Clip = {
  index: number;
  spokenLine: string;
  visualType: VisualType;
  thumb: string;
  hasAsset: boolean;
  effect: string;
  transition: Transition;
  durationSec: number;
  start: number; // cumulative
};

export function VideoEditorPage() {
  const { workspace, id } = useWorkspaceCtx();
  const navigate = useNavigate();
  const { data: script } = useScript(id);
  const { data: caps } = useCaptions(id);
  const scenes = script?.scenes ?? [];

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
      const asset = editor.assets[i]?.selected ?? null;
      const durationSec = ts?.durationSec ?? Math.max(0.5, s.end - s.start);
      const clip: Clip = {
        index: i,
        spokenLine: s.spokenLine,
        visualType: s.visualType,
        thumb: asset?.thumb ?? placeholderDataUri(`${id}-scene-${i}`, { ratio: '9:16' }),
        hasAsset: !!asset,
        effect: ts?.effect ?? effectsFor(s.visualType)[0],
        transition: ts?.transition ?? 'Fade',
        durationSec,
        start: t
      };
      t += durationSec;
      return clip;
    });
  }, [scenes, editor, id]);

  const total = clips.reduce((a, c) => a + c.durationSec, 0);
  const audioTake = workspace.audio.versions.find((v) => v.version === workspace.audio.currentVersion);
  const music = editor.timeline.music;
  const captionsEnabled = editor.timeline.captionsEnabled;

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
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      onClick={() => toast.info("Music upload wired later.")}
                    >
                      Upload / select track
                    </Button>
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

              {/* Captions */}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <CaptionsIcon className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Captions</p>
                    <p className="text-xs text-muted-foreground">
                      {caps?.hasTranscript
                        ? `${caps.lines.length} lines`
                        : "None yet"}{" "}
                      ·{" "}
                      <button
                        className="underline hover:text-accent"
                        onClick={() => navigate(`/w/${id}/caption`)}
                      >
                        edit style
                      </button>
                    </p>
                  </div>
                </div>
                <Switch
                  checked={captionsEnabled}
                  onCheckedChange={(v) => toggleCaptions(id, v)}
                />
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
                  <img
                    src={c.thumb}
                    alt=""
                    className="size-full object-cover"
                  />
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
        </CardContent>
      </Card>

      {/* Render */}
      <RenderSection
        sceneCount={clips.length}
        totalDuration={total}
        workspaceId={id}
        onProceed={() => navigate(`/w/${id}/upload`)}
      />
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

function EditorPreview({
  clips,
  total,
  captionsEnabled,
  captionSettings,
  captionLines,
  onScrubToScene
}: {
  clips: Clip[];
  total: number;
  captionsEnabled: boolean;
  captionSettings?: CaptionSettings;
  captionLines: { id: number; start: number; end: number; text: string }[];
  onScrubToScene: (i: number) => void;
}) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(300);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setFrameW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setTime((t) => {
        const next = t + dt;
        return next >= total ? 0 : next;
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

  const line = captionLines.find((l) => time >= l.start && time < l.end);
  const scale = frameW / 1080;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-xl border-2 border-accent bg-black"
      >
        <div className="absolute inset-0 overflow-hidden bg-black">
          {active && (
            <img
              key={active.index}
              src={active.thumb}
              alt=""
              className="size-full object-cover"
              style={{ transform: fx.transform, filter: fx.filter, opacity: fadeT, transition: 'opacity 80ms linear' }}
            />
          )}
          {captionsEnabled && line && captionSettings && (
            <div
              className="absolute inset-x-0 px-3 text-center"
              style={{ top: `${8 + 0.84 * captionSettings.positionY}%`, transform: 'translateY(-50%)' }}
            >
              <span
                style={{
                  fontFamily: `'${captionSettings.fontFamily}', sans-serif`,
                  fontSize: captionSettings.fontSize * scale,
                  fontWeight: captionSettings.fontWeight,
                  color: captionSettings.textColor,
                  WebkitTextStroke:
                    captionSettings.strokeWidth > 0
                      ? `${captionSettings.strokeWidth * scale}px ${captionSettings.strokeColor}`
                      : undefined,
                  paintOrder: 'stroke fill',
                  textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  textTransform: captionSettings.uppercase ? 'uppercase' : 'none',
                  lineHeight: 1.1
                }}
              >
                {line.text}
              </span>
            </div>
          )}
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
        Mock preview — the final render (Remotion) is wired in a later round.
      </p>
    </div>
  );
}

// ── Render section (mock) ─────────────────────────────────────────────────────
type Render = { id: number; name: string; thumb: string; durationSec: number; resolution: string; createdAt: string };

function RenderSection({
  sceneCount,
  totalDuration,
  workspaceId,
  onProceed
}: {
  sceneCount: number;
  totalDuration: number;
  workspaceId: string;
  onProceed: () => void;
}) {
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentScene, setCurrentScene] = useState(0);
  const [renders, setRenders] = useState<Render[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const etaSec = Math.ceil(((100 - progress) / 100) * sceneCount * 0.6);

  const createVideo = () => {
    if (rendering) return;
    setRendering(true);
    setProgress(0);
    setCurrentScene(1);
    const stepPct = 100 / (sceneCount * 6);
    timer.current = setInterval(() => {
      setProgress((pr) => {
        const next = Math.min(100, pr + stepPct);
        setCurrentScene(Math.min(sceneCount, Math.ceil((next / 100) * sceneCount) || 1));
        if (next >= 100) {
          if (timer.current) clearInterval(timer.current);
          setRendering(false);
          setRenders((prev) => {
            const n = prev.length + 1;
            return [
              {
                id: n,
                name: `Render ${n}`,
                thumb: placeholderDataUri(`${workspaceId}-render-${n}`, { ratio: '9:16', accent: true }),
                durationSec: totalDuration,
                resolution: '1080×1920',
                createdAt: new Date().toISOString()
              },
              ...prev
            ];
          });
          toast.success('Render complete (preview)');
        }
        return next;
      });
    }, 100);
  };

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  return (
    <Card className="mt-5">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Render</h3>
            <p className="text-xs text-muted-foreground">{sceneCount} scenes · {fmt(totalDuration)} · 1080×1920 @ 30fps</p>
          </div>
          <Button variant="primary" size="lg" onClick={createVideo} disabled={rendering}>
            {rendering ? (
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

        {rendering && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Rendering scene {currentScene}/{sceneCount}</span>
              <span>~{etaSec}s remaining</span>
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Generated Videos</h4>
            {renders.length > 0 && (
              <Button variant="secondary" size="sm" onClick={onProceed}>
                Proceed to Upload <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
          {renders.length === 0 ? (
            <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">Rendered videos will appear here.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {renders.map((r) => (
                <RenderCard key={r.id} r={r} onDelete={() => setRenders((prev) => prev.filter((x) => x.id !== r.id))} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RenderCard({ r, onDelete }: { r: Render; onDelete: () => void }) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-[9/16] bg-black">
        <img src={r.thumb} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
          <span className="flex size-11 items-center justify-center rounded-full bg-black/60">
            <Play className="size-5 text-white" />
          </span>
        </div>
        <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{fmt(r.durationSec)}</span>
      </div>
      <div className="flex items-center justify-between p-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="text-[11px] text-muted-foreground">{r.resolution} · {relativeTime(r.createdAt)}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
