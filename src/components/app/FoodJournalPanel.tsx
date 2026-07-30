'use client';

import React, { useState, useRef, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Plus, Camera, ImageIcon, Loader2, Trash2, Utensils, ChevronDown, ChevronUp,
  Send, Check, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Bug, CalendarDays, Pencil, Search, BookOpen, X,
} from 'lucide-react';
import type { MealType, FoodEntry } from '@/lib/types';
import { MEAL_LABELS } from '@/lib/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

/** Parse numeric KBJU from AI analysis text — robust multi-pattern matching */
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

  const num = '(\\d+[.,]?\\d*)';

  // Calories
  const calPatterns = [
    new RegExp(`(?:калори[ияй]|ккал|cal|kcal|Calories|Калории)[:\s]*[~≈]?\\s*${num}\\s*(?:ккал|кКал|kkal|cal|к)?`, 'i'),
    new RegExp(`${num}\\s*(?:ккал|kkal|cal)`, 'i'),
    new RegExp(`Калории[:\s]*${num}`, 'i'),
    new RegExp(`К:[\\s:*|—–-]+[~≈]?\\s*${num}\\s*ккал`, 'i'),
  ];
  for (const p of calPatterns) {
    const m = text.match(p);
    if (m) { nums.calories = parseFloat(m[1].replace(',', '.')); break; }
  }

  // Protein
  const protPatterns = [
    new RegExp(`(?:бел(?:ок|ки|ка)|протеин|protein)[:\s]*[~≈]?\\s*${num}\\s*г?`, 'i'),
    new RegExp(`${num}\\s*г?\\s*(?:бел(?:ок|ки|ка)|протеин)`, 'i'),
    new RegExp(`Б[:\s]*[~≈]?\\s*${num}\\s*г`, 'i'),
  ];
  for (const p of protPatterns) {
    const m = text.match(p);
    if (m) { nums.protein = parseFloat(m[1].replace(',', '.')); break; }
  }

  // Fat
  const fatPatterns = [
    new RegExp(`(?:жиры?|fats?)[:\s]*[~≈]?\\s*${num}\\s*г?`, 'i'),
    new RegExp(`Ж[:\s]*[~≈]?\\s*${num}\\s*г`, 'i'),
  ];
  for (const p of fatPatterns) {
    const m = text.match(p);
    if (m) { nums.fat = parseFloat(m[1].replace(',', '.')); break; }
  }

  // Carbs
  const carbPatterns = [
    new RegExp(`углев(?:оды?)?[\s:*|—–-]+[~≈]?\\s*${num}\\s*г`, 'i'),
    new RegExp(`[Уу]глев(?:оды?)?[\\s:*|—–-]+[~≈]?\\s*${num}\\s*г`, 'i'),
    new RegExp(`[Уу]\\s*[.:|]\\s*[~≈]?\\s*${num}\\s*г`, 'i'),
    new RegExp(`carbo?hydrates?[\s:*|—–-]+[~≈]?\\s*${num}\\s*г?`, 'i'),
  ];
  for (const p of carbPatterns) {
    const m = text.match(p);
    if (m) { nums.carbs = parseFloat(m[1].replace(',', '.')); break; }
  }

  return nums;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterdayDate) return 'Вчера';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

const PAGE_SIZE = 10;

export default function FoodJournalPanel() {
  const foodEntries = useAppStore((s) => s.foodEntries);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const addFoodEntry = useAppStore((s) => s.addFoodEntry);
  const updateFoodEntry = useAppStore((s) => s.updateFoodEntry);
  const deleteFoodEntry = useAppStore((s) => s.deleteFoodEntry);
  const analyzeFoodText = useAppStore((s) => s.analyzeFoodText);
  const analyzeFoodImage = useAppStore((s) => s.analyzeFoodImage);
  const isSending = useAppStore((s) => s.isSending);
  const foodLibrary = useAppStore((s) => s.foodLibrary);
  const loadFoodLibrary = useAppStore((s) => s.loadFoodLibrary);
  const seedFoodLibraryFromEntries = useAppStore((s) => s.seedFoodLibraryFromEntries);
  const deleteFoodLibraryItem = useAppStore((s) => s.deleteFoodLibraryItem);
  const lastAnalysisDebug = useAppStore((s) => s.lastAnalysisDebug);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState('');
  const [libSearch, setLibSearch] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
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

  // Edit mode
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [showDebug, setShowDebug] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    loadFoodEntries();
    loadFoodLibrary();
    seedFoodLibraryFromEntries();
  }, [loadFoodEntries, loadFoodLibrary, seedFoodLibraryFromEntries]);

  const today = new Date().toISOString().split('T')[0];
  const todayEntries = foodEntries.filter((e) => e.date === today);

  const totalCalories = todayEntries.reduce((sum, e) => sum + (e.estimatedCalories ?? 0), 0);
  const totalProtein = todayEntries.reduce((sum, e) => sum + (e.estimatedProtein ?? 0), 0);
  const totalFat = todayEntries.reduce((sum, e) => sum + (e.estimatedFat ?? 0), 0);
  const totalCarbs = todayEntries.reduce((sum, e) => sum + (e.estimatedCarbs ?? 0), 0);

  // Group non-today entries by date
  const olderEntries = useMemo(() => {
    const nonToday = foodEntries.filter((e) => e.date !== today);
    const grouped = new Map<string, FoodEntry[]>();
    for (const entry of nonToday) {
      if (!grouped.has(entry.date)) grouped.set(entry.date, []);
      grouped.get(entry.date)!.push(entry);
    }
    const sortedDates = Array.from(grouped.keys()).sort().reverse();
    return sortedDates.map((date) => ({ date, entries: grouped.get(date)! }));
  }, [foodEntries, today]);

  // Paginated date groups
  const totalPages = Math.max(1, Math.ceil(olderEntries.length / PAGE_SIZE));
  const paginatedGroups = useMemo(() => {
    return olderEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [olderEntries, page]);

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
        analysis = await analyzeFoodImage(
          photoBase64,
          description || undefined,
          weight ? Number(weight) : undefined
        );
      } else {
        analysis = await analyzeFoodText(description, weight ? Number(weight) : undefined);
      }
      setAnalysisResult(analysis);
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
    if (editingEntryId) {
      // Update existing entry
      await updateFoodEntry(editingEntryId, {
        date: selectedDate,
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
    } else {
      // Add new entry
      await addFoodEntry({
        date: selectedDate,
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
    }
    resetForm();
  };

  const resetForm = () => {
    setEditingEntryId(null);
    setSelectedDate(new Date().toISOString().split('T')[0]);
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
    setLibSearch('');
  };

  const filteredLibrary = useMemo(() => {
    const q = libSearch.trim().toLowerCase();
    if (!q) return foodLibrary.slice(0, 20);
    return foodLibrary.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 20);
  }, [foodLibrary, libSearch]);

  const selectLibraryItem = (item: typeof foodLibrary[0]) => {
    setDescription(item.name);
    setWeight(item.defaultWeight ? String(item.defaultWeight) : '');
    setMealType(item.lastMealType);
    setLibSearch('');
  };

  const handleEditEntry = (entry: FoodEntry) => {
    setEditingEntryId(entry.id ?? null);
    setSelectedDate(entry.date);
    setMealType(entry.mealType);
    setDescription(entry.description);
    setWeight(entry.weight ? String(entry.weight) : '');
    setPhotoBase64(entry.photoBase64 ?? null);
    setAnalysisResult(entry.aiAnalysis ?? '');
    setParsedCal(entry.estimatedCalories ? String(entry.estimatedCalories) : '');
    setParsedProt(entry.estimatedProtein ? String(entry.estimatedProtein) : '');
    setParsedFat(entry.estimatedFat ? String(entry.estimatedFat) : '');
    setParsedCarbs(entry.estimatedCarbs ? String(entry.estimatedCarbs) : '');
    setShowNutrEdit(!!entry.aiAnalysis);
    setIsAddOpen(true);
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
              <img src={entry.photoBase64} alt="Еда" className="h-12 w-12 rounded-md object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{MEAL_LABELS[entry.mealType]}</Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="mt-0.5 text-sm">{entry.description}</p>
              {entry.weight && <span className="text-[10px] text-muted-foreground">{entry.weight}г</span>}
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
                onClick={() => handleEditEntry(entry)}
                className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                title="Редактировать"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
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

      {foodLibrary.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center justify-between w-full text-left"
            >
              <CardTitle className="text-sm">Шаблоны еды ({foodLibrary.length})</CardTitle>
              {showTemplates
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </button>
          </CardHeader>
          {showTemplates && (
            <CardContent className="px-4 pb-3"><div className="flex flex-wrap gap-1.5">
              {foodLibrary.slice(0, 30).map((item) => (
                <div key={item.id} className="group relative flex items-center gap-1 rounded-full border bg-background px-2.5 py-1">
                  <button onClick={() => { setDescription(item.name); setWeight(item.defaultWeight ? String(item.defaultWeight) : ''); setMealType(item.lastMealType); setIsAddOpen(true); }} className="text-xs hover:text-emerald-600 transition-colors" >
                    {item.name}{item.defaultWeight ? ` ${item.defaultWeight}г` : ''}
                  </button>
                  <button onClick={() => deleteFoodLibraryItem(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all" >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {foodLibrary.length > 30 && (
                <span className="text-[10px] text-muted-foreground self-center">+{foodLibrary.length - 30}</span>
              )}
            </div></CardContent>
          )}
        </Card>
      )}

      {/* Food entries list */}
      <div className="space-y-2">
        {/* Today entries */}
        {todayEntries.map(renderEntryCard)}

        {/* Older entries grouped by date with pagination */}
        {paginatedGroups.map((group) => (
          <React.Fragment key={group.date}>
            <div className="flex items-center gap-2 pt-3 pb-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateLabel(group.date)}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {group.entries.map(renderEntryCard)}
          </React.Fragment>
        ))}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {foodEntries.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Utensils className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p>Нет записей о питании</p>
            <p className="text-xs">Нажмите + чтобы добавить приём пищи</p>
          </div>
        )}
      </div>

      {/* FAB + Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
        <Button
          className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
        <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingEntryId ? 'Редактировать приём пищи' : 'Добавить приём пищи'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Photo section */}
            <div className="space-y-2">
              <Label className="text-xs">Фото (опционально)</Label>
              <div className="flex gap-2">
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
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
                  <button onClick={() => setPhotoBase64(null)} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Дата</Label>
              <div className="relative">
                <CalendarDays className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
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
            {foodLibrary.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Быстрый выбор</Label>
                  <button onClick={() => setShowLibrary(!showLibrary)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors" >
                    <BookOpen className="h-3 w-3" />
                    {showLibrary ? 'Скрыть' : 'Все продукты'}
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="Поиск по названию..." className="pl-8 pr-8 h-9 text-sm" onFocus={() => setShowLibrary(true)} />
                  {libSearch && (
                    <button onClick={() => setLibSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {showLibrary && filteredLibrary.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border bg-popover p-1 space-y-0.5">
                    {filteredLibrary.map((item) => (
                      <button key={item.id} onClick={() => selectLibraryItem(item)} className="w-full flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent transition-colors" >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium break-words" style={{maxWidth:'300ch'}}>{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {item.defaultWeight ? `${item.defaultWeight}г` : '—'}
                            {' · '}{MEAL_LABELS[item.lastMealType]}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">x{item.useCount}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showLibrary && filteredLibrary.length === 0 && libSearch && (
                  <p className="text-xs text-muted-foreground text-center py-2">Ничего не найдено</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Описание</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Овсянка с бананом и мёдом, кофе без сахара" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Вес порции (г, опционально)</Label>
              <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="250" />
            </div>
            <Button onClick={handleAnalyze} disabled={isSending || (!description && !photoBase64)} variant="outline" className="w-full gap-2">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Анализ AI
            </Button>
            {analysisResult && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs">
                <p className="mb-1 font-semibold text-emerald-700 dark:text-emerald-400">Результат анализа:</p>
                <MarkdownRenderer content={analysisResult} className="text-foreground" />
              </div>
            )}
            {showNutrEdit && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Пищевая ценность</p>
                  <p className="text-[10px] text-muted-foreground">Проверьте и скорректируйте значения</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Калории (ккал)</Label>
                    <Input type="number" value={parsedCal} onChange={(e) => setParsedCal(e.target.value)} placeholder="0" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Белки (г)</Label>
                    <Input type="number" value={parsedProt} onChange={(e) => setParsedProt(e.target.value)} placeholder="0" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Жиры (г)</Label>
                    <Input type="number" value={parsedFat} onChange={(e) => setParsedFat(e.target.value)} placeholder="0" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Углеводы (г)</Label>
                    <Input type="number" value={parsedCarbs} onChange={(e) => setParsedCarbs(e.target.value)} placeholder="0" className="h-9 text-sm" />
                  </div>
                </div>
                {(!parsedCal || !parsedProt || !parsedFat || !parsedCarbs) && (
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 dark:bg-amber-950/20 dark:border-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-700 dark:text-amber-400">
                      <p className="font-medium">Не все параметры определены</p>
                      <p className="mt-0.5">Заполните отсутствующие значения вручную или повторите анализ с более умной моделью.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {analysisResult && (
              <Button onClick={handleAnalyze} disabled={isSending || (!description && !photoBase64)} variant="ghost" size="sm" className="w-full gap-2 text-xs text-muted-foreground">
                <RefreshCw className={`h-3.5 w-3.5 ${isSending ? 'animate-spin' : ''}`} />
                Повторить анализ
              </Button>
            )}
            {/* Debug info */}
            {lastAnalysisDebug && (
              <div className="space-y-1">
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  <Bug className="h-3 w-3" />
                  {showDebug ? 'Скрыть отладку' : 'Отладка промптов и ответов'}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showDebug ? 'rotate-180' : ''}`} />
                </button>
                {showDebug && (
                  <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2 text-[10px] font-mono max-h-48 overflow-y-auto">
                    <div>
                      <p className="font-semibold text-muted-foreground mb-0.5">Промпт:</p>
                      <pre className="whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">{lastAnalysisDebug.prompt}</pre>
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <p className="font-semibold text-muted-foreground mb-0.5">Ответ LLM:</p>
                      <pre className="whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">{lastAnalysisDebug.response}</pre>
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <p className="font-semibold text-muted-foreground mb-0.5">Результат парсинга KBJU:</p>
                      <p>Калории: {parsedCal || '—'} | Белки: {parsedProt || '—'} | Жиры: {parsedFat || '—'} | Углеводы: {parsedCarbs || '—'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Отмена</Button></DialogClose>
            <Button onClick={handleSave} disabled={!description && !photoBase64}>
              <Check className="mr-1.5 h-4 w-4" /> {editingEntryId ? 'Сохранить изменения' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
