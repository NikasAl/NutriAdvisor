'use client';

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Plus, Trash2, Pencil, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Activity, Heart, Smile, Check, Clock, X,
} from 'lucide-react';
import type { DiaryEntryType, DiaryEntry } from '@/lib/types';
import { DIARY_TYPE_LABELS } from '@/lib/types';

const TYPE_ICONS: Record<DiaryEntryType, React.ElementType> = {
  activity: Activity,
  wellbeing: Smile,
  blood_pressure: Heart,
};

const TYPE_COLORS: Record<DiaryEntryType, string> = {
  activity: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  wellbeing: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  blood_pressure: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
};

const PAGE_SIZE = 15;

function formatDiaryDate(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterdayDate) return 'Вчера';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export default function DiaryPanel() {
  const diaryEntries = useAppStore((s) => s.diaryEntries);
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const updateDiaryEntry = useAppStore((s) => s.updateDiaryEntry);
  const deleteDiaryEntry = useAppStore((s) => s.deleteDiaryEntry);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [entryType, setEntryType] = useState<DiaryEntryType>('activity');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [entryTime, setEntryTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Activity fields
  const [activityDesc, setActivityDesc] = useState('');
  const [duration, setDuration] = useState('');

  // Wellbeing fields
  const [wellbeingNote, setWellbeingNote] = useState('');

  // Blood pressure fields
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');

  // Pagination & grouping
  const [page, setPage] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['today']));

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Group entries by date
  const grouped = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    for (const e of diaryEntries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    const sortedDates = Array.from(map.keys()).sort().reverse();
    return sortedDates.map((date) => ({ date, entries: map.get(date)! }));
  }, [diaryEntries]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const paginatedGroups = useMemo(() => {
    return grouped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [grouped, page]);

  // Stats for today
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = diaryEntries.filter((e) => e.date === today);
  const todayActivities = todayEntries.filter((e) => e.type === 'activity');
  const todayBp = todayEntries.filter((e) => e.type === 'blood_pressure');
  const todayWellbeing = todayEntries.filter((e) => e.type === 'wellbeing');
  const totalActivityMin = todayActivities.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);

  const resetForm = () => {
    setEditingId(null);
    setEntryType('activity');
    setSelectedDate(new Date().toISOString().split('T')[0]);
    const now = new Date();
    setEntryTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setActivityDesc('');
    setDuration('');
    setWellbeingNote('');
    setSystolic('');
    setDiastolic('');
    setPulse('');
  };

  const handleSave = async () => {
    const base = { date: selectedDate, time: entryTime || undefined, type: entryType };

    if (entryType === 'activity') {
      if (!activityDesc.trim()) return;
      const data = { ...base, description: activityDesc.trim(), durationMinutes: duration ? Number(duration) : undefined };
      if (editingId) {
        await updateDiaryEntry(editingId, data);
      } else {
        await addDiaryEntry(data as Omit<DiaryEntry, 'id' | 'createdAt'>);
      }
    } else if (entryType === 'wellbeing') {
      if (!wellbeingNote.trim()) return;
      const data = { ...base, note: wellbeingNote.trim() };
      if (editingId) {
        await updateDiaryEntry(editingId, data);
      } else {
        await addDiaryEntry(data as Omit<DiaryEntry, 'id' | 'createdAt'>);
      }
    } else if (entryType === 'blood_pressure') {
      if (!systolic || !diastolic) return;
      const data = { ...base, systolic: Number(systolic), diastolic: Number(diastolic), pulse: pulse ? Number(pulse) : undefined };
      if (editingId) {
        await updateDiaryEntry(editingId, data);
      } else {
        await addDiaryEntry(data as Omit<DiaryEntry, 'id' | 'createdAt'>);
      }
    }
    resetForm();
  };

  const handleEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id ?? null);
    setEntryType(entry.type);
    setSelectedDate(entry.date);
    setEntryTime(entry.time ?? '');
    if (entry.type === 'activity') {
      setActivityDesc(entry.description ?? '');
      setDuration(entry.durationMinutes ? String(entry.durationMinutes) : '');
    } else if (entry.type === 'wellbeing') {
      setWellbeingNote(entry.note ?? '');
    } else if (entry.type === 'blood_pressure') {
      setSystolic(entry.systolic ? String(entry.systolic) : '');
      setDiastolic(entry.diastolic ? String(entry.diastolic) : '');
      setPulse(entry.pulse ? String(entry.pulse) : '');
    }
    setIsAddOpen(true);
  };

  const renderEntry = (entry: DiaryEntry) => {
    const eid = entry.id ?? '';
    const Icon = TYPE_ICONS[entry.type];
    const colorClass = TYPE_COLORS[entry.type];

    return (
      <div key={eid} className="flex items-start gap-2 py-2 px-1">
        <div className={`shrink-0 mt-0.5 rounded-md p-1.5 ${colorClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{DIARY_TYPE_LABELS[entry.type]}</Badge>
            {entry.time && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />{entry.time}
              </span>
            )}
          </div>
          {entry.type === 'activity' && (
            <p className="mt-0.5 text-sm">
              {entry.description}
              {entry.durationMinutes && <span className="text-muted-foreground"> — {entry.durationMinutes} мин</span>}
            </p>
          )}
          {entry.type === 'wellbeing' && (
            <p className="mt-0.5 text-sm">{entry.note}</p>
          )}
          {entry.type === 'blood_pressure' && (
            <p className="mt-0.5 text-sm">
              {entry.systolic}/{entry.diastolic} мм рт.ст.
              {entry.pulse && <span className="text-muted-foreground">, пульс {entry.pulse} уд/мин</span>}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => handleEdit(entry)} className="rounded-md p-1 hover:bg-muted text-muted-foreground" title="Редактировать">
            <Pencil className="h-3.5 w-3.5" />
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
                <AlertDialogAction onClick={() => deleteDiaryEntry(eid)} className="bg-destructive text-destructive-foreground">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Today summary */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Сегодня</h3>
            <span className="text-xs text-muted-foreground">{todayEntries.length} записей</span>
          </div>
          {todayEntries.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-blue-600">{todayActivities.length}</div>
                <div className="text-[10px] text-muted-foreground">Активностей</div>
                {totalActivityMin > 0 && <div className="text-[10px] text-muted-foreground">{totalActivityMin} мин</div>}
              </div>
              <div>
                <div className="text-lg font-bold text-amber-600">{todayWellbeing.length}</div>
                <div className="text-[10px] text-muted-foreground">Заметки</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-600">{todayBp.length}</div>
                <div className="text-[10px] text-muted-foreground">Давлений</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Добавьте запись в дневник</p>
          )}
        </CardContent>
      </Card>

      {/* Entries grouped by date */}
      <div className="space-y-2">
        {paginatedGroups.map((group) => {
          const todayKey = new Date().toISOString().split('T')[0];
          const groupKey = group.date === todayKey ? 'today' : group.date;
          const isExpanded = expandedGroups.has(groupKey);
          return (
            <Card key={group.date}>
              <CardHeader
                className="pb-1 pt-3 px-4 cursor-pointer select-none"
                onClick={() => toggleGroup(groupKey)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {formatDiaryDate(group.date)}
                    <span className="ml-2 text-[10px]">({group.entries.length})</span>
                  </CardTitle>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="px-4 pb-3">
                  {group.entries.map(renderEntry)}
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {diaryEntries.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Activity className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p>Дневник пуст</p>
            <p className="text-xs">Нажмите + чтобы добавить запись</p>
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
            <DialogTitle>{editingId ? 'Редактировать запись' : 'Новая запись'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Type selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Тип записи</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(DIARY_TYPE_LABELS) as DiaryEntryType[]).map((t) => {
                  const Icon = TYPE_ICONS[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setEntryType(t)}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 transition-colors ${
                        entryType === t ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[10px] font-medium">{DIARY_TYPE_LABELS[t]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Дата</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Время</Label>
                <Input
                  type="time"
                  value={entryTime}
                  onChange={(e) => setEntryTime(e.target.value)}
                />
              </div>
            </div>

            {/* Activity form */}
            {entryType === 'activity' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Описание активности</Label>
                  <Textarea
                    value={activityDesc}
                    onChange={(e) => setActivityDesc(e.target.value)}
                    placeholder="Прогулка 10км пешком, занятия на тренажерах..."
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Длительность (мин, опционально)</Label>
                  <Input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="60"
                  />
                </div>
              </>
            )}

            {/* Wellbeing form */}
            {entryType === 'wellbeing' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Как вы себя чувствуете?</Label>
                <Textarea
                  value={wellbeingNote}
                  onChange={(e) => setWellbeingNote(e.target.value)}
                  placeholder="После прогулки бодрость и прилив сил..."
                  rows={3}
                />
              </div>
            )}

            {/* Blood pressure form */}
            {entryType === 'blood_pressure' && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Верхнее</Label>
                  <Input type="number" value={systolic} onChange={(e) => setSystolic(e.target.value)} placeholder="120" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Нижнее</Label>
                  <Input type="number" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} placeholder="80" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Пульс</Label>
                  <Input type="number" value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="72" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Отмена</Button></DialogClose>
            <Button onClick={handleSave} disabled={
              (entryType === 'activity' && !activityDesc.trim()) ||
              (entryType === 'wellbeing' && !wellbeingNote.trim()) ||
              (entryType === 'blood_pressure' && (!systolic || !diastolic))
            }>
              <Check className="mr-1.5 h-4 w-4" /> {editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
