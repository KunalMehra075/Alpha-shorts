import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Download,
  Loader2,
  Mic,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { TabHeader } from '@/components/TabHeader';
import { cn, mediaUrl, relativeTime } from '@/lib/utils';
import {
  useAudio,
  useDeleteAudio,
  useGenerateAudio,
  useScript,
  useSelectAudio,
  useUploadAudio,
  useVoices
} from '@/lib/queries';
import { useProjectCtx } from '@/layouts/ProjectLayout';
import { formatBytes, formatDuration } from '@/lib/mockMedia';

export function AudioPage() {
  const { project, id } = useProjectCtx();
  const { data: script } = useScript(id);
  const { data: voices } = useVoices();
  const { data: audio } = useAudio(id);

  const generate = useGenerateAudio(id);
  const select = useSelectAudio(id);
  const remove = useDeleteAudio(id);
  const uploadMut = useUploadAudio(id);

  const [voiceId, setVoiceId] = useState('');
  const [stability, setStability] = useState(50);
  const [similarity, setSimilarity] = useState(75);
  const [speedPct, setSpeedPct] = useState(100); // 100–200 → 1.00x–2.00x
  const speed = speedPct / 100;
  const fileInput = useRef<HTMLInputElement>(null);

  // Default the voice to one matching the project language.
  useEffect(() => {
    if (!voices?.length || voiceId) return;
    const match = voices.find((v) => v.language === project.language);
    setVoiceId((match ?? voices[0]).id);
  }, [voices, voiceId, project.language]);

  const words = script?.voiceoverScript?.trim()
    ? script.voiceoverScript.trim().split(/\s+/).length
    : 0;
  const hasScript = !!script?.voiceoverScript?.trim();

  const versions = audio?.versions ?? [];
  const current = versions.find((v) => v.version === audio?.currentVersion) ?? null;

  const runGenerate = async () => {
    if (!hasScript) return toast.error('Generate a script first.');
    if (!voiceId) return toast.error('Pick a voice.');
    try {
      await generate.mutateAsync({ voiceId, stability, similarity, speed });
      toast.success('Narration generated');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      await uploadMut.mutateAsync({ file, speed });
      toast.success('Audio uploaded');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={AudioLines}
        title="Audio Generator"
        description="Turn your script into narration with ElevenLabs."
        status={project.stages.audio.status}
      />

      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          onUpload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* Left: script + voice + settings */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between">
                <Label>Script preview</Label>
                <span className="text-xs text-muted-foreground">{words} words</span>
              </div>
              {hasScript ? (
                <p className="max-h-32 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-foreground/90">
                  {script!.voiceoverScript}
                </p>
              ) : (
                <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  No script yet — generate one in the Script tab first.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <Label>Voice</Label>
              <div className="grid gap-2">
                {(voices ?? []).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVoiceId(v.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      voiceId === v.id ? 'border-accent/50 bg-accent/10' : 'border-border hover:bg-muted'
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Mic className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{v.name}</span>
                        <Badge variant="outline" className="uppercase">
                          {v.language}
                        </Badge>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {v.tagline || `${v.accent} · ${v.gender}`}
                      </span>
                    </span>
                    {voiceId === v.id && <Check className="size-4 shrink-0 text-accent" />}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <Label>Voice settings</Label>
              <SliderRow label="Stability" value={stability} onChange={setStability} />
              <SliderRow label="Similarity" value={similarity} onChange={setSimilarity} />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Speed</span>
                  <span>{speed.toFixed(2)}x</span>
                </div>
                <Slider value={speedPct} onValueChange={setSpeedPct} min={100} max={200} />
                <p className="text-[11px] text-muted-foreground">
                  Speeds up narration (pitch-preserved). Applies to generated and uploaded audio.
                </p>
              </div>
              <Button
                variant="primary"
                size="lg"
                className="mt-1 w-full"
                onClick={runGenerate}
                disabled={generate.isPending || !hasScript || !voiceId}
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate Audio
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="self-center"
                onClick={() => fileInput.current?.click()}
                disabled={uploadMut.isPending}
              >
                <Upload className="size-4" /> or upload your own audio
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: player + history */}
        <div className="flex flex-col gap-5">
          {!current ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                  <AudioLines className="size-7 text-muted-foreground" />
                </div>
                <p className="text-base font-semibold">No audio yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Pick a voice and click Generate Audio to create a narration take.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-col gap-5 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="accent">v{current.version}</Badge>
                      <span className="text-sm font-medium">{current.voiceName}</span>
                      {current.source === 'uploaded' && <Badge variant="outline">uploaded</Badge>}
                      {current.speed > 1 && <Badge variant="outline">{current.speed.toFixed(2)}x</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(current.createdAt)}
                    </span>
                  </div>

                  <AudioPlayer key={current.file} src={mediaUrl(id, current.file)} fallback={current.durationSec} />

                  <div className="grid grid-cols-3 gap-3">
                    <Meta label="Duration" value={formatDuration(current.durationSec)} />
                    <Meta label="File size" value={formatBytes(current.sizeBytes)} />
                    <Meta
                      label="Gen time"
                      value={current.genTimeSec ? `${current.genTimeSec}s` : '—'}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={runGenerate} disabled={generate.isPending}>
                      <Sparkles className="size-4" /> Regenerate
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={mediaUrl(id, current.file)} download>
                        <Download className="size-4" /> Download
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploadMut.isPending}
                    >
                      <Upload className="size-4" /> Replace
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <h3 className="mb-3 text-sm font-semibold">Audio history</h3>
                  <ul className="flex flex-col gap-2">
                    {[...versions].reverse().map((t) => (
                      <li
                        key={t.version}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-2.5 transition-colors',
                          t.version === audio?.currentVersion
                            ? 'border-accent/50 bg-accent/10'
                            : 'border-border'
                        )}
                      >
                        <button
                          onClick={() => select.mutate(t.version)}
                          className="flex flex-1 items-center gap-2 text-left"
                        >
                          <Badge variant={t.version === audio?.currentVersion ? 'accent' : 'default'}>
                            v{t.version}
                          </Badge>
                          <span className="text-sm">{t.voiceName}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatDuration(t.durationSec)} · {formatBytes(t.sizeBytes)}
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => remove.mutate(t.version)}
                          title="Delete take"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <Slider value={value} onValueChange={onChange} min={0} max={100} />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

// Real audio player driving an <audio> element.
function AudioPlayer({ src, fallback }: { src: string; fallback: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(fallback);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * duration;
    setTime(a.currentTime);
  };

  const pct = duration ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
      <Button variant="primary" size="icon" className="size-10" onClick={toggle}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <div className="flex-1">
        <div
          className="h-2 w-full cursor-pointer overflow-hidden rounded-full bg-foreground/10"
          onClick={seek}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{formatDuration(time)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    </div>
  );
}
