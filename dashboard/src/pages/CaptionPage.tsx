import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  Code2,
  Download,
  FileText,
  Film,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TabHeader } from '@/components/TabHeader';
import { PhoneFrame } from '@/components/PhoneFrame';
import { cn, mediaUrl } from '@/lib/utils';
import { formatBytes, formatDuration } from '@/lib/mockMedia';
import {
  useCaptions,
  useGenerateCaptions,
  useRenderCaptionOverlay,
  useSaveCaptions
} from '@/lib/queries';
import { useProjectCtx } from '@/layouts/ProjectLayout';
import type { CaptionLine, CaptionMedia, CaptionSettings, Language } from '@/lib/types';

const FONTS = ['Inter', 'Arial', 'Impact', 'Montserrat', 'Poppins', 'Bebas Neue', 'Noto Sans Devanagari'];

export function CaptionPage() {
  const { project, id } = useProjectCtx();
  const { data: caps } = useCaptions(id);
  const generate = useGenerateCaptions(id);
  const save = useSaveCaptions(id);
  const render = useRenderCaptionOverlay(id);

  const [language, setLanguage] = useState<Language>(project.language);
  const [settings, setSettings] = useState<CaptionSettings | null>(null);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState<'normal' | 'highlighted' | 'green'>('highlighted');

  useEffect(() => {
    if (!caps) return;
    setLanguage((caps.language || project.language) as Language);
    setSettings(caps.settings);
    setLines(caps.lines);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, caps?.hasTranscript, caps?.wordsCount]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || !settings) return;
    const h = setTimeout(() => {
      saveRef.current.mutate({ settings, lines });
      setDirty(false);
    }, 900);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, lines, dirty]);

  const patch = (p: Partial<CaptionSettings>) => {
    setSettings((s) => (s ? { ...s, ...p } : s));
    setDirty(true);
  };

  const runGenerate = async () => {
    if (!settings) return;
    try {
      await generate.mutateAsync({ language, settings });
      toast.success('Captions transcribed');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  // Changing words-per-line re-chunks the existing transcript (reuses the cached
  // Whisper words — no re-transcribe). Replaces manual line splits.
  const changeWordsPerLine = async (v: number) => {
    if (!settings) return;
    const next = { ...settings, wordsPerLine: v };
    setSettings(next);
    if (!caps?.hasTranscript) {
      setDirty(true);
      return;
    }
    try {
      const state = await generate.mutateAsync({ language, settings: next });
      setSettings(state.settings);
      setLines(state.lines);
      setDirty(false);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const runRender = async () => {
    try {
      // Flush the latest style/line tweaks before rendering so the overlay uses
      // them (otherwise we'd render whatever the debounced autosave last saved).
      if (settings) await save.mutateAsync({ settings, lines });
      setDirty(false);
      await render.mutateAsync();
      toast.success('Overlay rendered with audio');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const previewWords = useMemo(() => {
    const perLine = settings?.wordsPerLine ?? 4;
    const sample = lines[0]?.text || 'Your captions preview here';
    return sample.split(/\s+/).slice(0, perLine);
  }, [lines, settings?.wordsPerLine]);

  if (!settings) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading…
      </div>
    );
  }

  const hasTranscript = !!caps?.hasTranscript;
  const overlay = caps?.overlay ?? null;

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={Captions}
        title="Caption Maker"
        description="Transcribe audio with Whisper and style your captions."
        status={project.stages.caption.status}
        actions={dirty ? <span className="text-xs text-muted-foreground">Saving…</span> : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,360px)]">
        {/* Left: settings + captions */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="flex flex-wrap items-end justify-between gap-3 p-5">
              <div className="grid gap-1.5">
                <Label>Caption language</Label>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {(['en', 'hi', 'bilingual'] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                        language === l ? 'bg-card shadow-sm' : 'text-muted-foreground'
                      )}
                    >
                      {l === 'en' ? 'English' : l === 'hi' ? 'Hindi' : 'Bilingual'}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" onClick={runGenerate} disabled={generate.isPending}>
                {generate.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Transcribing…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> {hasTranscript ? 'Re-transcribe' : 'Generate Captions'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Style settings */}
          <Card>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Font</Label>
                <Select value={settings.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
                  {FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Weight</Label>
                <Select
                  value={String(settings.fontWeight)}
                  onChange={(e) => patch({ fontWeight: Number(e.target.value) })}
                >
                  {[400, 500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>Words / line</Label>
                <Select
                  value={String(settings.wordsPerLine ?? 4)}
                  disabled={generate.isPending}
                  onChange={(e) => changeWordsPerLine(Number(e.target.value))}
                >
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 2 ? '(punchy)' : n === 5 ? '(dense)' : ''}
                    </option>
                  ))}
                </Select>
              </div>

              <SliderField label="Font size" value={settings.fontSize} min={28} max={110} suffix="px" onChange={(v) => patch({ fontSize: v })} />
              <SliderField label="Stroke width" value={settings.strokeWidth} min={0} max={16} suffix="px" onChange={(v) => patch({ strokeWidth: v })} />

              <ColorField label="Text color" value={settings.textColor} onChange={(v) => patch({ textColor: v })} />
              <ColorField label="Stroke color" value={settings.strokeColor} onChange={(v) => patch({ strokeColor: v })} />
              <ColorField label="Highlight color" value={settings.highlightColor} onChange={(v) => patch({ highlightColor: v })} />

              <div className="flex items-center justify-between sm:self-end">
                <Label>Uppercase</Label>
                <Switch checked={settings.uppercase} onCheckedChange={(v) => patch({ uppercase: v })} />
              </div>

              {/* Vertical position slider (0 = top, 100 = bottom) */}
              <div className="grid gap-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Vertical position</Label>
                  <span className="text-xs text-muted-foreground">{settings.positionY}</span>
                </div>
                <Slider
                  value={settings.positionY}
                  min={0}
                  max={100}
                  onValueChange={(v) => patch({ positionY: v })}
                  className="mt-1.5"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Top</span>
                  <span>Bottom</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Editable captions */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Captions
                  {hasTranscript && (
                    <span className="ml-2 text-muted-foreground">
                      {lines.length} lines · {caps?.wordsCount} words
                    </span>
                  )}
                </h3>
                <div className="flex gap-1.5">
                  <ExportChip id={id} file={caps?.files.srt} icon={FileText} label="SRT" />
                  <ExportChip id={id} file={caps?.files.json} icon={Code2} label="JSON" />
                  <ExportChip id={id} file={caps?.files.words} icon={Download} label="Words" />
                </div>
              </div>
              {!hasTranscript ? (
                <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                  Generate captions to transcribe the narration into an editable, timed transcript.
                </p>
              ) : (
                <ul className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
                  {lines.map((line, i) => (
                    <li key={line.id} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {line.start.toFixed(1)}s
                      </span>
                      <Input
                        value={line.text}
                        onChange={(e) => {
                          setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, text: e.target.value } : l)));
                          setDirty(true);
                        }}
                        className="h-9 text-sm"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: live preview + render CTA */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as typeof previewMode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="normal" className="flex-1">Normal</TabsTrigger>
                  <TabsTrigger value="highlighted" className="flex-1">Highlighted</TabsTrigger>
                  <TabsTrigger value="green" className="flex-1">Green screen</TabsTrigger>
                </TabsList>
                <TabsContent value={previewMode}>
                  <CaptionPreview words={previewWords} settings={settings} mode={previewMode} />
                </TabsContent>
              </Tabs>
              <p className="text-center text-xs text-muted-foreground">
                Live preview updates as you tweak the style.
              </p>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={runRender}
                disabled={!hasTranscript || render.isPending}
              >
                {render.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Rendering…
                  </>
                ) : (
                  <>
                    <Film className="size-4" /> Render overlay
                  </>
                )}
              </Button>
              {!hasTranscript && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Generate captions first to enable rendering.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Caption overlay video (playable, with audio) */}
      <Card className="mt-5">
        <CardContent className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Caption overlay video</h3>
            <p className="text-xs text-muted-foreground">
              Plays with your generated narration. In the next step this overlay + audio go onto the Short.
            </p>
          </div>

          {!overlay ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                <Film className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Click <span className="font-medium text-foreground">Render overlay</span> to produce playable Normal and Greenscreen videos.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <OverlayPlayer
                title="Normal"
                src={overlay.normal ? mediaUrl(id, overlay.normal.file) : ''}
                version={overlay.createdAt}
                media={overlay.normal}
                durationSec={overlay.durationSec}
              />
              <OverlayPlayer
                title="Greenscreen"
                src={overlay.green ? mediaUrl(id, overlay.green.file) : ''}
                version={overlay.createdAt}
                media={overlay.green}
                durationSec={overlay.durationSec}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverlayPlayer({
  title,
  src,
  version,
  media,
  durationSec
}: {
  title: string;
  src: string;
  version: string;
  media: CaptionMedia | null;
  durationSec: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  if (!media) return null;
  const ext = (media.file.split('.').pop() || 'mp4').toUpperCase();
  // The file is overwritten on each render (same path); bust the cache so a new
  // render is fetched instead of the browser replaying the old video.
  const bustedSrc = `${src}?v=${encodeURIComponent(version)}`;

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };
  const toggleMute = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-xs font-medium text-muted-foreground">{title}</p>
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-lg border border-border bg-black">
        <video
          key={bustedSrc}
          ref={ref}
          src={bustedSrc}
          playsInline
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="size-full cursor-pointer object-cover"
          controls
        />
        {!playing && (
          <button
            onClick={toggle}
            className="absolute inset-0 flex items-center justify-center"
            aria-label="Play"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="size-6 text-white" />
            </span>
          </button>
        )}
      </div>

      {/* Controls + info */}
      <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
        <Button variant="ghost" size="icon" className="size-8" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline">{ext}</Badge>
          <span>{formatDuration(durationSec)}</span>
          <span>·</span>
          <span>{formatBytes(media.sizeBytes)}</span>
        </span>
        <Button variant="ghost" size="icon" className="size-8" asChild title="Download">
          <a href={bustedSrc} download>
            <Download className="size-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function CaptionPreview({
  words,
  settings,
  mode
}: {
  words: string[];
  settings: CaptionSettings;
  mode: 'normal' | 'highlighted' | 'green';
}) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (mode !== 'highlighted') return;
    const t = setInterval(() => setActive((a) => (a + 1) % Math.max(1, words.length)), 480);
    return () => clearInterval(t);
  }, [mode, words.length]);

  // Measure the actual frame width so the preview font size is pixel-accurate to
  // the 1080-wide rendered video (fontSize px scaled by frameWidth / 1080).
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(300);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setFrameW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = frameW / 1080;

  // Mirror the engine: 8% margins, block centered at the positionY fraction.
  const pad = 8;
  const top = pad + ((100 - 2 * pad) * settings.positionY) / 100;

  return (
    <PhoneFrame>
      <div
        ref={frameRef}
        className="absolute inset-0"
        style={{ background: mode === 'green' ? '#00FF00' : 'radial-gradient(120% 120% at 50% 0%, #2a2a2a 0%, #0b0b0b 100%)' }}
      />
      <div className="absolute inset-x-0 px-4" style={{ top: `${top}%`, transform: 'translateY(-50%)' }}>
        <p
          className="w-full text-center leading-tight"
          style={{
            fontFamily: `'${settings.fontFamily}', sans-serif`,
            fontSize: settings.fontSize * scale,
            fontWeight: settings.fontWeight,
            color: settings.textColor,
            WebkitTextStroke: settings.strokeWidth > 0 ? `${settings.strokeWidth * scale}px ${settings.strokeColor}` : undefined,
            paintOrder: 'stroke fill',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            textTransform: settings.uppercase ? 'uppercase' : 'none'
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                color: mode === 'highlighted' && i === active ? settings.highlightColor : settings.textColor,
                transition: 'color 120ms ease',
                marginRight: 8,
                display: 'inline-block'
              }}
            >
              {w}
            </span>
          ))}
        </p>
      </div>
    </PhoneFrame>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider value={value} min={min} max={max} onValueChange={onChange} className="mt-1.5" />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-0.5"
        />
        <Input value={value.toUpperCase()} onChange={(e) => onChange(e.target.value)} className="h-9 font-mono text-xs uppercase" />
      </div>
    </div>
  );
}

function ExportChip({
  id,
  file,
  icon: Icon,
  label
}: {
  id: string;
  file?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  if (!file) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground/50">
        <Icon className="size-3" />
        {label}
      </span>
    );
  }
  return (
    <a
      href={mediaUrl(id, file)}
      download
      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3" />
      {label}
    </a>
  );
}
