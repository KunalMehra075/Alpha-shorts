import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Facebook,
  Film,
  Globe,
  Instagram,
  Loader2,
  Lock,
  Play,
  Plus,
  Sparkles,
  Twitter,
  Upload as UploadIcon,
  Youtube,
  EyeOff,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TabHeader } from '@/components/TabHeader';
import { cn } from '@/lib/utils';
import {
  useGenerateSeo,
  usePublishYoutube,
  useRenders,
  useSaveUpload,
  useUpload,
  useYoutubeStatus
} from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import type { SeoSuggestions } from '@/lib/types';

type Visibility = 'public' | 'unlisted' | 'private';

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', icon: Youtube, available: true },
  { id: 'instagram', name: 'Instagram', icon: Instagram, available: false },
  { id: 'facebook', name: 'Facebook', icon: Facebook, available: false },
  { id: 'tiktok', name: 'TikTok', icon: Play, available: false },
  { id: 'x', name: 'X', icon: Twitter, available: false }
] as const;

const VISIBILITY: { id: Visibility; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { id: 'public', label: 'Public', icon: Globe, hint: 'Anyone can watch' },
  { id: 'unlisted', label: 'Unlisted', icon: EyeOff, hint: 'Only with the link' },
  { id: 'private', label: 'Private', icon: Lock, hint: 'Only you' }
];

export function UploadPage() {
  const { workspace, id } = useWorkspaceCtx();
  const saveUpload = useSaveUpload(id);
  const genSeoMut = useGenerateSeo(id);

  const [platform, setPlatform] = useState(workspace.upload.platform || 'youtube');
  const [visibility, setVisibility] = useState<Visibility>(workspace.upload.visibility);
  const [title, setTitle] = useState(workspace.upload.title);
  const [description, setDescription] = useState(workspace.upload.description);
  const [tags, setTags] = useState<string[]>(workspace.upload.tags);
  const [tagInput, setTagInput] = useState('');
  const [seo, setSeo] = useState<SeoSuggestions | null>(null);
  const [dirty, setDirty] = useState(false);

  // Seed from the server's upload metadata once (reflects the public-default
  // backfill for untouched workspaces).
  const { data: upload } = useUpload(id);
  const seededRef = useRef(false);
  useEffect(() => {
    if (!upload || seededRef.current) return;
    setPlatform(upload.platform);
    setVisibility(upload.visibility);
    setTitle(upload.title);
    setDescription(upload.description);
    setTags(upload.tags);
    seededRef.current = true;
  }, [upload]);

  const { data: yt } = useYoutubeStatus(id);
  const { data: renders = [] } = useRenders(id);
  const publishMut = usePublishYoutube(id);
  const completedRender = renders.find((r) => r.status === 'completed' && r.file) ?? null;
  const hasRender = !!completedRender;
  const configured = yt?.configured ?? false;
  const renderUrl = completedRender
    ? `/media/${id}/${completedRender.file}?v=${completedRender.sizeBytes}`
    : null;

  // Debounced persistence of the metadata to the manifest.
  const saveRef = useRef(saveUpload);
  saveRef.current = saveUpload;
  useEffect(() => {
    if (!dirty) return;
    const h = setTimeout(() => {
      saveRef.current.mutate({ platform, visibility, title, description, tags });
      setDirty(false);
    }, 800);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, visibility, title, description, tags, dirty]);
  const markDirty = () => setDirty(true);

  const addTag = (t: string) => {
    const v = t.trim().replace(/,$/, '');
    if (v && !tags.includes(v)) {
      setTags((p) => [...p, v]);
      markDirty();
    }
    setTagInput('');
  };

  const genSeo = async () => {
    try {
      const r = await genSeoMut.mutateAsync();
      setSeo(r);
      toast.success(r.mock ? 'SEO suggestions (mock fallback)' : `SEO via ${r.provider}`);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const publish = async () => {
    if (!configured) {
      return toast.error(
        'YouTube is not connected — add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN to .env, then restart the server.'
      );
    }
    if (!hasRender) return toast.error('Render a video in the Video Editor first.');
    if (!title.trim()) return toast.error('Add a title first.');
    // Flush any pending metadata edits so the upload uses the latest values.
    if (dirty) {
      saveUpload.mutate({ platform, visibility, title, description, tags });
      setDirty(false);
    }
    try {
      await publishMut.mutateAsync();
      toast.success('Upload started');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={UploadIcon}
        title="Video Uploader"
        description="Prepare SEO and publish your Short."
        status={workspace.stages.upload.status}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Left: preview + targets + visibility */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <Label>Video preview</Label>
              {renderUrl ? (
                <video
                  key={renderUrl}
                  src={renderUrl}
                  controls
                  playsInline
                  className="mx-auto aspect-[9/16] w-full max-w-[280px] rounded-lg border border-border bg-black object-contain"
                />
              ) : (
                <div className="mx-auto flex aspect-[9/16] w-full max-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                  <Film className="size-7 text-muted-foreground" />
                  <p className="text-sm font-medium">No render yet</p>
                  <p className="text-xs text-muted-foreground">Render a video in the Video Editor.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <Label>Platform</Label>
              <div className="grid grid-cols-1 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    disabled={!p.available}
                    onClick={() => {
                      setPlatform(p.id);
                      markDirty();
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      !p.available && 'cursor-not-allowed opacity-55',
                      platform === p.id ? 'border-accent/50 bg-accent/10' : 'border-border hover:bg-muted'
                    )}
                  >
                    <p.icon className="size-5" />
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.available ? (
                      platform === p.id && <Check className="ml-auto size-4 text-accent" />
                    ) : (
                      <Badge variant="default" className="ml-auto">
                        soon
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled
                title="Multi-platform posting comes later"
              >
                Post to all platforms
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <Label>Visibility</Label>
              <div className="grid gap-2">
                {VISIBILITY.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setVisibility(v.id);
                      markDirty();
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                      visibility === v.id ? 'border-accent/50 bg-accent/10' : 'border-border hover:bg-muted'
                    )}
                  >
                    <v.icon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{v.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{v.hint}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: SEO + AI + publish */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">SEO & metadata</h3>
                <Button variant="secondary" size="sm" onClick={genSeo} disabled={genSeoMut.isPending}>
                  {genSeoMut.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" /> AI suggestions
                    </>
                  )}
                </Button>
              </div>

              {/* Title */}
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="title">Title</Label>
                  <span className="text-xs text-muted-foreground">{title.length}/100</span>
                </div>
                <Input
                  id="title"
                  maxLength={100}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    markDirty();
                  }}
                  placeholder="An attention-grabbing title…"
                />
                {seo && (
                  <Suggestions items={seo.titles} onPick={(t) => setTitle(t)} />
                )}
              </div>

              {/* Description */}
              <div className="grid gap-1.5">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    markDirty();
                  }}
                  className="min-h-[110px] text-sm"
                  placeholder="Describe your video…"
                />
                {seo && (
                  <Suggestions items={seo.descriptions} onPick={(d) => setDescription(d)} truncate />
                )}
              </div>

              {/* Tags */}
              <div className="grid gap-1.5">
                <Label htmlFor="tags">Tags</Label>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-input p-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {t}
                      <button
                        onClick={() => {
                          setTags((p) => p.filter((x) => x !== t));
                          markDirty();
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder={tags.length ? '' : 'Add tags (Enter)…'}
                    className="flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {seo && (
                  <div className="flex flex-wrap gap-1.5">
                    {seo.tags
                      .filter((t) => !tags.includes(t))
                      .map((t) => (
                        <button
                          key={t}
                          onClick={() => addTag(t)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                        >
                          <Plus className="size-3" /> {t}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Publish */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              {yt?.status === 'completed' && yt.url ? (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <CircleCheck className="size-10 text-accent" />
                  <div>
                    <p className="text-base font-semibold">Published to YouTube</p>
                    <p className="text-sm text-muted-foreground">Your Short is live ({visibility}).</p>
                  </div>
                  <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-border p-2">
                    <span className="truncate px-2 text-sm">{yt.url}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-8"
                      onClick={() => {
                        navigator.clipboard?.writeText(yt.url!);
                        toast.success('Link copied');
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" asChild>
                      <a href={yt.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  </div>
                  <Button variant="secondary" size="sm" onClick={publish} disabled={publishMut.isPending}>
                    Publish again
                  </Button>
                </div>
              ) : yt?.status === 'uploading' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Uploading to YouTube…</span>
                    <span className="text-muted-foreground">{yt.progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${Math.max(3, yt.progress)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={publish}
                    disabled={publishMut.isPending}
                  >
                    <UploadIcon className="size-4" /> Publish to YouTube
                  </Button>
                  {!configured && (
                    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Youtube className="size-4 text-muted-foreground" /> YouTube not connected
                      </div>
                      <p className="max-w-md text-xs text-muted-foreground">
                        Add <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and{' '}
                        <code>GOOGLE_REFRESH_TOKEN</code> to the project <code>.env</code>, then restart
                        the server.
                      </p>
                    </div>
                  )}
                  {configured && !hasRender && (
                    <p className="text-center text-[11px] text-muted-foreground">
                      Render a video in the Video Editor first — the latest render gets uploaded.
                    </p>
                  )}
                  {yt?.status === 'failed' && yt.error && (
                    <p className="text-center text-[11px] text-destructive">Last attempt failed: {yt.error}</p>
                  )}
                </>
              )}
              <p className="text-center text-[11px] text-muted-foreground">
                Uploads the latest completed render with the metadata above, at the chosen visibility.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Suggestions({
  items,
  onPick,
  truncate
}: {
  items: string[];
  onPick: (v: string) => void;
  truncate?: boolean;
}) {
  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2">
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Suggestions
      </p>
      {items.map((s, i) => (
        <button
          key={i}
          onClick={() => onPick(s)}
          className="group flex items-start gap-2 rounded-md p-1.5 text-left text-sm hover:bg-card"
        >
          <Plus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-accent" />
          <span className={cn('text-foreground/90', truncate && 'line-clamp-2')}>{s}</span>
        </button>
      ))}
    </div>
  );
}
