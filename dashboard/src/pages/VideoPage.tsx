import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Clapperboard,
  Film,
  ImagePlus,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
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
import { TabHeader } from '@/components/TabHeader';
import { cn, relativeTime } from '@/lib/utils';
import { useScript } from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import { mockStockResults, formatDuration, type StockAsset } from '@/lib/mockMedia';
import { placeholderDataUri } from '@/lib/placeholder';
import type { VisualType } from '@/lib/types';

const SCENE_TYPES: VisualType[] = ['Image', 'Video', 'Animation', 'SplitScreen'];
const EFFECTS = ['Zoom In', 'Zoom Out', 'Pan Left', 'Pan Right', 'Ken Burns', 'Parallax'];
const TRANSITIONS = ['Fade', 'Slide', 'Zoom', 'Crossfade'];

type SceneConfig = {
  type: VisualType;
  effect: string;
  transition: string;
  keywords: string[];
  imagePrompt: string;
  asset: StockAsset | null;
  seed: number;
};

type Render = {
  id: number;
  name: string;
  thumb: string;
  durationSec: number;
  resolution: string;
  createdAt: string;
};

export function VideoPage() {
  const { workspace, id } = useWorkspaceCtx();
  const navigate = useNavigate();
  const { data: script } = useScript(id);

  const scenes = script?.scenes ?? [];
  const [configs, setConfigs] = useState<Record<number, SceneConfig>>({});
  const [selected, setSelected] = useState(0);

  // Seed per-scene config from the script.
  useEffect(() => {
    if (!scenes.length) return;
    setConfigs((prev) => {
      const next = { ...prev };
      scenes.forEach((s, i) => {
        if (!next[i]) {
          next[i] = {
            type: s.visualType,
            effect: EFFECTS[i % EFFECTS.length],
            transition: TRANSITIONS[i % TRANSITIONS.length],
            keywords: s.searchKeywords ?? [],
            imagePrompt: s.imagePrompt ?? '',
            asset: null,
            seed: 0
          };
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.version, scenes.length]);

  const patch = (i: number, p: Partial<SceneConfig>) =>
    setConfigs((prev) => ({ ...prev, [i]: { ...prev[i], ...p } }));

  if (!scenes.length) {
    return (
      <div className="animate-fade-in">
        <TabHeader
          icon={Clapperboard}
          title="Video Creator"
          description="Assemble scenes into a finished Short."
          status={workspace.stages.video.status}
        />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Film className="size-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold">No scenes yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generate a script with a scene breakdown first — each scene becomes a row here.
            </p>
            <Button variant="primary" onClick={() => navigate(`/w/${id}/script`)}>
              Go to Script Generator
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sel = configs[selected];

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={Clapperboard}
        title="Video Creator"
        description="Configure each scene, then render your Short."
        status={workspace.stages.video.status}
        actions={
          <Badge variant="outline" title="UI preview — wired to the renderer in Phase 4">
            preview
          </Badge>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,400px)]">
        {/* Scene table */}
        <Card>
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
                    const c = configs[i];
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
                            {(c?.keywords ?? []).slice(0, 3).map((k) => (
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
                          {c?.asset ? (
                            <img
                              src={c.asset.thumb}
                              alt=""
                              className="h-12 w-8 rounded object-cover ring-1 ring-border"
                            />
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

        {/* Inspector */}
        <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          {sel && (
            <SceneInspector
              index={selected}
              spokenLine={scenes[selected].spokenLine}
              config={sel}
              onChange={(p) => patch(selected, p)}
            />
          )}
        </div>
      </div>

      {/* Asset library */}
      <AssetLibrary configs={configs} workspaceId={workspace.id} />

      {/* Render + gallery */}
      <RenderSection
        sceneCount={scenes.length}
        totalDuration={scenes.reduce((a, s) => a + (s.end - s.start), 0)}
        workspaceId={workspace.id}
        onProceed={() => navigate(`/w/${id}/upload`)}
      />
    </div>
  );
}

function SceneInspector({
  index,
  spokenLine,
  config,
  onChange
}: {
  index: number;
  spokenLine: string;
  config: SceneConfig;
  onChange: (p: Partial<SceneConfig>) => void;
}) {
  const suggestions = useMemo(
    () => mockStockResults(config.keywords, `:${index}:${config.seed}`),
    [config.keywords, config.seed, index]
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="accent">Scene {index + 1}</Badge>
          <p className="line-clamp-1 text-sm text-muted-foreground">{spokenLine}</p>
        </div>

        {/* Current asset */}
        <div className="grid gap-2">
          <Label>Selected asset</Label>
          {config.asset ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <img src={config.asset.thumb} alt="" className="h-16 w-10 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium capitalize">{config.asset.label}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {config.asset.kind} · {config.asset.source}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => onChange({ asset: null })}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.info('Asset upload wired in Phase 4.')}>
                <ImagePlus className="size-4" /> Upload Image
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.info('Asset upload wired in Phase 4.')}>
                <Upload className="size-4" /> Upload Video
              </Button>
            </div>
          )}
        </div>

        {/* AI suggestions */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Search keywords</Label>
            <button
              onClick={() => onChange({ seed: config.seed + 1 })}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
            >
              <RefreshCw className="size-3" /> Regenerate keywords
            </button>
          </div>
          <Input
            value={config.keywords.join(', ')}
            onChange={(e) =>
              onChange({
                keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
              })
            }
            className="h-9 text-sm"
            placeholder="underwater ruins, ancient city"
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>AI image prompt</Label>
            <button
              onClick={() => toast.info('Prompt regeneration wired with the LLM later.')}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
            >
              <Wand2 className="size-3" /> Regenerate prompt
            </button>
          </div>
          <Textarea
            value={config.imagePrompt}
            onChange={(e) => onChange({ imagePrompt: e.target.value })}
            className="min-h-[60px] font-mono text-[12px] leading-relaxed"
          />
        </div>

        {/* Stock suggestions */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Suggested assets</Label>
            <button
              onClick={() => onChange({ seed: config.seed + 1 })}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
            >
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {suggestions.map((a) => (
              <button
                key={a.id}
                onClick={() => onChange({ asset: a })}
                className={cn(
                  'group relative aspect-[9/16] overflow-hidden rounded-lg ring-1 transition',
                  config.asset?.id === a.id ? 'ring-2 ring-accent' : 'ring-border hover:ring-accent/50'
                )}
                title={`${a.kind} · ${a.source}`}
              >
                <img src={a.thumb} alt="" className="size-full object-cover" />
                {a.kind === 'video' && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5">
                    <Play className="size-3 text-white" />
                  </span>
                )}
                <span className="absolute right-1 top-1 rounded bg-black/55 px-1 text-[9px] uppercase text-white">
                  {a.source}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Scene controls */}
        <div className="grid grid-cols-3 gap-3">
          <ControlSelect label="Type" value={config.type} options={SCENE_TYPES} onChange={(v) => onChange({ type: v as VisualType })} />
          <ControlSelect label="Effect" value={config.effect} options={EFFECTS} onChange={(v) => onChange({ effect: v })} />
          <ControlSelect label="Transition" value={config.transition} options={TRANSITIONS} onChange={(v) => onChange({ transition: v })} />
        </div>
      </CardContent>
    </Card>
  );
}

function ControlSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </div>
  );
}

function AssetLibrary({
  configs,
  workspaceId
}: {
  configs: Record<number, SceneConfig>;
  workspaceId: string;
}) {
  const used = Object.values(configs)
    .map((c) => c.asset)
    .filter(Boolean) as StockAsset[];

  const images = used.filter((a) => a.kind === 'image');
  const videos = used.filter((a) => a.kind === 'video');
  const generated = Array.from({ length: 3 }).map((_, i) => ({
    id: `gen-${i}`,
    thumb: placeholderDataUri(`${workspaceId}-gen-${i}`, { ratio: '9:16', accent: true })
  }));
  const downloaded = used.filter((a) => a.source !== 'library');

  const Section = ({ items }: { items: { id: string; thumb: string }[] }) =>
    items.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>
    ) : (
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {items.map((a) => (
          <img key={a.id} src={a.thumb} alt="" className="aspect-[9/16] w-full rounded-md object-cover ring-1 ring-border" />
        ))}
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
            <TabsTrigger value="generated">Generated</TabsTrigger>
            <TabsTrigger value="downloaded">Downloaded ({downloaded.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="images">
            <Section items={images} />
          </TabsContent>
          <TabsContent value="videos">
            <Section items={videos} />
          </TabsContent>
          <TabsContent value="generated">
            <Section items={generated} />
          </TabsContent>
          <TabsContent value="downloaded">
            <Section items={downloaded} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

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
      setProgress((p) => {
        const next = Math.min(100, p + stepPct);
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
            <p className="text-xs text-muted-foreground">
              {sceneCount} scenes · {formatDuration(totalDuration)} · 1080×1920 @ 30fps
            </p>
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
              <span>
                Rendering scene {currentScene}/{sceneCount}
              </span>
              <span>~{etaSec}s remaining</span>
            </div>
          </div>
        )}

        {/* Gallery */}
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
            <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">
              Rendered videos will appear here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {renders.map((r) => (
                <RenderCard
                  key={r.id}
                  r={r}
                  onDelete={() => setRenders((prev) => prev.filter((x) => x.id !== r.id))}
                />
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
        <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
          {formatDuration(r.durationSec)}
        </span>
      </div>
      <div className="flex items-center justify-between p-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {r.resolution} · {relativeTime(r.createdAt)}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
