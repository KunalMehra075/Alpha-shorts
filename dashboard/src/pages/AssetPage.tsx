import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Film,
  Images,
  ImagePlus,
  Play,
  RefreshCw,
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TabHeader } from '@/components/TabHeader';
import { cn } from '@/lib/utils';
import { useScript } from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import { mockStockResults, type StockAsset } from '@/lib/mockMedia';
import { placeholderDataUri } from '@/lib/placeholder';
import { useEditorStore, useWorkspaceEditor, type SceneAsset } from '@/lib/editorStore';

export function AssetPage() {
  const { workspace, id } = useWorkspaceCtx();
  const navigate = useNavigate();
  const { data: script } = useScript(id);
  const scenes = script?.scenes ?? [];

  const editor = useWorkspaceEditor(id);
  const ensureAssets = useEditorStore((s) => s.ensureAssets);
  const setAsset = useEditorStore((s) => s.setAsset);
  const setKeywords = useEditorStore((s) => s.setKeywords);
  const setImagePrompt = useEditorStore((s) => s.setImagePrompt);
  const bumpSeed = useEditorStore((s) => s.bumpSeed);

  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (scenes.length) ensureAssets(id, scenes);
  }, [id, scenes, ensureAssets]);

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

  const sel = editor.assets[selected];
  const assignedCount = scenes.filter((_, i) => editor.assets[i]?.selected).length;

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={Images}
        title="Assets"
        description="Gather and assign a visual to every scene."
        status={workspace.stages.assets.status}
        actions={
          <Badge variant="outline" title="UI preview — real stock search/upload wired later">
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
                    const a = editor.assets[i];
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
                            {(a?.keywords ?? []).slice(0, 3).map((k) => (
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
                          {a?.selected ? (
                            <img
                              src={a.selected.thumb}
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
              asset={sel}
              onSelect={(a) => setAsset(id, selected, a)}
              onKeywords={(k) => setKeywords(id, selected, k)}
              onPrompt={(p) => setImagePrompt(id, selected, p)}
              onRefresh={() => bumpSeed(id, selected)}
            />
          )}
        </div>
      </div>

      {/* Asset library */}
      <AssetLibrary assets={editor.assets} workspaceId={workspace.id} />

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
  index,
  spokenLine,
  asset,
  onSelect,
  onKeywords,
  onPrompt,
  onRefresh
}: {
  index: number;
  spokenLine: string;
  asset: SceneAsset;
  onSelect: (a: StockAsset | null) => void;
  onKeywords: (k: string[]) => void;
  onPrompt: (p: string) => void;
  onRefresh: () => void;
}) {
  const suggestions = useMemo(
    () => mockStockResults(asset.keywords, `:${index}:${asset.seed}`),
    [asset.keywords, asset.seed, index]
  );

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
        <div className="grid gap-2">
          <Label>Selected asset</Label>
          {asset.selected ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <img src={asset.selected.thumb} alt="" className="h-16 w-10 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium capitalize">{asset.selected.label}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {asset.selected.kind} · {asset.selected.source}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => onSelect(null)}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.info('Upload wired with real assets later.')}>
                <ImagePlus className="size-4" /> Upload Image
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.info('Upload wired with real assets later.')}>
                <Upload className="size-4" /> Upload Video
              </Button>
            </div>
          )}
        </div>

        {/* Keywords */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Search keywords</Label>
            <button onClick={onRefresh} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent">
              <RefreshCw className="size-3" /> Refresh suggestions
            </button>
          </div>
          <Input
            value={asset.keywords.join(', ')}
            onChange={(e) => onKeywords(e.target.value.split(',').map((k) => k.trim()).filter(Boolean))}
            className="h-9 text-sm"
            placeholder="underwater ruins, ancient city"
          />
        </div>

        {/* Image prompt */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>AI image prompt</Label>
            <button
              onClick={() => toast.info('AI image generation comes in a later round.')}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
            >
              <Wand2 className="size-3" /> Generate
            </button>
          </div>
          <Textarea
            value={asset.imagePrompt}
            onChange={(e) => onPrompt(e.target.value)}
            className="min-h-[60px] font-mono text-[12px] leading-relaxed"
          />
        </div>

        {/* Suggestions */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Suggested assets</Label>
            <button onClick={onRefresh} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent">
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {suggestions.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a)}
                className={cn(
                  'group relative aspect-[9/16] overflow-hidden rounded-lg ring-1 transition',
                  asset.selected?.id === a.id ? 'ring-2 ring-accent' : 'ring-border hover:ring-accent/50'
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
      </CardContent>
    </Card>
  );
}

function AssetLibrary({
  assets,
  workspaceId
}: {
  assets: Record<number, SceneAsset>;
  workspaceId: string;
}) {
  const used = Object.values(assets)
    .map((a) => a.selected)
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
