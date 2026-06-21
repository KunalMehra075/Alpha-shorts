import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  History,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Wand2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { relativeTime } from '@/lib/utils';
import {
  useCreateTemplate,
  useGenerateScript,
  useRestoreScript,
  useSaveScript,
  useScript,
  useScriptVersions,
  useTemplates
} from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';

export function ScriptPage() {
  const { workspace, id } = useWorkspaceCtx();
  const navigate = useNavigate();
  const { data: script, isLoading } = useScript(id);

  const generate = useGenerateScript(id);
  const save = useSaveScript(id);
  const { data: templates } = useTemplates();

  const [prompt, setPrompt] = useState('');
  const [topic, setTopic] = useState('');
  const [voiceover, setVoiceover] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);

  // Load draft from server whenever the active version changes.
  useEffect(() => {
    if (script) {
      setVoiceover(script.voiceoverScript);
      if (script.topic) setTopic(script.topic);
      if (script.promptUsed) setPrompt(script.promptUsed);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.version, script?.createdAt]);

  // Debounced autosave of manual edits.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || !script) return;
    const handle = setTimeout(async () => {
      try {
        await saveRef.current.mutateAsync({ voiceoverScript: voiceover, topic, promptUsed: prompt });
        setDirty(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch (e: any) {
        toast.error(`Autosave failed: ${e.message ?? e}`);
      }
    }, 900);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceover, dirty]);

  const markDirty = () => setDirty(true);

  const runGenerate = async () => {
    try {
      const sv = await generate.mutateAsync({ topic, prompt, language: workspace.language });
      toast.success(
        sv.mock ? 'Script generated (mock fallback)' : `Script generated via ${sv.provider}`
      );
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const hasScript = !!script;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Script Generator</h2>
          {script?.provider &&
            (script.mock ? (
              <Badge variant="outline">mock fallback</Badge>
            ) : (
              <Badge variant="accent" className="capitalize">
                {script.provider}
              </Badge>
            ))}
          <SaveIndicator dirty={dirty} saving={save.isPending} flash={savedFlash} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="size-4" /> Versions
            {workspace.script.versions.length > 0 && (
              <Badge variant="default" className="ml-1">
                {workspace.script.versions.length}
              </Badge>
            )}
          </Button>
          <StatusBadge status={workspace.stages.script.status} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Left: prompt + topic + generate */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt">AI Prompt</Label>
                <Select
                  className="h-8 w-44 text-xs"
                  value=""
                  onChange={(e) => {
                    const tpl = templates?.find((t) => t.id === e.target.value);
                    if (tpl) {
                      setPrompt(tpl.body);
                      markDirty();
                      toast.success(`Loaded "${tpl.name}"`);
                    }
                  }}
                >
                  <option value="">Load template…</option>
                  {(templates ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  markDirty();
                }}
                placeholder="Describe how the AI should write your script…"
                className="min-h-[200px] text-[13px] leading-relaxed"
              />
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setSaveTplOpen(true)}
                disabled={!prompt.trim()}
              >
                <Save className="size-4" /> Save as template
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="grid gap-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. Dwarka Mystery"
                  onKeyDown={(e) => e.key === 'Enter' && topic.trim() && runGenerate()}
                />
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={runGenerate}
                disabled={!topic.trim() || generate.isPending}
                className="w-full"
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" /> {hasScript ? 'Regenerate Script' : 'Generate Script'}
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Uses DeepSeek, then OpenAI. Each run saves a new version.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: voiceover + scenes */}
        <div className="flex flex-col gap-5">
          {isLoading ? (
            <Card className="h-64 animate-pulse bg-muted/30" />
          ) : !hasScript ? (
            <EmptyScript />
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="voiceover">Voiceover Script</Label>
                    <span className="text-xs text-muted-foreground">
                      {voiceover.trim() ? `${voiceover.trim().split(/\s+/).length} words` : 'empty'}
                    </span>
                  </div>
                  <Textarea
                    id="voiceover"
                    value={voiceover}
                    onChange={(e) => {
                      setVoiceover(e.target.value);
                      markDirty();
                    }}
                    className="min-h-[320px] text-sm leading-relaxed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Just the narration. The scene-by-scene visual breakdown is built (and editable) in
                    the <span className="font-medium text-foreground">Assets</span> step — from this
                    script, or from your audio's transcript if you skip this step.
                  </p>
                  <div className="flex justify-end">
                    <Button variant="primary" size="sm" onClick={() => navigate(`/w/${id}/audio`)}>
                      Proceed to Audio <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} id={id} />
      <SaveTemplateDialog open={saveTplOpen} onOpenChange={setSaveTplOpen} body={prompt} />
    </div>
  );
}

function SaveIndicator({ dirty, saving, flash }: { dirty: boolean; saving: boolean; flash: boolean }) {
  if (saving) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Saving…</span>;
  if (flash) return <span className="flex items-center gap-1 text-xs text-accent"><Check className="size-3" /> Saved</span>;
  if (dirty) return <span className="text-xs text-muted-foreground">Unsaved changes…</span>;
  return null;
}

function EmptyScript() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Sparkles className="size-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-base font-semibold">No script yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a topic and click Generate to write your voiceover script. (Optional — you can also
            skip this and upload your own audio in the next step.)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryDialog({
  open,
  onOpenChange,
  id
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  id: string;
}) {
  const { data: versions } = useScriptVersions(id);
  const restore = useRestoreScript(id);

  const doRestore = async (version: number) => {
    try {
      await restore.mutateAsync(version);
      toast.success(`Restored Version ${version}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Script versions</DialogTitle>
          <DialogDescription>Every generation is saved. Restore any version.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          {(versions?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...(versions ?? [])].reverse().map((v) => (
                <li
                  key={v.version}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{v.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.topic || 'No topic'} · {relativeTime(v.createdAt)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => doRestore(v.version)}>
                    <RotateCcw className="size-3.5" /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  body
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  body: string;
}) {
  const create = useCreateTemplate();
  const [name, setName] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), body });
      toast.success('Template saved');
      setName('');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), !o && setName(''))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>Reuse this prompt across workspaces.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Template name (e.g. Anime Facts Prompt)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
