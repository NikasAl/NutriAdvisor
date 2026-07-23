'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Key, Zap, Eye } from 'lucide-react';
import type { LLMProvider, ProviderType } from '@/lib/types';

const PRESETS: Record<ProviderType, { name: string; baseUrl: string; model: string; supportsVision: boolean }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', supportsVision: true },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3.1:free', supportsVision: true },
  dashscope: { name: 'Alibaba DashScope', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', supportsVision: true },
  ollama: { name: 'Ollama (локальный)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', supportsVision: true },
  custom: { name: 'Пользовательский', baseUrl: '', model: '', supportsVision: false },
};

export default function SettingsPanel() {
  const providers = useAppStore((s) => s.providers);
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const loadProviders = useAppStore((s) => s.loadProviders);
  const addProvider = useAppStore((s) => s.addProvider);
  const updateProvider = useAppStore((s) => s.updateProvider);
  const deleteProvider = useAppStore((s) => s.deleteProvider);

  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Form state for add
  const initialPreset = PRESETS['openai'];
  const [newType, setNewType] = useState<ProviderType>('openai');
  const [newName, setNewName] = useState(initialPreset.name);
  const [newBaseUrl, setNewBaseUrl] = useState(initialPreset.baseUrl);
  const [newApiKey, setNewApiKey] = useState('');
  const [newModel, setNewModel] = useState(initialPreset.model);
  const [newVision, setNewVision] = useState(initialPreset.supportsVision);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleTypeChange = (type: ProviderType) => {
    setNewType(type);
    const preset = PRESETS[type];
    setNewName(preset.name);
    setNewBaseUrl(preset.baseUrl);
    setNewModel(preset.model);
    setNewVision(preset.supportsVision);
  };

  const handleAdd = async () => {
    await addProvider({
      name: newName,
      type: newType,
      baseUrl: newBaseUrl,
      apiKey: newApiKey,
      model: newModel,
      supportsVision: newVision,
      isActive: providers.length === 0,
    });
    setIsAddOpen(false);
    setNewApiKey('');
    loadProviders();
  };

  const handleSetActive = async (id: string) => {
    for (const p of providers) {
      await updateProvider(p.id, { isActive: p.id === id });
    }
    loadProviders();
  };

  const handleEditSave = async () => {
    if (!editingProvider) return;
    await updateProvider(editingProvider.id, editingProvider);
    setIsEditOpen(false);
    setEditingProvider(null);
    loadProviders();
  };

  const handleDelete = async (id: string) => {
    await deleteProvider(id);
    loadProviders();
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">LLM Провайдеры</h2>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новый провайдер LLM</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Тип провайдера</Label>
                <Select value={newType} onValueChange={(v) => handleTypeChange(v as ProviderType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRESETS).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>{preset.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Название</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input value={newBaseUrl} onChange={(e) => setNewBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
              </div>
              <div className="space-y-2">
                <Label>API Ключ</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    className="pl-9"
                    placeholder="sk-..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Модель</Label>
                <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="gpt-4o-mini" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={newVision} onCheckedChange={setNewVision} />
                <Label>Поддержка Vision (анализ фото)</Label>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Отмена</Button>
              </DialogClose>
              <Button onClick={handleAdd} disabled={!newBaseUrl || !newModel}>
                Добавить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-sm text-muted-foreground">
        Настройте провайдеры для AI-анализа. API ключи хранятся локально на устройстве.
      </p>

      <div className="space-y-3">
        {providers.map((provider) => (
          <Card
            key={provider.id}
            className={`cursor-pointer transition-all ${
              provider.id === activeProviderId
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                : 'hover:border-muted-foreground/30'
            }`}
            onClick={() => handleSetActive(provider.id)}
          >
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className={`h-4 w-4 ${provider.id === activeProviderId ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                  <CardTitle className="text-base">{provider.name}</CardTitle>
                  {provider.id === activeProviderId && (
                    <Badge variant="default" className="bg-emerald-600 text-[10px]">Активен</Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Dialog open={isEditOpen && editingProvider?.id === provider.id} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingProvider(null); }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); setEditingProvider({ ...provider }); setIsEditOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Редактировать провайдер</DialogTitle>
                      </DialogHeader>
                      {editingProvider && (
                        <div className="space-y-4 py-2">
                          <div className="space-y-2">
                            <Label>Название</Label>
                            <Input
                              value={editingProvider.name}
                              onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Base URL</Label>
                            <Input
                              value={editingProvider.baseUrl}
                              onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>API Ключ</Label>
                            <Input
                              type="password"
                              value={editingProvider.apiKey}
                              onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                              placeholder="sk-..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Модель</Label>
                            <Input
                              value={editingProvider.model}
                              onChange={(e) => setEditingProvider({ ...editingProvider, model: e.target.value })}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={editingProvider.supportsVision}
                              onCheckedChange={(v) => setEditingProvider({ ...editingProvider, supportsVision: v })}
                            />
                            <Label>Поддержка Vision</Label>
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Отмена</Button>
                        </DialogClose>
                        <Button onClick={handleEditSave}>Сохранить</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить провайдер?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Провайдер &quot;{provider.name}&quot; будет удалён.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(provider.id)} className="bg-destructive text-destructive-foreground">
                          Удалить
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-mono">{provider.model}</Badge>
                <Badge variant="outline">{provider.type}</Badge>
                {provider.supportsVision && (
                  <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" /> Vision</Badge>
                )}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/60">
                {provider.apiKey ? '••••••••' + provider.apiKey.slice(-4) : 'Ключ не указан'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
