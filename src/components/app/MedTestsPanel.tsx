'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Trash2, TrendingUp, TrendingDown, Minus, HelpCircle,
  Activity, ChevronDown,
} from 'lucide-react';
import type { MedTestParam, MedTestMeasure, TrendDirection } from '@/lib/types';
import { computeTrend } from '@/lib/types';

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
      {/* last point dot */}
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

  useEffect(() => {
    loadMedTestParams();
    loadMedTestMeasures();
  }, [loadMedTestParams, loadMedTestMeasures]);

  // Auto-select first param
  useEffect(() => {
    if (!selectedParamId && medTestParams.length > 0) {
      setSelectedParamId(medTestParams[0].id);
    }
  }, [medTestParams, selectedParamId]);

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

  return (
    <div className="space-y-4">
      {/* Parameter selector */}
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
                    <Plus className="h-3 w-3" /> Добавить
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
                Нет измерений. Нажмите «Добавить» выше.
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
