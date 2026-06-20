import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { qk, useTemplates } from '@/lib/queries';
import type { PromptTemplate } from '@/lib/types';

export function TemplatesPage() {
  const qc = useQueryClient();
  const { data: templates } = useTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = templates?.find((t) => t.id === selectedId) ?? null;

  // Auto-select the first template once loaded.
  useEffect(() => {
    if (!selectedId && templates && templates.length) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setBody(selected.body);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => qc.invalidateQueries({ queryKey: qk.templates });

  const create = async () => {
    try {
      const tpl = await api.createTemplate('New Template', '');
      await refresh();
      setSelectedId(tpl.id);
      toast.success('Template created');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.updateTemplate(selected.id, { name, body });
      await refresh();
      toast.success('Saved');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tpl: PromptTemplate) => {
    try {
      await api.deleteTemplate(tpl.id);
      await refresh();
      if (selectedId === tpl.id) setSelectedId(null);
      toast.success('Deleted');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Prompt Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable AI prompts you can load into any workspace's Script Generator.
          </p>
        </div>
        <Button variant="primary" onClick={create}>
          <Plus className="size-4" /> New Template
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* List */}
        <Card>
          <CardContent className="p-2">
            {(templates?.length ?? 0) === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No templates yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {templates!.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        selectedId === t.id ? 'bg-accent/15 text-accent' : 'hover:bg-muted'
                      )}
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card>
          <CardContent className="p-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <FileText className="size-7" />
                <p className="text-sm">Select or create a template to edit.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="tpl-name">Name</Label>
                  <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tpl-body">Prompt</Label>
                  <Textarea
                    id="tpl-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[260px] font-mono text-[13px] leading-relaxed"
                    placeholder="Write the AI prompt used to generate scripts…"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" className="text-destructive" onClick={() => remove(selected)}>
                    <Trash2 className="size-4" /> Delete
                  </Button>
                  <Button variant="primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
