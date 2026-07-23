'use client';

import React, { useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Plus, Camera, ImageIcon, Loader2, Trash2, Utensils, ChevronDown, ChevronUp, Send,
} from 'lucide-react';
import type { MealType, FoodEntry } from '@/lib/types';
import { MEAL_LABELS } from '@/lib/types';

export default function FoodJournalPanel() {
  const foodEntries = useAppStore((s) => s.foodEntries);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const addFoodEntry = useAppStore((s) => s.addFoodEntry);
  const deleteFoodEntry = useAppStore((s) => s.deleteFoodEntry);
  const analyzeFoodText = useAppStore((s) => s.analyzeFoodText);
  const analyzeFoodImage = useAppStore((s) => s.analyzeFoodImage);
  const isSending = useAppStore((s) => s.isSending);
  const profile = useAppStore((s) => s.profile);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState('');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    loadFoodEntries();
  }, [loadFoodEntries]);

  const today = new Date().toISOString().split('T')[0];
  const todayEntries = foodEntries.filter((e) => e.date === today);
  const olderEntries = foodEntries.filter((e) => e.date !== today);

  const totalCalories = todayEntries.reduce((sum, e) => sum + (e.estimatedCalories ?? 0), 0);
  const totalProtein = todayEntries.reduce((sum, e) => sum + (e.estimatedProtein ?? 0), 0);
  const totalFat = todayEntries.reduce((sum, e) => sum + (e.estimatedFat ?? 0), 0);
  const totalCarbs = todayEntries.reduce((sum, e) => sum + (e.estimatedCarbs ?? 0), 0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!description && !photoBase64) return;

    try {
      let analysis = '';
      if (photoBase64) {
        analysis = await analyzeFoodImage(photoBase64);
      } else {
        analysis = await analyzeFoodText(description, weight ? Number(weight) : undefined);
      }
      setAnalysisResult(analysis);
    } catch (err) {
      setAnalysisResult(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    }
  };

  const handleSave = async () => {
    await addFoodEntry({
      date: today,
      mealType,
      description,
      photoBase64: photoBase64 ?? undefined,
      weight: weight ? Number(weight) : undefined,
      aiAnalysis: analysisResult || undefined,
      createdAt: new Date(),
    });
    resetForm();
  };

  const resetForm = () => {
    setDescription('');
    setWeight('');
    setMealType('lunch');
    setPhotoBase64(null);
    setAnalysisResult('');
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderEntryCard = (entry: FoodEntry) => {
    const isExpanded = expandedIds.has(entry.id!);
    return (
      <Card key={entry.id} className="overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            {entry.photoBase64 && (
              <img
                src={entry.photoBase64}
                alt="Еда"
                className="h-12 w-12 rounded-md object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {MEAL_LABELS[entry.mealType]}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="mt-0.5 text-sm truncate">{entry.description}</p>
              {entry.weight && (
                <span className="text-[10px] text-muted-foreground">{entry.weight}г</span>
              )}
              {(entry.estimatedCalories || entry.estimatedProtein) && (
                <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
                  {entry.estimatedCalories && <span>{entry.estimatedCalories} ккал</span>}
                  {entry.estimatedProtein && <span>Б: {entry.estimatedProtein}г</span>}
                  {entry.estimatedFat && <span>Ж: {entry.estimatedFat}г</span>}
                  {entry.estimatedCarbs && <span>У: {entry.estimatedCarbs}г</span>}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => toggleExpand(entry.id!)} className="text-muted-foreground">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
                    <AlertDialogDescription>Эта запись будет удалена без возможности восстановления.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteFoodEntry(entry.id!)} className="bg-destructive text-destructive-foreground">
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {isExpanded && entry.aiAnalysis && (
            <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap">
              {entry.aiAnalysis}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Today summary */}
      <Card className="border-emerald-200 dark:border-emerald-900">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Сегодня</h3>
            <span className="text-xs text-muted-foreground">{todayEntries.length} записей</span>
          </div>
          {todayEntries.length > 0 && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-emerald-600">{totalCalories}</div>
                <div className="text-[10px] text-muted-foreground">ккал</div>
              </div>
              <div>
                <div className="text-lg font-bold">{totalProtein.toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground">белки</div>
              </div>
              <div>
                <div className="text-lg font-bold">{totalFat.toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground">жиры</div>
              </div>
              <div>
                <div className="text-lg font-bold">{totalCarbs.toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground">углеводы</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Food entries list */}
      <div className="space-y-2">
        {todayEntries.map(renderEntryCard)}
        {olderEntries.length > 0 && (
          <>
            <div className="py-2 text-center text-xs text-muted-foreground">Ранее</div>
            {olderEntries.map(renderEntryCard)}
          </>
        )}
        {foodEntries.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Utensils className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p>Нет записей о питании</p>
            <p className="text-xs">Нажмите + чтобы добавить приём пищи</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
        <Button
          className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Добавить приём пищи</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Photo section */}
            <div className="space-y-2">
              <Label className="text-xs">Фото (опционально)</Label>
              <div className="flex gap-2">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5" /> Камера
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon className="h-3.5 w-3.5" /> Галерея
                </Button>
              </div>
              {photoBase64 && (
                <div className="relative inline-block">
                  <img src={photoBase64} alt="Preview" className="h-20 w-20 rounded-md object-cover" />
                  <button
                    onClick={() => setPhotoBase64(null)}
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Meal type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Приём пищи</Label>
              <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MEAL_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Описание</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Овсянка с бананом и мёдом, кофе без сахара"
                rows={2}
              />
            </div>

            {/* Weight */}
            <div className="space-y-1.5">
              <Label className="text-xs">Вес порции (г, опционально)</Label>
              <Input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="250"
              />
            </div>

            {/* Analyze button */}
            <Button
              onClick={handleAnalyze}
              disabled={isSending || (!description && !photoBase64)}
              variant="outline"
              className="w-full gap-2"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Анализ AI
            </Button>

            {/* Analysis result */}
            {analysisResult && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs whitespace-pre-wrap">
                <p className="mb-1 font-semibold text-emerald-700 dark:text-emerald-400">Результат анализа:</p>
                {analysisResult}
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={!description && !photoBase64}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
