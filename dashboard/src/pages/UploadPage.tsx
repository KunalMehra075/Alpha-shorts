import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Facebook,
  Film,
  Globe,
  Image as ImageIcon,
  Instagram,
  Loader2,
  Lock,
  Pencil,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { TabHeader } from '@/components/TabHeader';
import { cn, libraryUrl } from '@/lib/utils';
import {
  useGenerateSeo,
  useGenerateThumbnail,
  useImageGenStatus,
  useLibrary,
  useMediaLibrary,
  usePublishYoutube,
  useRenders,
  useSaveUpload,
  useThumbnailFromAsset,
  useThumbnailFromFrame,
  useUpload,
  useUploadThumbnail,
  useYoutubeStatus
} from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import type { LibraryItem, MediaItem, SeoSuggestions } from '@/lib/types';

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
  const [showThumb, setShowThumb] = useState(true);
  const [thumbOpen, setThumbOpen] = useState(false);

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
  const thumb = upload?.thumbnail ?? null;
  const thumbUrl = thumb?.file ? `/media/${id}/${thumb.file}?v=${thumb.sizeBytes}` : null;
  const frameThumb = useThumbnailFromFrame(id);

  // Auto-default: when there's a render but no thumbnail yet, grab a random
  // frame from the video and use it. Runs once per mount; failures are silent
  // (e.g. ffmpeg missing) so we don't spam.
  const frameTriedRef = useRef(false);
  useEffect(() => {
    if (!upload) return; // wait for server state so we don't double-fire
    if (frameTriedRef.current) return;
    if (thumb?.file) return;
    if (!hasRender) return;
    frameTriedRef.current = true;
    frameThumb.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload, thumb?.file, hasRender]);

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
              <div className="flex items-center justify-between">
                <Label>{showThumb ? 'Thumbnail' : 'Video preview'}</Label>
                <button
                  type="button"
                  onClick={() => setShowThumb((s) => !s)}
                  aria-pressed={showThumb}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    showThumb
                      ? 'border-accent/60 bg-accent/15 text-accent'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {showThumb ? 'video' : 'thumbnail'}
                </button>
              </div>

              {showThumb ? (
                thumbUrl ? (
                  <button
                    type="button"
                    onClick={() => setThumbOpen(true)}
                    title="Change thumbnail"
                    className="group relative mx-auto block aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-lg border border-border bg-black"
                  >
                    <img
                      key={thumbUrl}
                      src={thumbUrl}
                      alt="Thumbnail"
                      className="size-full object-contain"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex size-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-sm">
                        <Pencil className="size-5 text-white" />
                      </span>
                    </span>
                  </button>
                ) : frameThumb.isPending ? (
                  <div className="mx-auto flex aspect-[9/16] w-full max-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                    <Loader2 className="size-7 animate-spin text-muted-foreground" />
                    <p className="text-sm font-medium">Generating thumbnail…</p>
                    <p className="text-xs text-muted-foreground">Grabbing a frame from your video.</p>
                  </div>
                ) : hasRender ? (
                  <button
                    type="button"
                    onClick={() => setThumbOpen(true)}
                    className="group mx-auto flex aspect-[9/16] w-full max-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center transition hover:bg-muted/50"
                  >
                    <span className="flex size-11 items-center justify-center rounded-full bg-muted">
                      <Pencil className="size-5 text-muted-foreground" />
                    </span>
                    <p className="text-sm font-medium">Add a thumbnail</p>
                    <p className="text-xs text-muted-foreground">Click to choose or import one.</p>
                  </button>
                ) : (
                  <div className="mx-auto flex aspect-[9/16] w-full max-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                    <ImageIcon className="size-7 text-muted-foreground" />
                    <p className="text-sm font-medium">No thumbnail</p>
                    <p className="text-xs text-muted-foreground">Render a video first to set one.</p>
                  </div>
                )
              ) : renderUrl ? (
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
                  <Suggestions
                  items={seo.titles}
                  onPick={(t) => {
                    setTitle(t);
                    markDirty();
                  }}
                />
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
                  <Suggestions
                  items={seo.descriptions}
                  onPick={(d) => {
                    setDescription(d);
                    markDirty();
                  }}
                  truncate
                />
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
                  {yt.thumbnailWarning && (
                    <p className="max-w-md rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                      Video published, but the custom thumbnail wasn’t applied: {yt.thumbnailWarning}
                    </p>
                  )}
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

      {thumbOpen && (
        <ThumbnailPicker
          id={id}
          renderUrl={renderUrl}
          title={title}
          onClose={() => setThumbOpen(false)}
          onPicked={() => setShowThumb(true)}
        />
      )}
    </div>
  );
}

function ThumbnailPicker({
  id,
  renderUrl,
  title,
  onClose,
  onPicked
}: {
  id: string;
  renderUrl: string | null;
  title: string;
  onClose: () => void;
  onPicked: () => void;
}) {
  const { data: library } = useLibrary(id);
  const { data: gImages } = useMediaLibrary('image');
  const fromAsset = useThumbnailFromAsset(id);
  const uploadThumb = useUploadThumbnail(id);
  const frameThumb = useThumbnailFromFrame(id);
  const genThumb = useGenerateThumbnail(id);
  const { data: imageGen } = useImageGenStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [aiPrompt, setAiPrompt] = useState(title || '');

  const generate = async () => {
    if (!aiPrompt.trim()) return;
    try {
      await genThumb.mutateAsync(aiPrompt.trim());
      toast.success('Thumbnail generated');
      onPicked();
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  // "Choose frame" tab: scrub the rendered video and grab the shown frame.
  const frameVideoRef = useRef<HTMLVideoElement>(null);
  const [frameDur, setFrameDur] = useState(0);
  const [frameAt, setFrameAt] = useState(0);

  const seekFrame = (t: number) => {
    setFrameAt(t);
    const v = frameVideoRef.current;
    if (v && isFinite(v.duration)) v.currentTime = Math.min(t, Math.max(0, v.duration - 0.05));
  };

  const useFrame = async () => {
    try {
      await frameThumb.mutateAsync(frameAt);
      toast.success('Thumbnail set from frame');
      onPicked();
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const wsImages = (library ?? []).filter((m) => m.kind === 'image');
  const q = search.trim().toLowerCase();
  const filtWs = wsImages.filter((m) => !q || m.name.toLowerCase().includes(q));
  const filtGlobal = (gImages ?? []).filter((m) => !q || m.name.toLowerCase().includes(q));
  const busy = fromAsset.isPending || uploadThumb.isPending;

  const pickAsset = async (source: 'library' | 'global', itemId: string) => {
    try {
      await fromAsset.mutateAsync({ source, itemId });
      toast.success('Thumbnail set');
      onPicked();
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      await uploadThumb.mutateAsync(file);
      toast.success('Thumbnail set');
      onPicked();
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const Grid = ({
    items,
    src,
    onPick,
    empty
  }: {
    items: (LibraryItem | MediaItem)[];
    src: (m: LibraryItem | MediaItem) => string;
    onPick: (m: LibraryItem | MediaItem) => void;
    empty: string;
  }) =>
    items.length === 0 ? (
      <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      <div className="grid max-h-[44vh] grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-4">
        {items.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m)}
            disabled={busy}
            title={`${m.name} — use as thumbnail`}
            className="group relative aspect-video overflow-hidden rounded-lg ring-1 ring-border transition hover:ring-2 hover:ring-accent disabled:opacity-60"
          >
            <img src={src(m)} alt="" className="size-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change thumbnail</DialogTitle>
          <DialogDescription>
            Pick an image from your assets, generate one, or import from your computer. JPG/PNG,
            up to 2 MB (1280×720 recommended).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={renderUrl ? 'frame' : 'asset'} className="mt-1">
          <TabsList>
            <TabsTrigger value="frame">Choose frame</TabsTrigger>
            <TabsTrigger value="asset">From asset</TabsTrigger>
            <TabsTrigger value="ai">Generate with AI</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="frame" className="flex flex-col gap-3">
            {!renderUrl ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Render a video in the Video Editor first to choose a frame.
              </p>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <video
                  ref={frameVideoRef}
                  src={renderUrl}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (isFinite(d)) {
                      setFrameDur(d);
                      // Start at ~10% in (skip intro fade), mirroring the auto-default.
                      seekFrame(Math.min(d * 0.1, Math.max(0, d - 0.05)));
                    }
                  }}
                  className="aspect-[9/16] max-h-[44vh] rounded-lg border border-border bg-black object-contain"
                />
                <div className="w-full max-w-sm">
                  <input
                    type="range"
                    min={0}
                    max={frameDur || 0}
                    step={0.05}
                    value={frameAt}
                    onChange={(e) => seekFrame(Number(e.target.value))}
                    className="w-full accent-[hsl(var(--accent))]"
                  />
                  <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
                    <span>{frameAt.toFixed(1)}s</span>
                    <span>{frameDur ? `${frameDur.toFixed(1)}s` : '—'}</span>
                  </div>
                </div>
                <Button variant="primary" size="sm" disabled={frameThumb.isPending} onClick={useFrame}>
                  {frameThumb.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Setting…
                    </>
                  ) : (
                    <>
                      <ImageIcon className="size-4" /> Use this frame
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="asset" className="flex flex-col gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search images…"
              className="h-9"
            />
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Workspace library ({filtWs.length})
              </p>
              <Grid
                items={filtWs}
                src={(m) => `/media/${id}/${m.file}`}
                onPick={(m) => pickAsset('library', m.id)}
                empty="No images in this workspace’s library."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Global library ({filtGlobal.length})
              </p>
              <Grid
                items={filtGlobal}
                src={(m) => libraryUrl(m.file)}
                onPick={(m) => pickAsset('global', m.id)}
                empty="No global images — add some on the Assets page."
              />
            </div>
          </TabsContent>

          <TabsContent value="ai" className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4" /> Describe the thumbnail — generated in 9:16, added as
              your thumbnail.
            </div>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. dramatic close-up of an ancient temple at golden hour, bold cinematic lighting"
              className="min-h-[100px] text-sm"
            />
            {imageGen && !imageGen.available ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                Image generation isn’t configured. Add <code>GEMINI_API_KEY</code> (or{' '}
                <code>OPENAI_API_KEY</code>) to <code>.env</code> and restart.
              </p>
            ) : (
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!aiPrompt.trim() || genThumb.isPending || !imageGen?.available}
                  onClick={generate}
                >
                  {genThumb.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" /> Generate
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="import">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
              <UploadIcon className="size-7 text-muted-foreground" />
              <p className="text-sm font-medium">Import from your computer</p>
              <p className="max-w-sm text-xs text-muted-foreground">JPG or PNG, up to 2 MB.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? undefined)}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="mt-1"
              >
                {uploadThumb.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <UploadIcon className="size-4" /> Choose file
                  </>
                )}
              </Button>
            </div>
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
