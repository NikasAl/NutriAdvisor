'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
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
  Plus, Camera, ImageIcon, Loader2, Trash2, Utensils, ChevronDown, ChevronUp,
  Send, Check, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Bug, CalendarDays, Pencil, Search, X, Droplets, Minus, BedDouble, Copy,
} from 'lucide-react';
import type { MealType, FoodEntry, FoodEntryItem } from '@/lib/types';
import { MEAL_LABELS } from '@/lib/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

/** Parse numeric KBJU from AI analysis text */
function parseNutritionFromText(text: string) {
  const nums = { calories: null as number | null, protein: null as number | null, fat: null as number | null, carbs: null as number | null };
  const num = '(\\d+[.,]?\\d*)';
  const sep = '[\\s:*|\\u2014\\u2013-]+'; // separator: spaces, *, |, —, –, -
  const calP = [
    new RegExp(`(?:калори[ияй]|ккал|cal|kcal|Calories|Калории)${sep}[~≈]?\\s*${num}\\s*(?:ккал|кКал|kkal|cal|к)?`, 'i'),
    new RegExp(`${num}\\s*(?:ккал|kkal|cal)`, 'i'),
    new RegExp(`Калории${sep}${num}`, 'i'),
    new RegExp(`К${sep}[~≈]?\\s*${num}\\s*ккал`, 'i'),
  ];
  for (const p of calP) { const m = text.match(p); if (m) { nums.calories = parseFloat(m[1].replace(',', '.')); break; } }
  const protP = [
    new RegExp(`(?:Бел(?:ок|ки|ка)|протеин|protein)${sep}[~≈]?\\s*${num}\\s*г?`, 'i'),
    new RegExp(`Б${sep}[~≈]?\\s*${num}\\s*г`, 'i'),
  ];
  for (const p of protP) { const m = text.match(p); if (m) { nums.protein = parseFloat(m[1].replace(',', '.')); break; } }
  const fatP = [
    new RegExp(`(?:Жиры?|Fats?)${sep}[~≈]?\\s*${num}\\s*г?`, 'i'),
    new RegExp(`Ж${sep}[~≈]?\\s*${num}\\s*г`, 'i'),
  ];
  for (const p of fatP) { const m = text.match(p); if (m) { nums.fat = parseFloat(m[1].replace(',', '.')); break; } }
  const carbP = [
    new RegExp(`(?:Углев(?:оды?)?|Carbo?hydrates?)${sep}[~≈]?\\s*${num}\\s*г?`, 'i'),
    new RegExp(`У${sep}[~≈]?\\s*${num}\\s*г`, 'i'),
  ];
  for (const p of carbP) { const m = text.match(p); if (m) { nums.carbs = parseFloat(m[1].replace(',', '.')); break; } }
  return nums;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yd = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yd) return 'Вчера';
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
  const analyzeFoodTextStream = useAppStore((s) => s.analyzeFoodTextStream);
  const analyzeFoodImage = useAppStore((s) => s.analyzeFoodImage);
  const isSending = useAppStore((s) => s.isSending);
  const lastAnalysisDebug = useAppStore((s) => s.lastAnalysisDebug);
  const streamingAnalysis = useAppStore((s) => s.streamingAnalysis);
  const foodProducts = useAppStore((s) => s.foodProducts);
  const dishes = useAppStore((s) => s.dishes);
  const waterLog = useAppStore((s) => s.waterLog);
  const waterGlassMl = useAppStore((s) => s.waterGlassMl);
  const addWaterGlass = useAppStore((s) => s.addWaterGlass);
  const removeWaterGlass = useAppStore((s) => s.removeWaterGlass);
  const sleepLog = useAppStore((s) => s.sleepLog);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [parsedCal, setParsedCal] = useState('');
  const [parsedProt, setParsedProt] = useState('');
  const [parsedFat, setParsedFat] = useState('');
  const [parsedCarbs, setParsedCarbs] = useState('');
  const [showNutrEdit, setShowNutrEdit] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [showDebug, setShowDebug] = useState(false);

  // New item-based entry
  const [items, setItems] = useState<FoodEntryItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [description, setDescription] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => { loadFoodEntries(); }, [loadFoodEntries]);

  const today = new Date().toISOString().split('T')[0];
  const todayEntries = foodEntries.filter((e) => e.date === today);
  const totalCalories = todayEntries.reduce((sum, e) => sum + (e.estimatedCalories ?? 0), 0);
  const totalProtein = todayEntries.reduce((sum, e) => sum + (e.estimatedProtein ?? 0), 0);
  const totalFat = todayEntries.reduce((sum, e) => sum + (e.estimatedFat ?? 0), 0);
  const totalCarbs = todayEntries.reduce((sum, e) => sum + (e.estimatedCarbs ?? 0), 0);

  const olderEntries = useMemo(() => {
    const nonToday = foodEntries.filter((e) => e.date !== today);
    const grouped = new Map<string, FoodEntry[]>();
    for (const entry of nonToday) { if (!grouped.has(entry.date)) grouped.set(entry.date, []); grouped.get(entry.date)!.push(entry); }
    const sortedDates = Array.from(grouped.keys()).sort().reverse();
    return sortedDates.map((date) => ({ date, entries: grouped.get(date)! }));
  }, [foodEntries, today]);

  const totalPages = Math.max(1, Math.ceil(olderEntries.length / PAGE_SIZE));
  const paginatedGroups = useMemo(() => olderEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [olderEntries, page]);

  // Search for products and dishes
  const searchResults = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return [];
    const results: { id: string; name: string; type: 'product' | 'dish' }[] = [];
    for (const p of foodProducts) {
      if (p.name.toLowerCase().includes(q) && results.length < 30) results.push({ id: p.id, name: p.name, type: 'product' });
    }
    for (const d of dishes) {
      if (d.name.toLowerCase().includes(q) && results.length < 30) results.push({ id: d.id!, name: d.name, type: 'dish' });
    }
    return results;
  }, [itemSearch, foodProducts, dishes]);

  // Expand dish composition with recalculated ingredient weights
  const expandDishItems = useCallback((entryItems: FoodEntryItem[]): string => {
    const parts: string[] = [];
    for (const item of entryItems) {
      if (item.dishId) {
        const dish = dishes.find((d) => d.id === item.dishId);
        if (dish && dish.ingredients.length > 0) {
          const totalDishWeight = dish.ingredients.reduce((s, i) => s + i.weightGrams, 0);
          const expanded = dish.ingredients.map((ing) => {
            const prod = foodProducts.find((p) => p.id === ing.productId);
            const scaled = totalDishWeight > 0 ? Math.round((ing.weightGrams / totalDishWeight) * item.weightGrams) : ing.weightGrams;
            return `${prod?.name ?? '?'} ${scaled}г`;
          }).join(', ');
          parts.push(`${item.name} ${item.weightGrams}г (${expanded})`);
        } else {
          parts.push(`${item.name} ${item.weightGrams}г`);
        }
      } else {
        parts.push(`${item.name} ${item.weightGrams}г`);
      }
    }
    return parts.join(', ');
  }, [dishes, foodProducts]);

  // Auto-generate description from items (with expanded dish composition)
  const generateDescription = useCallback((entryItems: FoodEntryItem[]): string => {
    return expandDishItems(entryItems);
  }, [expandDishItems]);

  // Update description when items change
  React.useEffect(() => {
    if (items.length > 0) {
      setDescription(generateDescription(items));
    }
  }, [items, generateDescription]);

  const addItem = (productId: string, productName: string) => {
    setItems([...items, { productId, name: productName, weightGrams: 100 }]);
    setItemSearch('');
    setShowItemDropdown(false);
  };

  const addDishItem = (dishId: string, dishName: string) => {
    const dish = dishes.find((d) => d.id === dishId);
    const totalW = dish?.ingredients.reduce((s, i) => s + i.weightGrams, 0) ?? 0;
    setItems([...items, { dishId, name: dishName, weightGrams: totalW || 200 }]);
    setItemSearch('');
    setShowItemDropdown(false);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const updateItemWeight = (idx: number, w: number) => {
    const next = [...items];
    next[idx] = { ...next[idx], weightGrams: w };
    setItems(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    // Build description: use expanded dish composition if items are present
    const analysisDescription = items.length > 0
      ? expandDishItems(items)
      : description;
    if (!analysisDescription && !photoBase64) return;
    try {
      let analysis = '';
      if (photoBase64) {
        analysis = await analyzeFoodImage(photoBase64, analysisDescription || undefined, undefined, mealType);
      } else {
        analysis = await analyzeFoodTextStream(analysisDescription, undefined, mealType);
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
    const entryData: Record<string, unknown> = {
      date: selectedDate,
      mealType,
      description,
      photoBase64: photoBase64 ?? undefined,
      estimatedCalories: parsedCal ? Number(parsedCal) : undefined,
      estimatedProtein: parsedProt ? Number(parsedProt) : undefined,
      estimatedFat: parsedFat ? Number(parsedFat) : undefined,
      estimatedCarbs: parsedCarbs ? Number(parsedCarbs) : undefined,
      aiAnalysis: analysisResult || undefined,
    };
    if (items.length > 0) entryData.items = items;

    if (editingEntryId) {
      await updateFoodEntry(editingEntryId, entryData);
    } else {
      await addFoodEntry(entryData as Omit<FoodEntry, 'id' | 'createdAt'>);
    }
    resetForm();
  };

  const resetForm = () => {
    setEditingEntryId(null);
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setMealType('lunch');
    setPhotoBase64(null);
    setAnalysisResult('');
    setParsedCal('');
    setParsedProt('');
    setParsedFat('');
    setParsedCarbs('');
    setShowNutrEdit(false);
    setItems([]);
    setItemSearch('');
    setDescription('');
  };

  const handleEditEntry = (entry: FoodEntry) => {
    setEditingEntryId(entry.id ?? null);
    setSelectedDate(entry.date);
    setMealType(entry.mealType);
    setPhotoBase64(entry.photoBase64 ?? null);
    setAnalysisResult(entry.aiAnalysis ?? '');
    setParsedCal(entry.estimatedCalories ? String(entry.estimatedCalories) : '');
    setParsedProt(entry.estimatedProtein ? String(entry.estimatedProtein) : '');
    setParsedFat(entry.estimatedFat ? String(entry.estimatedFat) : '');
    setParsedCarbs(entry.estimatedCarbs ? String(entry.estimatedCarbs) : '');
    setShowNutrEdit(!!entry.aiAnalysis);
    setItems(entry.items ? [...entry.items] : []);
    setDescription(entry.description);
    setIsAddOpen(true);
  };

  const handleTemplate = (entry: FoodEntry) => {
    // Open as new entry, copying composition but not KBJU/analysis
    setEditingEntryId(null);
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setMealType(entry.mealType);
    setPhotoBase64(null);
    setAnalysisResult('');
    setParsedCal('');
    setParsedProt('');
    setParsedFat('');
    setParsedCarbs('');
    setShowNutrEdit(false);
    setItems(entry.items ? [...entry.items] : []);
    setDescription(entry.description);
    setIsAddOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const renderEntryCard = (entry: FoodEntry) => {
    const eid = entry.id ?? '';
    const isExpanded = expandedIds.has(eid);
    return (
      <Card key={eid} className="overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            {entry.photoBase64 && <img src={entry.photoBase64} alt="Еда" className="h-12 w-12 rounded-md object-cover shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{MEAL_LABELS[entry.mealType]}</Badge>
                <span className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="mt-0.5 text-sm">{entry.description}</p>
              {/* Show expanded dish composition */}
              {isExpanded && entry.items && entry.items.length > 0 && entry.items.some((i) => i.dishId) && (
                <div className="mt-1.5 text-[11px] text-muted-foreground space-y-0.5">
                  {entry.items.filter((i) => i.dishId).map((item, idx) => {
                    const dish = dishes.find((d) => d.id === item.dishId);
                    if (!dish || dish.ingredients.length === 0) return null;
                    const totalDishWeight = dish.ingredients.reduce((s, i) => s + i.weightGrams, 0);
                    return (
                      <div key={idx} className="pl-2 border-l-2 border-muted-foreground/30">
                        <span className="font-medium">{item.name} {item.weightGrams}г:</span>{' '}
                        {dish.ingredients.map((ing) => {
                          const prod = foodProducts.find((p) => p.id === ing.productId);
                          const scaled = totalDishWeight > 0 ? Math.round((ing.weightGrams / totalDishWeight) * item.weightGrams) : ing.weightGrams;
                          return `${prod?.name ?? '?'} ${scaled}г`;
                        }).join(', ')}
                      </div>
                    );
                  })}
                </div>
              )}
              {(entry.estimatedCalories || entry.estimatedProtein) && (
                <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                  {entry.estimatedCalories && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">{entry.estimatedCalories} ккал</span>}
                  {entry.estimatedProtein && <span className="text-muted-foreground">Б: {entry.estimatedProtein}г</span>}
                  {entry.estimatedFat && <span className="text-muted-foreground">Ж: {entry.estimatedFat}г</span>}
                  {entry.estimatedCarbs && <span className="text-muted-foreground">У: {entry.estimatedCarbs}г</span>}
                </div>
              )}
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <button onClick={() => handleEditEntry(entry)} className="rounded-md p-1 hover:bg-muted text-muted-foreground" title="Редактировать"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleTemplate(entry)} className="rounded-md p-1 hover:bg-muted text-muted-foreground" title="Создать из шаблона"><Copy className="h-3.5 w-3.5" /></button>
              <button onClick={() => toggleExpand(eid)} className="rounded-md p-1 hover:bg-muted text-muted-foreground" title={isExpanded ? 'Свернуть' : 'Подробнее'}>{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
              <AlertDialog>
                <AlertDialogTrigger asChild><button className="rounded-md p-1 hover:bg-destructive/10 text-destructive" title="Удалить"><Trash2 className="h-3.5 w-3.5" /></button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить запись?</AlertDialogTitle><AlertDialogDescription>Эта запись будет удалена без возможности восстановления.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => deleteFoodEntry(eid)} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {isExpanded && entry.aiAnalysis && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs leading-relaxed border border-border/50">
              <p className="mb-1 font-semibold text-muted-foreground">Анализ AI:</p>
              <MarkdownRenderer content={entry.aiAnalysis} className="text-foreground" />
            </div>
          )}
          {isExpanded && !entry.aiAnalysis && <div className="mt-3 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground text-center">Анализ не проводился</div>}
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
              <div><div className="text-lg font-bold text-emerald-600">{totalCalories}</div><div className="text-[10px] text-muted-foreground">ккал</div></div>
              <div><div className="text-lg font-bold">{totalProtein.toFixed(0)}</div><div className="text-[10px] text-muted-foreground">белки</div></div>
              <div><div className="text-lg font-bold">{totalFat.toFixed(0)}</div><div className="text-[10px] text-muted-foreground">жиры</div></div>
              <div><div className="text-lg font-bold">{totalCarbs.toFixed(0)}</div><div className="text-[10px] text-muted-foreground">углеводы</div></div>
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-2">Добавьте приём пищи для отслеживания</p>}
          {/* Water in today summary */}
          <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-950/20">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Вода:</span>
              <span className="text-sm font-semibold text-blue-600">{(waterLog?.glasses ?? 0) * waterGlassMl} мл</span>
              <span className="text-[10px] text-muted-foreground">({waterLog?.glasses ?? 0} ст.)</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => removeWaterGlass()} disabled={!waterLog || waterLog.glasses <= 0} className="rounded-md p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
              <button onClick={() => addWaterGlass()} className="rounded-md p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {/* Sleep in today summary */}
          {sleepLog && sleepLog.periods.length > 0 && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 dark:bg-indigo-950/20">
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-indigo-500" />
                <span className="text-xs text-muted-foreground">Сон:</span>
                <span className="text-sm font-semibold text-indigo-600">
                  {sleepLog.periods.map((p) => `${p.start}–${p.end}`).join(', ')}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {(() => {
                  const totalMin = sleepLog.periods.reduce((s, p) => {
                    const [sh, sm] = p.start.split(':').map(Number);
                    const [eh, em] = p.end.split(':').map(Number);
                    let st = sh * 60 + sm, en = eh * 60 + em;
                    if (en <= st) en += 24 * 60;
                    return s + (en - st);
                  }, 0);
                  const h = Math.floor(totalMin / 60);
                  const m = totalMin % 60;
                  return `${h}ч ${m > 0 ? m + 'мин' : ''}`.trim();
                })()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Food entries list */}
      <div className="space-y-2">
        {todayEntries.map(renderEntryCard)}
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
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
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
        <Button className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg" size="icon" onClick={() => setIsAddOpen(true)}><Plus className="h-6 w-6" /></Button>
        <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingEntryId ? 'Редактировать приём пищи' : 'Добавить приём пищи'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Photo */}
            <div className="space-y-2">
              <Label className="text-xs">Фото (опционально)</Label>
              <div className="flex gap-2">
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => cameraInputRef.current?.click()}><Camera className="h-3.5 w-3.5" /> Камера</Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}><ImageIcon className="h-3.5 w-3.5" /> Галерея</Button>
              </div>
              {photoBase64 && (
                <div className="relative inline-block">
                  <img src={photoBase64} alt="Preview" className="h-20 w-20 rounded-md object-cover" />
                  <button onClick={() => setPhotoBase64(null)} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"><Trash2 className="h-3 w-3" /></button>
                </div>
              )}
            </div>

            {/* Date & Meal type */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Дата</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Приём пищи</Label>
                <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MEAL_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Item picker — search products & dishes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Состав приёма</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={itemSearch}
                  onChange={(e) => { setItemSearch(e.target.value); setShowItemDropdown(true); }}
                  onFocus={() => setShowItemDropdown(true)}
                  placeholder="Найти продукт или блюдо..."
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {itemSearch && <button onClick={() => setItemSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                {showItemDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border bg-popover p-1 space-y-0.5 shadow-lg">
                    {searchResults.map((r) => (
                      <button
                        key={`${r.type}-${r.id}`}
                        onClick={() => r.type === 'product' ? addItem(r.id, r.name) : addDishItem(r.id, r.name)}
                        className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-accent transition-colors"
                      >
                        <span className="text-xs font-medium break-words flex-1 mr-2">{r.name}</span>
                        <Badge variant="outline" className="text-[9px] shrink-0">{r.type === 'product' ? 'Продукт' : 'Блюдо'}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Selected items list */}
            {items.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Выбрано: {items.length}</span>
                </div>
                <div className="rounded-lg border divide-y">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-2 py-1.5">
                      <span className="flex-1 text-xs min-w-0 break-words">{item.name}</span>
                      <Input
                        type="number"
                        value={item.weightGrams || ''}
                        onChange={(e) => updateItemWeight(idx, Number(e.target.value))}
                        className="w-20 h-7 text-xs text-right"
                      />
                      <span className="text-[10px] text-muted-foreground">г</span>
                      <button onClick={() => removeItem(idx)} className="rounded p-0.5 hover:bg-destructive/10 text-destructive shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description (auto-generated from items, editable) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Описание</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Овсянка с бананом и мёдом, кофе без сахара" rows={2} />
            </div>

            {/* Analyze */}
            <Button onClick={handleAnalyze} disabled={isSending || (!description && !photoBase64)} variant="outline" className="w-full gap-2">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {isSending ? 'Анализирую...' : 'Анализ AI'}
            </Button>
            {(streamingAnalysis || analysisResult) && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs">
                <p className="mb-1 font-semibold text-emerald-700 dark:text-emerald-400">{isSending ? 'Анализ AI (стриминг):' : 'Результат анализа:'}</p>
                <MarkdownRenderer content={streamingAnalysis || analysisResult} className="text-foreground" />
              </div>
            )}
            {showNutrEdit && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Пищевая ценность</p>
                  <p className="text-[10px] text-muted-foreground">Проверьте и скорректируйте</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Калории (ккал)</Label><Input type="number" value={parsedCal} onChange={(e) => setParsedCal(e.target.value)} placeholder="0" className="h-9 text-sm" /></div>
                  <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Белки (г)</Label><Input type="number" value={parsedProt} onChange={(e) => setParsedProt(e.target.value)} placeholder="0" className="h-9 text-sm" /></div>
                  <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Жиры (г)</Label><Input type="number" value={parsedFat} onChange={(e) => setParsedFat(e.target.value)} placeholder="0" className="h-9 text-sm" /></div>
                  <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Углеводы (г)</Label><Input type="number" value={parsedCarbs} onChange={(e) => setParsedCarbs(e.target.value)} placeholder="0" className="h-9 text-sm" /></div>
                </div>
                {(!parsedCal || !parsedProt || !parsedFat || !parsedCarbs) && (
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 dark:bg-amber-950/20 dark:border-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-700 dark:text-amber-400"><p className="font-medium">Не все параметры определены</p><p className="mt-0.5">Заполните вручную или повторите анализ.</p></div>
                  </div>
                )}
              </div>
            )}
            {analysisResult && (
              <Button onClick={handleAnalyze} disabled={isSending || (!description && !photoBase64)} variant="ghost" size="sm" className="w-full gap-2 text-xs text-muted-foreground">
                <RefreshCw className={`h-3.5 w-3.5 ${isSending ? 'animate-spin' : ''}`} /> Повторить анализ
              </Button>
            )}
            {/* Debug */}
            {lastAnalysisDebug && (
              <div className="space-y-1">
                <button onClick={() => setShowDebug(!showDebug)} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
                  <Bug className="h-3 w-3" />{showDebug ? 'Скрыть отладку' : 'Отладка промптов и ответов'}<ChevronDown className={`h-3 w-3 transition-transform ${showDebug ? 'rotate-180' : ''}`} />
                </button>
                {showDebug && (
                  <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2 text-[10px] font-mono max-h-48 overflow-y-auto">
                    <div><p className="font-semibold text-muted-foreground mb-0.5">Промпт:</p><pre className="whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">{lastAnalysisDebug.prompt}</pre></div>
                    <div className="h-px bg-border" />
                    <div><p className="font-semibold text-muted-foreground mb-0.5">Ответ LLM:</p><pre className="whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">{lastAnalysisDebug.response}</pre></div>
                    <div className="h-px bg-border" />
                    <div><p className="font-semibold text-muted-foreground mb-0.5">Парсинг KBJU:</p><p>К: {parsedCal || '—'} | Б: {parsedProt || '—'} | Ж: {parsedFat || '—'} | У: {parsedCarbs || '—'}</p></div>
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
