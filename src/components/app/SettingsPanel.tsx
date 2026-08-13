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
import { Plus, Trash2, Pencil, Key, Zap, Eye, Loader2, CheckCircle2, XCircle, Wifi, Download, Upload, X, ListChecks, Share2, Sun, Moon, Monitor } from 'lucide-react';
import type { LLMProvider, ProviderType } from '@/lib/types';
import { testProvider } from '@/lib/llm-client';
import { db } from '@/lib/db';
import { isNativePlatform } from '@/lib/nativeHttp';

const PRESETS: Record<ProviderType, { name: string; baseUrl: string; model: string; supportsVision: boolean; needsKey: boolean }> = {
  nuadvi: { name: 'NuAdvi Proxy', baseUrl: 'https://kreagenium.ru/nuadvi/v1', model: 'gemma-4', supportsVision: false, needsKey: false },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', supportsVision: true, needsKey: true },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3.1:free', supportsVision: true, needsKey: true },
  dashscope: { name: 'Alibaba DashScope', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', supportsVision: true, needsKey: true },
  ollama: { name: 'Ollama (локальный)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', supportsVision: true, needsKey: false },
  llamacpp: { name: 'llama.cpp server', baseUrl: 'http://localhost:8080/v1', model: 'gpt-4o-mini', supportsVision: false, needsKey: false },
  custom: { name: 'Пользовательский', baseUrl: '', model: '', supportsVision: false, needsKey: false },
};

export default function SettingsPanel() {
  const providers = useAppStore((s) => s.providers);
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const loadProviders = useAppStore((s) => s.loadProviders);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const loadDiaryEntries = useAppStore((s) => s.loadDiaryEntries);
  const loadFoodProducts = useAppStore((s) => s.loadFoodProducts);
  const loadDishes = useAppStore((s) => s.loadDishes);
  const loadCustomGoals = useAppStore((s) => s.loadCustomGoals);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const loadWaterLog = useAppStore((s) => s.loadWaterLog);
  const addProvider = useAppStore((s) => s.addProvider);
  const updateProvider = useAppStore((s) => s.updateProvider);
  const deleteProvider = useAppStore((s) => s.deleteProvider);

  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Test provider state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ providerId: string; ok: boolean; message: string } | null>(null);

  // Export / Import state
  const [exportStatus, setExportStatus] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Form state for add
  const initialPreset = PRESETS['openai'];
  const [newType, setNewType] = useState<ProviderType>('openai');
  const [newName, setNewName] = useState(initialPreset.name);
  const [newBaseUrl, setNewBaseUrl] = useState(initialPreset.baseUrl);
  const [newApiKey, setNewApiKey] = useState('');
  const [newModel, setNewModel] = useState(initialPreset.model);
  const [newModels, setNewModels] = useState<string[]>([]);
  const [newVision, setNewVision] = useState(initialPreset.supportsVision);

  const needsKey = PRESETS[newType]?.needsKey ?? false;

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleTypeChange = (type: ProviderType) => {
    setNewType(type);
    const preset = PRESETS[type];
    setNewName(preset.name);
    setNewBaseUrl(preset.baseUrl);
    setNewModel(preset.model);
    setNewModels([]);
    setNewVision(preset.supportsVision);
    if (preset.needsKey) {
      // Keep existing key if user already typed one
    } else {
      setNewApiKey('');
    }
  };

  const handleAdd = async () => {
    await addProvider({
      name: newName,
      type: newType,
      baseUrl: newBaseUrl,
      apiKey: newApiKey,
      model: newModel,
      models: newModels.length > 0 ? newModels : undefined,
      supportsVision: newVision,
      isActive: providers.length === 0,
    });
    setIsAddOpen(false);
    setNewApiKey('');
    setNewModels([]);
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

  const handleTest = async (provider: LLMProvider) => {
    setTestingId(provider.id);
    setTestResult(null);
    const result = await testProvider(provider);
    setTestResult({ providerId: provider.id, ...result });
    setTestingId(null);
  };

  const handleExport = async () => {
    setExportStatus('Экспорт...');
    try {
      const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        app: 'NutriAdvisor',
        providers: await db.providers.toArray(),
        userProfile: await db.userProfile.toArray(),
        foodEntries: await db.foodEntries.toArray(),
        chatSessions: await db.chatSessions.toArray(),
        chatMessages: await db.chatMessages.toArray(),
        customGoals: await db.customGoals.toArray(),
        foodLibrary: await db.foodLibrary.toArray(),
        diaryEntries: await db.diaryEntries.toArray(),
        foodProducts: await db.foodProducts.toArray(),
        dishes: await db.dishes.toArray(),
        waterLogs: await db.waterLogs.toArray(),
      };

      const json = JSON.stringify(data, null, 2);
      const parts = [
        `${data.providers.length} провайдер`,
        `${data.foodEntries.length} записей еды`,
        `${data.foodProducts.length} продуктов`,
        `${data.dishes.length} блюд`,
        `${data.diaryEntries.length} записей дневника`,
        `${data.waterLogs.length} записей воды`,
        `${data.chatSessions.length} разговоров`,
        `${data.chatMessages.length} сообщений`,
        `${data.customGoals.length} целей`,
      ];
      const counts = parts.join(', ');
      const fileName = `nutriadvisor-backup-${new Date().toISOString().split('T')[0]}.json`;

      if (isNativePlatform()) {
        // Native: save file then share via Android share sheet
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');

        const result = await Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        const uri = result.uri;
        await Share.share({
          title: 'NutriAdvisor — резервная копия',
          text: `Бэкап NutriAdvisor от ${new Date().toLocaleDateString('ru-RU')}`,
          url: uri,
        });

        // Clean up cached file after sharing
        try { await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }); } catch {}

        setExportStatus(`Отправлено! ${counts}`);
      } else {
        // Browser: download via <a> trick
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportStatus(`Готово! ${counts}`);
      }
      setTimeout(() => setExportStatus(''), 4000);
    } catch (err) {
      setExportStatus(`Ошибка: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Импорт...');
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (!data.app || data.app !== 'NutriAdvisor' || !data.version) {
        throw new Error('Неверный формат файла резервной копии');
      }

      // Import providers
      if (Array.isArray(data.providers)) {
        await db.providers.clear();
        for (const p of data.providers) {
          await db.providers.put({ ...p, createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt) });
        }
      }

      // Import profile
      if (Array.isArray(data.userProfile)) {
        await db.userProfile.clear();
        for (const p of data.userProfile) {
          await db.userProfile.put({ ...p, updatedAt: new Date(p.updatedAt) });
        }
      }

      // Import food entries
      if (Array.isArray(data.foodEntries)) {
        await db.foodEntries.clear();
        for (const e of data.foodEntries) {
          await db.foodEntries.put({ ...e, createdAt: new Date(e.createdAt) });
        }
      }

      // Import chat sessions
      if (Array.isArray(data.chatSessions)) {
        await db.chatSessions.clear();
        for (const s of data.chatSessions) {
          await db.chatSessions.put({ ...s, createdAt: new Date(s.createdAt), lastActivity: new Date(s.lastActivity) });
        }
      }

      // Import chat messages
      if (Array.isArray(data.chatMessages)) {
        await db.chatMessages.clear();
        for (const m of data.chatMessages) {
          await db.chatMessages.put({ ...m, createdAt: new Date(m.createdAt) });
        }
      }

      // Import custom goals
      if (Array.isArray(data.customGoals)) {
        await db.customGoals.clear();
        for (const g of data.customGoals) {
          await db.customGoals.put({ ...g, createdAt: new Date(g.createdAt) });
        }
      }

      // Import food library
      if (Array.isArray(data.foodLibrary)) {
        await db.foodLibrary.clear();
        for (const f of data.foodLibrary) {
          await db.foodLibrary.put({ ...f, lastUsedAt: new Date(f.lastUsedAt), createdAt: new Date(f.createdAt) });
        }
      }

      // Import diary entries
      if (Array.isArray(data.diaryEntries)) {
        await db.diaryEntries.clear();
        for (const d of data.diaryEntries) {
          await db.diaryEntries.put({ ...d, createdAt: new Date(d.createdAt) });
        }
      }

      // Import food products
      if (Array.isArray(data.foodProducts)) {
        await db.foodProducts.clear();
        for (const p of data.foodProducts) {
          await db.foodProducts.put({ ...p, createdAt: new Date(p.createdAt) });
        }
      }

      // Import dishes
      if (Array.isArray(data.dishes)) {
        await db.dishes.clear();
        for (const d of data.dishes) {
          await db.dishes.put({ ...d, createdAt: new Date(d.createdAt) });
        }
      }

      // Import water logs
      if (Array.isArray(data.waterLogs)) {
        await db.waterLogs.clear();
        for (const w of data.waterLogs) {
          await db.waterLogs.put({ ...w, updatedAt: new Date(w.updatedAt) });
        }
      }

      const parts = [];
      if (data.providers) parts.push(`${data.providers.length} провайдер`);
      if (data.foodEntries) parts.push(`${data.foodEntries.length} записей еды`);
      if (data.foodProducts) parts.push(`${data.foodProducts.length} продуктов`);
      if (data.dishes) parts.push(`${data.dishes.length} блюд`);
      if (data.diaryEntries) parts.push(`${data.diaryEntries.length} записей дневника`);
      if (data.waterLogs) parts.push(`${data.waterLogs.length} записей воды`);
      if (data.chatSessions) parts.push(`${data.chatSessions.length} разговоров`);
      if (data.chatMessages) parts.push(`${data.chatMessages.length} сообщений`);
      if (data.customGoals) parts.push(`${data.customGoals.length} целей`);
      setImportStatus(`Импортировано! ${parts.join(', ')}`);

      // Reload all data in store
      await Promise.all([
        loadProviders(),
        loadProfile(),
        loadFoodEntries(),
        loadDiaryEntries(),
        loadFoodProducts(),
        loadDishes(),
        loadCustomGoals(),
      ]);
      const today = new Date().toISOString().split('T')[0];
      await loadWaterLog(today);

      setTimeout(() => setImportStatus(''), 5000);
    } catch (err) {
      setImportStatus(`Ошибка: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
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
                      <SelectItem key={key} value={key}>
                        {preset.name}
                        {!preset.needsKey && (
                          <span className="ml-1 text-muted-foreground">(без ключа)</span>
                        )}
                      </SelectItem>
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
                <Input value={newBaseUrl} onChange={(e) => setNewBaseUrl(e.target.value)} placeholder="http://localhost:8080/v1" />
              </div>
              {needsKey && (
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
              )}
              <div className="space-y-2">
                <Label>Модель</Label>
                <div className="space-y-1.5">
                  <Input
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                  {newModel.trim() && !PRESETS[newType]?.model?.includes(newModel.trim()) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground"
                      onClick={() => {
                        const models = [...(newModels), newModel.trim()];
                        setNewModels(models);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Сохранить в список
                    </Button>
                  )}
                  {newModels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {newModels.map((m) => (
                        <button
                          key={m}
                          onClick={() => setNewModel(m)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                            newModel === m
                              ? 'bg-emerald-600 text-white'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {m}
                          <X
                            className="h-2.5 w-2.5 opacity-60 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewModels(newModels.filter((x) => x !== m));
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
        Локальные провайдеры (Ollama, llama.cpp) не требуют ключа.
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
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Zap className={`h-4 w-4 shrink-0 ${provider.id === activeProviderId ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                  <CardTitle className="text-sm truncate">{provider.name}</CardTitle>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {provider.id === activeProviderId && (
                    <Badge variant="default" className="bg-emerald-600 text-[9px] px-1.5 py-0">Активен</Badge>
                  )}
                  <div className="flex gap-0.5">
                  {/* Test button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); handleTest(provider); }}
                    disabled={testingId === provider.id}
                    title="Проверить подключение"
                  >
                    {testingId === provider.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wifi className="h-3.5 w-3.5" />
                    )}
                  </Button>

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
                            <Label>API Ключ <span className="text-muted-foreground text-xs">(оставьте пустым для локальных провайдеров)</span></Label>
                            <Input
                              type="password"
                              value={editingProvider.apiKey}
                              onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                              placeholder="sk-... или пусто"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Модель</Label>
                            <div className="space-y-1.5">
                              <Input
                                value={editingProvider.model}
                                onChange={(e) => setEditingProvider({ ...editingProvider, model: e.target.value })}
                              />
                              {(editingProvider.models ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {editingProvider.models!.map((m) => (
                                    <button
                                      key={m}
                                      onClick={() => setEditingProvider({ ...editingProvider, model: m })}
                                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                                        editingProvider.model === m
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                      }`}
                                    >
                                      {m}
                                      <X
                                        className="h-2.5 w-2.5 opacity-60 hover:opacity-100"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingProvider({
                                            ...editingProvider,
                                            models: editingProvider.models!.filter((x) => x !== m),
                                          });
                                        }}
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                              {editingProvider.model.trim() && !(editingProvider.models ?? []).includes(editingProvider.model.trim()) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs text-muted-foreground"
                                  onClick={() => {
                                    const models = [...(editingProvider.models ?? []), editingProvider.model.trim()];
                                    setEditingProvider({ ...editingProvider, models });
                                  }}
                                >
                                  <Plus className="h-3 w-3" /> Сохранить в список
                                </Button>
                              )}
                            </div>
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
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-mono">{provider.model}</Badge>
                <Badge variant="outline">{provider.type}</Badge>
                {!provider.apiKey && (
                  <Badge variant="outline" className="text-emerald-600">без ключа</Badge>
                )}
                {provider.supportsVision && (
                  <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" /> Vision</Badge>
                )}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/60">
                {provider.apiKey ? '••••••••' + provider.apiKey.slice(-4) : 'Без ключа доступа'}
              </p>

              {/* Test result — only for the tested provider */}
              {testingId === provider.id && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Проверяю подключение...
                </div>
              )}
              {testResult && testResult.providerId === provider.id && (
                <div className={`mt-2 flex items-start gap-2 rounded-md p-2 text-xs ${
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-destructive/10 text-destructive'
                }`}>
                  {testResult.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    : <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  }
                  <span>{testResult.message}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Theme */}
      <div className="border-t pt-4 mt-6">
        <h2 className="text-lg font-semibold">Внешний вид</h2>
        <div className="mt-3 flex items-center gap-3">
          {([
            { value: 'light' as const, icon: Sun, label: 'Светлая' },
            { value: 'dark' as const, icon: Moon, label: 'Тёмная' },
            { value: 'system' as const, icon: Monitor, label: 'Авто' },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                theme === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <opt.icon className="h-4 w-4" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Export / Import */}
      <div className="border-t pt-4 mt-6">
        <h2 className="text-lg font-semibold">Данные</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
          Экспортируйте все данные для переноса на другое устройство или создания резервной копии.
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExport}
            disabled={!!exportStatus}
          >
            <Share2 className="h-4 w-4" />
            {exportStatus || 'Отправить бэкап' }
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={!!importStatus}
          >
            <Upload className="h-4 w-4" />
            {importStatus || 'Импорт' }
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>

        {(exportStatus || importStatus) && (
          <p className={`mt-2 text-xs ${importStatus.startsWith('Ошибка') ? 'text-destructive' : 'text-emerald-600'}`}>
            {exportStatus || importStatus}
          </p>
        )}
      </div>
    </div>
  );
}
