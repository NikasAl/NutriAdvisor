'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus, Trash2, TrendingUp, TrendingDown, Minus, HelpCircle,
  Activity, Camera, ImageIcon, Loader2, Check, ScanLine,
} from 'lucide-react';
import type { MedTestParam, MedTestMeasure, TrendDirection } from '@/lib/types';
import { computeTrend } from '@/lib/types';

// ─── Types for OCR result ───────────────────────────────────────────

interface ScannedItem {
  name: string;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  note?: string;
}

interface ScannedGroup {
  date: string;
  items: ScannedItem[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function trendIcon(trend: TrendDirection) {
  if (trend === 'up') return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
  if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === 'stable') return <Minus className="h-3.5 w-3.5 text-yellow-500" />;
  return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function trendLabel(trend: TrendDirection): string {
  if (trend === 'up') return 'Растёт';
  if (trend === 'down') return 'Снижается';
  if (trend === 'stable') return 'Стабильно';
  return 'Мало данных';
}

function formatTrendArrow(values: number[]): string {
  if (values.length === 0) return '';
  return values.map((v) => v.toFixed(1)).join(' → ');
}

/** Try to parse LLM response as JSON array of ScannedGroup */
function parseScannedResult(raw: string): ScannedGroup[] {
  // Strip markdown code fences if present
  let json = raw.trim();
  const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) json = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g: any) => g && Array.isArray(g.items)).map((g: any) => ({
      date: typeof g.date === 'string' ? g.date : '',
      items: g.items
        .filter((it: any) => it && typeof it.name === 'string' && typeof it.value === 'number')
        .map((it: any) => ({
          name: String(it.name),
          value: Number(it.value),
          unit: typeof it.unit === 'string' ? it.unit : '',
          refLow: it.refLow != null ? Number(it.refLow) : null,
          refHigh: it.refHigh != null ? Number(it.refHigh) : null,
          note: it.note ? String(it.note) : undefined,
        })),
    }));
  } catch {
    return [];
  }
}

/** Try to fuzzy-match a scanned item name to an existing MedTestParam */
function findMatchingParam(name: string, params: MedTestParam[]): MedTestParam | null {
  const low = name.toLowerCase().replace(/\s+/g, ' ').trim();
  // Exact match first
  const exact = params.find((p) => p.name.toLowerCase() === low);
  if (exact) return exact;
  // Substring match
  const sub = params.find((p) => low.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(low));
  if (sub) return sub;
  // Keyword match for common abbreviations
  const aliases: Record<string, string[]> = {
    'холестерин': ['холестерин общий', 'общий холестерин'],
    'лпнп': ['лпнп', 'холестерин лпнп', 'ldl'],
    'лпвп': ['лпвп', 'холестерин лпвп', 'hdl'],
    'т4': ['тироксин т4', 'т4 свободный', 'тироксин'],
    'ттг': ['ттг', 'тиреотропный'],
    'hba1c': ['гликированный гемоглобин', 'hba1c'],
    'гемоглобин': ['гемоглобин', 'hb'],
    'глюкоза': ['глюкоза', 'сахар'],
    'алт': ['алт', 'аланинаминотрансфераза'],
    'аст': ['аст', 'аспартатаминотрансфераза'],
  };
  for (const [, keywords] of Object.entries(aliases)) {
    if (keywords.some((k) => low.includes(k) || k.includes(low))) {
      const match = params.find((p) => keywords.some((k) => p.name.toLowerCase().includes(k)));
      if (match) return match;
    }
  }
  return null;
}

// ─── Mini Sparkline (pure SVG) ──────────────────────────────────────

function Sparkline({ values, width = 200, height = 40 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 4;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - 2 * pad);
    const y = height - pad - ((v - min) / range) * (height - 2 * pad);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-500"
      />
      {values.length > 0 && (
        <circle
          cx={pad + ((values.length - 1) / (values.length - 1)) * (width - 2 * pad)}
          cy={height - pad - ((values[values.length - 1] - min) / range) * (height - 2 * pad)}
          r="3"
          className="fill-emerald-500"
        />
      )}
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function MedTestsPanel() {
  const medTestParams = useAppStore((s) => s.medTestParams);
  const medTestMeasures = useAppStore((s) => s.medTestMeasures);
  const loadMedTestParams = useAppStore((s) => s.loadMedTestParams);
  const loadMedTestMeasures = useAppStore((s) => s.loadMedTestMeasures);
  const addMedTestParam = useAppStore((s) => s.addMedTestParam);
  const deleteMedTestParam = useAppStore((s) => s.deleteMedTestParam);
  const addMedTestMeasure = useAppStore((s) => s.addMedTestMeasure);
  const updateMedTestMeasure = useAppStore((s) => s.updateMedTestMeasure);
  const deleteMedTestMeasure = useAppStore((s) => s.deleteMedTestMeasure);
  const scanMedTestFromPhoto = useAppStore((s) => s.scanMedTestFromPhoto);
  const isSending = useAppStore((s) => s.isSending);

  const [selectedParamId, setSelectedParamId] = useState<string | null>(null);
  const [addMeasureOpen, setAddMeasureOpen] = useState(false);
  const [addParamOpen, setAddParamOpen] = useState(false);

  // New measure form
  const [newDate, setNewDate] = useState(getToday());
  const [newValue, setNewVal] = useState('');
  const [newNote, setNewNote] = useState('');

  // New param form
  const [newParamName, setNewParamName] = useState('');
  const [newParamUnit, setNewParamUnit] = useState('');
  const [newParamRefLow, setNewParamRefLow] = useState('');
  const [newParamRefHigh, setNewParamRefHigh] = useState('');

  // Scan from photo state
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedGroups, setScannedGroups] = useState<ScannedGroup[]>([]);
  const [selectedScanItems, setSelectedScanItems] = useState<Set<number>>(new Set());
  // Editable copies of scanned items (by global index)
  const [editedScanItems, setEditedScanItems] = useState<Map<number, ScannedItem>>(new Map());

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMedTestParams();
    loadMedTestMeasures();
  }, [loadMedTestParams, loadMedTestMeasures]);

  // Auto-select first param (derive during render instead of effect)
  if (!selectedParamId && medTestParams.length > 0) {
    setSelectedParamId(medTestParams[0].id);
  }

  const selectedParam = medTestParams.find((p) => p.id === selectedParamId) ?? null;

  const measuresForParam = useMemo(() => {
    if (!selectedParamId) return [];
    return medTestMeasures
      .filter((m) => m.paramId === selectedParamId)
      .sort((a, b) => b.date.localeCompare(a.date)); // newest first
  }, [selectedParamId, medTestMeasures]);

  const valuesForTrend = useMemo(() => {
    if (!selectedParamId) return [];
    return medTestMeasures
      .filter((m) => m.paramId === selectedParamId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => m.value);
  }, [selectedParamId, medTestMeasures]);

  const trend = computeTrend(valuesForTrend);

  // Count how many params have measurements
  const paramsWithMeasures = useMemo(() => {
    const ids = new Set(medTestMeasures.map((m) => m.paramId));
    return medTestParams.filter((p) => ids.has(p.id));
  }, [medTestParams, medTestMeasures]);

  const handleAddMeasure = async () => {
    if (!selectedParamId || !newValue || !newDate) return;
    await addMedTestMeasure(selectedParamId, newDate, parseFloat(newValue), newNote || undefined);
    setNewVal('');
    setNewNote('');
    setAddMeasureOpen(false);
  };

  const handleAddParam = async () => {
    if (!newParamName.trim()) return;
    await addMedTestParam(
      newParamName.trim(),
      newParamUnit.trim() || 'ед.',
      newParamRefLow ? parseFloat(newParamRefLow) : undefined,
      newParamRefHigh ? parseFloat(newParamRefHigh) : undefined,
    );
    setNewParamName('');
    setNewParamUnit('');
    setNewParamRefLow('');
    setNewParamRefHigh('');
    setAddParamOpen(false);
  };

  // ─── Photo scan handlers ───────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setScanPhoto(reader.result as string);
      setScanError('');
      setScannedGroups([]);
      setSelectedScanItems(new Set());
      setEditedScanItems(new Map());
    };
    reader.readAsDataURL(file);
    // Reset file input so the same file can be re-selected
    e.target.value = '';
  };

  const handleScanPhoto = async () => {
    if (!scanPhoto) return;
    setScanLoading(true);
    setScanError('');
    try {
      const raw = await scanMedTestFromPhoto(scanPhoto);
      const groups = parseScannedResult(raw);
      if (groups.length === 0 || groups.every((g) => g.items.length === 0)) {
        setScanError('Не удалось распознать анализы на фото. Попробуйте другое изображение или введите данные вручную.');
        setScannedGroups([]);
      } else {
        setScannedGroups(groups);
        // Pre-select all items
        const allIndices: number[] = [];
        let idx = 0;
        for (const g of groups) {
          for (const _ of g.items) {
            allIndices.push(idx++);
          }
        }
        setSelectedScanItems(new Set(allIndices));
        setEditedScanItems(new Map());
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Ошибка при распознавании');
    } finally {
      setScanLoading(false);
    }
  };

  // Flatten scanned groups for indexing
  const flatScanItems = useMemo(() => {
    const flat: (ScannedItem & { date: string; groupIdx: number })[] = [];
    scannedGroups.forEach((g, gi) => {
      for (const it of g.items) {
        flat.push({ ...it, date: g.date, groupIdx: gi });
      }
    });
    return flat;
  }, [scannedGroups]);

  const toggleScanItem = (idx: number) => {
    setSelectedScanItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const updateScanItem = (idx: number, field: keyof ScannedItem, val: any) => {
    setEditedScanItems((prev) => {
      const next = new Map(prev);
      const base = next.get(idx) ?? flatScanItems[idx];
      next.set(idx, { ...base, [field]: val });
      return next;
    });
  };

  const getItem = (idx: number): ScannedItem & { date: string } => {
    const edited = editedScanItems.get(idx);
    const base = flatScanItems[idx];
    return edited ? { ...base, ...edited } : base;
  };

  const handleImportScanned = async () => {
    // Ensure params are loaded
    await loadMedTestParams();
    const currentParams = useAppStore.getState().medTestParams;

    for (const idx of selectedScanItems) {
      const item = getItem(idx);
      if (!item.name || item.value == null) continue;

      // Find or create matching param
      let param = findMatchingParam(item.name, currentParams);
      if (!param) {
        // Create a new param for this item
        await addMedTestParam(
          item.name,
          item.unit || 'ед.',
          item.refLow ?? undefined,
          item.refHigh ?? undefined,
        );
        // Re-read params after adding
        await loadMedTestParams();
        const updatedParams = useAppStore.getState().medTestParams;
        param = updatedParams.find((p) => p.name === item.name) ?? null;
      }
      if (!param) continue;

      // Add measurement
      const date = item.date || getToday();
      await addMedTestMeasure(param.id, date, item.value, item.note);
    }

    // Reset and close
    setScanOpen(false);
    setScanPhoto(null);
    setScannedGroups([]);
    setSelectedScanItems(new Set());
    setEditedScanItems(new Map());
  };

  const totalScannedCount = flatScanItems.length;
  const selectedScannedCount = selectedScanItems.size;

  return (
    <div className="space-y-4">
      {/* Parameter selector + scan button */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              Параметры анализов
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {paramsWithMeasures.length} из {medTestParams.length} с данными
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="flex gap-2 items-center mb-3">
            <Select
              value={selectedParamId ?? ''}
              onValueChange={(v) => setSelectedParamId(v)}
            >
              <SelectTrigger className="flex-1 text-sm">
                <SelectValue placeholder="Выберите параметр" />
              </SelectTrigger>
              <SelectContent>
                {medTestParams.map((p) => {
                  const count = medTestMeasures.filter((m) => m.paramId === p.id).length;
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {count > 0 && `(${count})`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Scan from photo button */}
            <Dialog open={scanOpen} onOpenChange={(open) => {
              setScanOpen(open);
              if (!open) {
                setScanPhoto(null);
                setScannedGroups([]);
                setScanError('');
                setSelectedScanItems(new Set());
                setEditedScanItems(new Map());
              }
            }}>
              <DialogTrigger asChild>
                <Button size="icon" variant="outline" className="shrink-0" title="Сканировать анализы с фото">
                  <ScanLine className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ScanLine className="h-4 w-4" />
                    Распознать анализы с фото
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  {/* Photo capture */}
                  {!scanPhoto && (
                    <div className="flex gap-2">
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      <Button variant="outline" className="flex-1 gap-1.5" onClick={() => cameraInputRef.current?.click()}>
                        <Camera className="h-4 w-4" /> Камера
                      </Button>
                      <Button variant="outline" className="flex-1 gap-1.5" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="h-4 w-4" /> Галерея
                      </Button>
                    </div>
                  )}

                  {/* Photo preview + scan button */}
                  {scanPhoto && scannedGroups.length === 0 && !scanLoading && (
                    <>
                      <div className="rounded-lg overflow-hidden border bg-muted/30">
                        <img src={scanPhoto} alt="Фото анализов" className="w-full max-h-48 object-contain" />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleScanPhoto}
                          className="flex-1 gap-1.5"
                          disabled={scanLoading}
                        >
                          <ScanLine className="h-4 w-4" /> Распознать
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setScanPhoto(null); setScanError(''); }}
                        >
                          Другое фото
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Loading */}
                  {scanLoading && (
                    <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Распознаю анализы…
                    </div>
                  )}

                  {/* Error */}
                  {scanError && (
                    <div className="text-xs text-destructive bg-destructive/10 rounded-md p-3">
                      {scanError}
                    </div>
                  )}

                  {/* Scanned results preview with checkboxes and editing */}
                  {scannedGroups.length > 0 && !scanLoading && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Найдено параметров: {totalScannedCount}. Выберите какие добавить и проверьте значения.
                      </p>
                      {scanPhoto && (
                        <div className="rounded-lg overflow-hidden border bg-muted/30">
                          <img src={scanPhoto} alt="Фото анализов" className="w-full max-h-32 object-contain" />
                        </div>
                      )}
                      {scannedGroups.map((group, gi) => (
                        <div key={gi}>
                          {group.date && (
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              Дата: {group.date}
                            </div>
                          )}
                          <div className="space-y-1">
                            {group.items.map((item, ii) => {
                              const flatIdx = flatScanItems.findIndex(
                                (f) => f.groupIdx === gi && f.name === item.name && f.value === item.value
                              );
                              const isSelected = selectedScanItems.has(flatIdx);
                              const edited = editedScanItems.get(flatIdx);
                              const displayItem = edited ? { ...item, ...edited } : item;
                              const matchedParam = findMatchingParam(displayItem.name, medTestParams);
                              const isOutOfRange = (displayItem.refLow != null && displayItem.value < displayItem.refLow) ||
                                (displayItem.refHigh != null && displayItem.value > displayItem.refHigh);

                              return (
                                <div
                                  key={ii}
                                  className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${
                                    isSelected ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-transparent bg-muted/30 opacity-60'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleScanItem(flatIdx)}
                                    className="mt-0.5 shrink-0 accent-emerald-500"
                                  />
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {/* Editable name */}
                                      <Input
                                        value={displayItem.name}
                                        onChange={(e) => updateScanItem(flatIdx, 'name', e.target.value)}
                                        className="h-6 text-xs border-0 p-0 focus-visible:ring-0 bg-transparent font-medium flex-1 min-w-[80px]"
                                      />
                                      {matchedParam && (
                                        <Badge variant="secondary" className="text-[9px] shrink-0">
                                          ↔ {matchedParam.name}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {/* Editable value */}
                                      <Input
                                        type="number"
                                        step="any"
                                        value={displayItem.value}
                                        onChange={(e) => updateScanItem(flatIdx, 'value', parseFloat(e.target.value) || 0)}
                                        className={`h-6 text-xs w-20 border-0 p-0 focus-visible:ring-0 bg-transparent font-mono ${isOutOfRange ? 'text-red-600' : ''}`}
                                      />
                                      {/* Editable unit */}
                                      <Input
                                        value={displayItem.unit}
                                        onChange={(e) => updateScanItem(flatIdx, 'unit', e.target.value)}
                                        className="h-6 text-xs w-16 border-0 p-0 focus-visible:ring-0 bg-transparent text-muted-foreground"
                                      />
                                      {isOutOfRange && <span className="text-red-500 text-[10px]">⚠</span>}
                                    </div>
                                    {(displayItem.refLow != null || displayItem.refHigh != null) && (
                                      <div className="text-[10px] text-muted-foreground">
                                        реф: {displayItem.refLow ?? '—'}–{displayItem.refHigh ?? '—'} {displayItem.unit}
                                      </div>
                                    )}
                                    {displayItem.note && (
                                      <div className="text-[10px] text-muted-foreground italic">
                                        {displayItem.note}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={handleImportScanned}
                          disabled={selectedScannedCount === 0}
                          className="flex-1 gap-1.5"
                        >
                          <Check className="h-4 w-4" />
                          Добавить выбранные ({selectedScannedCount})
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setScannedGroups([]);
                            setScanPhoto(null);
                            setScanError('');
                          }}
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Add custom param dialog */}
            <Dialog open={addParamOpen} onOpenChange={setAddParamOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="outline" className="shrink-0" title="Добавить свой параметр">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новый параметр анализа</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Название</Label>
                    <Input
                      value={newParamName}
                      onChange={(e) => setNewParamName(e.target.value)}
                      placeholder="Например: Инсулин"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Единица измерения</Label>
                    <Input
                      value={newParamUnit}
                      onChange={(e) => setNewParamUnit(e.target.value)}
                      placeholder="Например: мЕд/л"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Реф. минимум</Label>
                      <Input
                        type="number"
                        value={newParamRefLow}
                        onChange={(e) => setNewParamRefLow(e.target.value)}
                        placeholder="—"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Реф. максимум</Label>
                      <Input
                        type="number"
                        value={newParamRefHigh}
                        onChange={(e) => setNewParamRefHigh(e.target.value)}
                        placeholder="—"
                      />
                    </div>
                  </div>
                  <Button onClick={handleAddParam} disabled={!newParamName.trim()} className="w-full">
                    Добавить
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Selected param info */}
          {selectedParam && (
            <div className="text-xs text-muted-foreground mb-1">
              {selectedParam.unit}
              {selectedParam.refLow != null && selectedParam.refHigh != null && (
                <> · референс: {selectedParam.refLow}–{selectedParam.refHigh} {selectedParam.unit}</>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trend visualization */}
      {selectedParam && valuesForTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{selectedParam.name} — тренд</CardTitle>
              <div className="flex items-center gap-1.5">
                {trendIcon(trend)}
                <span className="text-xs text-muted-foreground">{trendLabel(trend)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {/* Sparkline chart */}
            <div className="bg-muted/30 rounded-lg p-2">
              <Sparkline values={valuesForTrend} width={280} height={50} />
            </div>

            {/* Arrow trend line */}
            <div className="text-xs text-muted-foreground font-mono">
              {formatTrendArrow(valuesForTrend)} {selectedParam.unit}
            </div>

            {/* Last value badge */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                Последнее: {valuesForTrend[valuesForTrend.length - 1]} {selectedParam.unit}
              </Badge>
              {selectedParam.refLow != null && selectedParam.refHigh != null && (() => {
                const last = valuesForTrend[valuesForTrend.length - 1];
                const isLow = last < (selectedParam.refLow ?? -Infinity);
                const isHigh = last > (selectedParam.refHigh ?? Infinity);
                if (isLow) return <Badge variant="destructive" className="text-[10px]">Ниже нормы</Badge>;
                if (isHigh) return <Badge variant="destructive" className="text-[10px]">Выше нормы</Badge>;
                return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">В норме</Badge>;
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Measurements table + add */}
      {selectedParam && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Измерения ({measuresForParam.length})</CardTitle>
              <Dialog open={addMeasureOpen} onOpenChange={setAddMeasureOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" /> Вручную
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Новое измерение: {selectedParam.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Дата сдачи</Label>
                      <Input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Результат ({selectedParam.unit})</Label>
                      <Input
                        type="number"
                        step="any"
                        value={newValue}
                        onChange={(e) => setNewVal(e.target.value)}
                        placeholder={`Введите значение в ${selectedParam.unit}`}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Заметка (необязательно)</Label>
                      <Input
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="натощак, после еды…"
                      />
                    </div>
                    <Button
                      onClick={handleAddMeasure}
                      disabled={!newValue || !newDate}
                      className="w-full"
                    >
                      Добавить
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {measuresForParam.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Нет измерений. Нажмите «Вручную» или отсканируйте фото анализов.
              </p>
            ) : (
              <div className="space-y-1.5">
                {measuresForParam.map((m) => {
                  const isOutOfRange =
                    (selectedParam.refLow != null && m.value < selectedParam.refLow) ||
                    (selectedParam.refHigh != null && m.value > selectedParam.refHigh);
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                        isOutOfRange
                          ? 'border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10'
                          : 'border-transparent bg-muted/30'
                      }`}
                    >
                      <span className="text-muted-foreground w-20 shrink-0">{m.date}</span>
                      <span className={`font-mono font-semibold ${isOutOfRange ? 'text-red-600 dark:text-red-400' : ''}`}>
                        {m.value}
                      </span>
                      <span className="text-muted-foreground">{selectedParam.unit}</span>
                      {m.note && (
                        <span className="text-muted-foreground italic truncate flex-1">({m.note})</span>
                      )}
                      {isOutOfRange && (
                        <span className="text-red-500 text-[10px]">⚠</span>
                      )}
                      <button
                        onClick={() => deleteMedTestMeasure(m.id)}
                        className="ml-auto shrink-0 rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Удалить измерение"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manage params (delete custom) */}
      {medTestParams.some((p) => !p.isDefault) && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-muted-foreground">Свои параметры</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {medTestParams.filter((p) => !p.isDefault).map((p) => {
                const count = medTestMeasures.filter((m) => m.paramId === p.id).length;
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                    <span className="font-medium flex-1">{p.name}</span>
                    <span className="text-muted-foreground">{p.unit}</span>
                    {count > 0 && <span className="text-muted-foreground">({count} изм.)</span>}
                    <button
                      onClick={() => deleteMedTestParam(p.id)}
                      className="shrink-0 rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Удалить параметр и все его измерения"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
