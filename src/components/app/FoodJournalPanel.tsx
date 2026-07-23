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
  Plus, Camera, ImageIcon, Loader2, Trash2, Utensils, ChevronDown, ChevronUp, Send, Check, AlertTriangle, RefreshCw,
} from 'lucide-react';
import type { MealType, FoodEntry } from '@/lib/types';
import { MEAL_LABELS } from '@/lib/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

/** Parse numeric KBJU from AI analysis text */
function parseNutritionFromText(text: string): {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
} {
  const nums = {
    calories: null as number | null,
    protein: null as number | null,
    fat: null as number | null,
    carbs: null as number | null,
  };

  // Calories: "350 ккал", "калорийность: 350 ккал", "~350 ккал"
  const calMatch = text.match(
    /(?:калор[ияйно]+сть|калори[ияй]+)[\s:]*[~≈]?\s*(\d+(?:[.,]\d+)?)\s*(?:ккал|kcal|kkal)?/i
  ) || text.match(/(\d+(?:[.,]\d+)?)\s*(?:ккал|kcal|kkal)/i);
  if (calMatch) nums.calories = parseFloat(calMatch[1].replace(',', '.'));

  // Protein / Белки: "Белки: 25 г", "Б: 25г", "протеин 25 г"
  const protMatch = text.match(
    /(?:\*?\s*[Бб]ел(?:ки?|ок)\s*\*?\s*(?:[:|]\s*)?)[~≈]?\s*(\d+(?:[.,]\d+)?)\s*г/i
  ) || text.match(/(?:проте[ияын]+|protein)[\s:]*[~≈]?\s*(\d+(?:[.,]\d+)?)\s*г/i)
  || text.match(/[Бб]\s*[.:|]\s*(\d+(?:[.,]\d+)?)\s*г/);
  if (protMatch) nums.protein = parseFloat(protMatch[1].replace(',', '.'));

  // Fat / Жиры: "Жиры: 15 г", "Ж: 15г", "жир 15 г"
  const fatMatch = text.match(
    /(?:\*?\s*[Жж]ир(?:ы?|ов)?\s*\*?\s*(?:[:|]\s*)?)[~≈]?\s*(\d+(?:[.,]\d+)?)\s*г/i
  ) || text.match(/(?:fat)[\s:]*[~≈]?\s*(\d+(?:[.,]\d+)?)\s*г/i)
  || text.match(/[Жж]\s*[.:|]\s*(\d+(?:[.,]\d+)?)\s*г/);
  if (fatMatch) nums.fat = parseFloat(fatMatch[1].replace(',', '.'));

  // Carbs / Углеводы: "Углеводы: 40 г", "У: 40г"
  const carbMatch = text.match(
    /(?:\*?\s*[Уу]глев(?:оды?)?\s*\*?\s*(?:[:|]\s*)?)[~≈]?\s*(\d+(?:[.,]\d+)?)\s*г/i
  ) || text.match(/(?:carbohydrates?)[\s:]*[~≈]?\s*(\d+(?:[.,]\d+)?)\s*г/i)
  || text.match(/[Уу]\s*[.:|]\s*(\d+(?:[.,]\d+)?)\s*г/);
  if (carbMatch) nums.carbs = parseFloat(carbMatch[1].replace(',', '.'));

  return nums;
}

export default function FoodJournalPanel() {
  const foodEntries = useAppStore((s) => s.foodEntries);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const addFoodEntry = useAppStore((s) => s.addFoodEntry);
  const deleteFoodEntry = useAppStore((s) => s.deleteFoodEntry);
  const analyzeFoodText = useAppStore((s) => s.analyzeFoodText);
  const analyzeFoodImage = useAppStore((s) => s.analyzeFoodImage);
  const isSending = useAppStore((s) => s.isSending);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState('');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Parsed nutrition values for user verification
  const [parsedCal, setParsedCal] = useState('');
  const [parsedProt, setParsedProt] = useState('');
  const [parsedFat, setParsedFat] = useState('');
  const [parsedCarbs, setParsedCarbs] = useState('');
  const [showNutrEdit, setShowNutrEdit] = useState(false);

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

      // Parse nutrition values from AI response
      const parsed = parseNutritionFromText(analysis);
      setParsedCal(parsed.calories !== null ? String(parsed.calories) : '');
      setParsedProt(parsed.protein !== null ? String(parsed.protein) : '');
      setParsedFat(parsed.fat !== null ? String(parsed.fat) : '');
      setParsedCarbs(parsed.carbs !== null ? String(parsed.carbs) : '');
      setShowNutrEdit(true);
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
      estimatedCalories: parsedCal ? Number(parsedCal) : undefined,
      estimatedProtein: parsedProt ? Number(parsedProt) : undefined,
      estimatedFat: parsedFat ? Number(parsedFat) : undefined,
      estimatedCarbs: parsedCarbs ? Number(parsedCarbs) : undefined,
      aiAnalysis: analysisResult || undefined,
    });
    resetForm();
  };

  const resetForm = () => {
    setDescription('');
    setWeight('');
    setMealType('lunch');
    setPhotoBase64(null);
    setAnalysisResult('');
    setParsedCal('');
    setParsedProt('');
    setParsedFat('');
    setParsedCarbs('');
    setShowNutrEdit(false);
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
    const eid = entry.id ?? '';
    const isExpanded = expandedIds.has(eid);
    return (
      <Card key={eid} className="overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            {entry.photoBase64 && (
              <img
                src={entry.photoBase64}
                alt="Еда"
                className="h-12 w-12 rounded-md object-cover shrink-0"
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
              <p className="mt-0.5 text-sm">{entry.description}</p>
              {entry.weight && (
                <span className="text-[10px] text-muted-foreground">{entry.weight}г</span>
              )}
              {(entry.estimatedCalories || entry.estimatedProtein) && (
                <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                  {entry.estimatedCalories && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      {entry.estimatedCalories} ккал
                    </span>
                  )}
                  {entry.estimatedProtein && <span className="text-muted-foreground">Б: {entry.estimatedProtein}г</span>}
                  {entry.estimatedFat && <span className="text-muted-foreground">Ж: {entry.estimatedFat}г</span>}
                  {entry.estimatedCarbs && <span className="text-muted-foreground">У: {entry.estimatedCarbs}г</span>}
                </div>
              )}
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <button
                onClick={() => toggleExpand(eid)}
                className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                title={isExpanded ? 'Свернуть' : 'Подробнее'}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="rounded-md p-1 hover:bg-destructive/10 text-destructive" title="Удалить">
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
                    <AlertDialogAction onClick={() => deleteFoodEntry(eid)} className="bg-destructive text-destructive-foreground">
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {isExpanded && entry.aiAnalysis && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs leading-relaxed border border-border/50">
              <p className="mb-1 font-semibold text-muted-foreground">Анализ AI:</p>
              <MarkdownRenderer content={entry.aiAnalysis} className="text-foreground" />
            </div>
          )}
          {isExpanded && !entry.aiAnalysis && (
            <div className="mt-3 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground text-center">
              Анализ не проводился
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
          {todayEntries.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-emerald-600">{totalCalories}</div>
                <div className="text-[10px] text-muted-foreground">ккал</div>
              </div>
              <div>
                <div className="text-lg font-bold">{totalProtein.toFixed(0)}</div>
                <div className="text-[10px] text-muted-foreground">белки</div>
              </div>
              <div>
                <div className="text-lg font-bold">{totalFat.toFixed(0)}</div>
                <div className="text-[10px] text-muted-foreground">жиры</div>
              </div>
              <div>
                <div className="text-lg font-bold">{totalCarbs.toFixed(0)}</div>
                <div className="text-[10px] text-muted-foreground">углеводы</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Добавьте приём пищи для отслеживания</p>
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

            {/* Analysis result — rendered as markdown */}
            {analysisResult && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs">
                <p className="mb-1 font-semibold text-emerald-700 dark:text-emerald-400">Результат анализа:</p>
                <MarkdownRenderer content={analysisResult} className="text-foreground" />
              </div>
            )}

            {/* Nutrition values — editable after analysis */}
            {showNutrEdit && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Пищевая ценность
                  </p>
                  <p className="text-[10px] text-muted-foreground">Проверьте и скорректируйте значения</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Калории (ккал)</Label>
                    <Input
                      type="number"
                      value={parsedCal}
                      onChange={(e) => setParsedCal(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Белки (г)</Label>
                    <Input
                      type="number"
                      value={parsedProt}
                      onChange={(e) => setParsedProt(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Жиры (г)</Label>
                    <Input
                      type="number"
                      value={parsedFat}
                      onChange={(e) => setParsedFat(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Углеводы (г)</Label>
                    <Input
                      type="number"
                      value={parsedCarbs}
                      onChange={(e) => setParsedCarbs(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Warning if some values are missing */}
                {(!parsedCal || !parsedProt || !parsedFat || !parsedCarbs) && (
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 dark:bg-amber-950/20 dark:border-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-700 dark:text-amber-400">
                      <p className="font-medium">Не все параметры определены</p>
                      <p className="mt-0.5">
                        Заполните отсутствующие значения вручную или повторите анализ с более умной моделью.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Repeat analysis button */}
            {analysisResult && (
              <Button
                onClick={handleAnalyze}
                disabled={isSending || (!description && !photoBase64)}
                variant="ghost"
                size="sm"
                className="w-full gap-2 text-xs text-muted-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSending ? 'animate-spin' : ''}`} />
                Повторить анализ
              </Button>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={!description && !photoBase64}>
              <Check className="mr-1.5 h-4 w-4" />
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
