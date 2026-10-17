'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  Plus, Loader2, Trash2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Pencil, Dumbbell, X, Flame, Clock, Sparkles,
  Activity, Check, Copy, Play, Square, Timer,
} from 'lucide-react';
import type { ExerciseCategory, WorkoutEntry, WorkoutSet, DiaryEntry } from '@/lib/types';
import { EXERCISE_CATEGORY_LABELS } from '@/lib/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

/** Parse calories burned and duration from AI analysis text */
function parseWorkoutFromText(text: string) {
  const result = { caloriesBurned: null as number | null, duration: null as number | null };
  const num = '(\\d+[.,]?\\d*)';
  const sep = '[\\s:*|\\u2014\\u2013-]+';

  // Calories burned patterns
  const calP = [
    new RegExp(`(?:сожжено|расход|потрачено|израсходовано|ккал|calories?\\s+burned|burned\\s+calories?)${sep}[~≈]?\\s*${num}\\s*(?:ккал|кКал|kkal|cal|к)?`, 'i'),
    new RegExp(`(?:ккал|kkal)${sep}[~≈]?\\s*${num}`, 'i'),
    new RegExp(`${num}\\s*(?:ккал|kkal)`, 'i'),
    new RegExp(`(?:Калории|Calories)${sep}${num}`, 'i'),
  ];
  for (const p of calP) { const m = text.match(p); if (m) { result.caloriesBurned = parseFloat(m[1].replace(',', '.')); break; } }

  // Duration patterns (in minutes)
  const durP = [
    new RegExp(`(?:длительность|время|продолжительность|duration|минут)${sep}[~≈]?\\s*${num}\\s*(?:мин|минут|м|min)?`, 'i'),
    new RegExp(`${num}\\s*(?:мин|минут|min)`, 'i'),
  ];
  for (const p of durP) { const m = text.match(p); if (m) { result.duration = parseFloat(m[1].replace(',', '.')); break; } }

  return result;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yd = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yd) return 'Вчера';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

const CATEGORIES: ExerciseCategory[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio', 'other'];
const PAGE_SIZE = 10;

export default function WorkoutPanel() {
  const exercises = useAppStore((s) => s.exercises);
  const workoutEntries = useAppStore((s) => s.workoutEntries);
  const loadWorkoutEntries = useAppStore((s) => s.loadWorkoutEntries);
  const addWorkoutEntry = useAppStore((s) => s.addWorkoutEntry);
  const updateWorkoutEntry = useAppStore((s) => s.updateWorkoutEntry);
  const deleteWorkoutEntry = useAppStore((s) => s.deleteWorkoutEntry);
  const addExercise = useAppStore((s) => s.addExercise);
  const deleteExercise = useAppStore((s) => s.deleteExercise);
  const analyzeWorkoutStream = useAppStore((s) => s.analyzeWorkoutStream);
  const isSending = useAppStore((s) => s.isSending);
  const streamingAnalysis = useAppStore((s) => s.streamingAnalysis);
  const profile = useAppStore((s) => s.profile);

  // Activity diary entries (moved from Diary page)
  const diaryEntries = useAppStore((s) => s.diaryEntries);
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const updateDiaryEntry = useAppStore((s) => s.updateDiaryEntry);
  const deleteDiaryEntry = useAppStore((s) => s.deleteDiaryEntry);

  // Filter activity entries from diary
  const activityEntries = useMemo(
    () => diaryEntries.filter((e) => e.type === 'activity'),
    [diaryEntries]
  );

  // Pagination
  const [page, setPage] = useState(0);

  // Exercise library expand
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState<ExerciseCategory>('other');

  // Workout entry dialog
  const [isWorkoutDialogOpen, setIsWorkoutDialogOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutEntry | null>(null);
  const [workoutName, setWorkoutName] = useState('');
  const [workoutDate, setWorkoutDate] = useState('');
  const [workoutSets, setWorkoutSets] = useState<WorkoutSet[]>([]);
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [workoutCalories, setWorkoutCalories] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Timer tick for live elapsed display (updates every second while any timer is running)
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    const hasRunning = workoutSets.some((s) => s.startTime && !s.endTime);
    if (!hasRunning) return;
    const iv = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [workoutSets.some((s) => s.startTime && !s.endTime), timerTick]);

  // Expanded entry cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Activity dialog (moved from Diary)
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [activityDesc, setActivityDesc] = useState('');
  const [activityDuration, setActivityDuration] = useState('');
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activityTime, setActivityTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  useEffect(() => { loadWorkoutEntries(); }, [loadWorkoutEntries]);

  // Reset page when entries change
  useEffect(() => { setPage(0); }, [workoutEntries]);

  const today = new Date().toISOString().split('T')[0];
  const todayEntries = workoutEntries.filter((e) => e.date === today);
  const totalDuration = todayEntries.reduce((sum, e) => sum + (e.estimatedDuration ?? 0), 0);
  const totalCaloriesBurned = todayEntries.reduce((sum, e) => sum + (e.estimatedCaloriesBurned ?? 0), 0);

  const olderEntries = useMemo(() => {
    const nonToday = workoutEntries.filter((e) => e.date !== today);
    const grouped = new Map<string, WorkoutEntry[]>();
    for (const entry of nonToday) { if (!grouped.has(entry.date)) grouped.set(entry.date, []); grouped.get(entry.date)!.push(entry); }
    const sortedDates = Array.from(grouped.keys()).sort().reverse();
    return sortedDates.map((date) => ({ date, entries: grouped.get(date)! }));
  }, [workoutEntries, today]);

  const totalPages = Math.max(1, Math.ceil(olderEntries.length / PAGE_SIZE));
  const paginatedGroups = useMemo(() => olderEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [olderEntries, page]);

  // Group exercises by category
  const exercisesByCategory = useMemo(() => {
    const map = new Map<ExerciseCategory, typeof exercises>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const ex of exercises) {
      const arr = map.get(ex.category) ?? [];
      arr.push(ex);
      map.set(ex.category, arr);
    }
    return map;
  }, [exercises]);

  // Handle add exercise
  const handleAddExercise = async () => {
    if (!newExName.trim()) return;
    await addExercise(newExName.trim(), newExCategory);
    setNewExName('');
    setNewExCategory('other');
    setAddExerciseOpen(false);
  };

  // Open new workout dialog
  const openNewWorkout = () => {
    setEditingWorkout(null);
    setWorkoutName('');
    setWorkoutDate(today);
    setWorkoutSets([{ exerciseId: '', exerciseName: '', weight: undefined, reps: undefined, sets: undefined, duration: undefined, distance: undefined, notes: '', startTime: undefined, endTime: undefined }]);
    setWorkoutDuration('');
    setWorkoutCalories('');
    setAiAnalysis('');
    setIsWorkoutDialogOpen(true);
  };

  // Open edit workout dialog
  const openEditWorkout = (entry: WorkoutEntry) => {
    setEditingWorkout(entry);
    setWorkoutName(entry.name || '');
    setWorkoutDate(entry.date);
    setWorkoutSets(entry.sets.length > 0 ? entry.sets : [{ exerciseId: '', exerciseName: '', weight: undefined, reps: undefined, sets: undefined, duration: undefined, distance: undefined, notes: '', startTime: undefined, endTime: undefined }]);
    setWorkoutDuration(entry.estimatedDuration?.toString() || '');
    setWorkoutCalories(entry.estimatedCaloriesBurned?.toString() || '');
    setAiAnalysis(entry.aiAnalysis || '');
    setIsWorkoutDialogOpen(true);
  };

  // Copy workout as template (open as new, copying sets but clearing analysis)
  const handleWorkoutTemplate = (entry: WorkoutEntry) => {
    setEditingWorkout(null);
    setWorkoutName(entry.name || '');
    setWorkoutDate(new Date().toISOString().split('T')[0]);
    setWorkoutSets(entry.sets.length > 0 ? entry.sets.map(s => ({ ...s, startTime: undefined, endTime: undefined })) : [{ exerciseId: '', exerciseName: '', weight: undefined, reps: undefined, sets: undefined, duration: undefined, distance: undefined, notes: '', startTime: undefined, endTime: undefined }]);
    setWorkoutDuration('');
    setWorkoutCalories('');
    setAiAnalysis('');
    setIsWorkoutDialogOpen(true);
  };

  // Save workout
  const handleSaveWorkout = async () => {
    const validSets = workoutSets.filter((s) => s.exerciseId && s.exerciseName);
    if (validSets.length === 0) return;

    const entryData = {
      date: workoutDate || today,
      name: workoutName.trim() || undefined,
      sets: validSets,
      estimatedDuration: workoutDuration ? parseFloat(workoutDuration) : undefined,
      estimatedCaloriesBurned: workoutCalories ? parseFloat(workoutCalories) : undefined,
      aiAnalysis: aiAnalysis || undefined,
    };

    if (editingWorkout?.id) {
      await updateWorkoutEntry(editingWorkout.id, entryData);
    } else {
      await addWorkoutEntry(entryData);
    }
    setIsWorkoutDialogOpen(false);
  };

  // AI analysis
  const handleAnalyze = async () => {
    const provider = useAppStore.getState().providers.find(p => p.isActive);
    if (!provider || !provider.baseUrl || !provider.model) return;

    setIsAnalyzing(true);
    try {
      const validSets = workoutSets.filter((s) => s.exerciseId && s.exerciseName);
      const lines = validSets.map((s) => {
        let line = s.exerciseName;
        if (s.weight) line += ` ${s.weight}кг`;
        if (s.reps) line += ` × ${s.reps} повторов`;
        if (s.sets) line += ` × ${s.sets} подхода`;
        if (s.duration) line += ` ${s.duration}мин`;
        if (s.distance) line += ` ${s.distance}км`;
        return line;
      });

      const profileInfo: string[] = [];
      if (profile.name) profileInfo.push(`Имя: ${profile.name}`);
      if (profile.weight) profileInfo.push(`Вес: ${profile.weight} кг`);
      if (profile.age) profileInfo.push(`Возраст: ${profile.age}`);

      const prompt = `Тренировка: ${workoutName || 'Без названия'}\n${lines.join('\n')}${workoutDuration ? `\nДлительность: ${workoutDuration} мин` : ''}`;

      const result = await analyzeWorkoutStream(prompt);
      setAiAnalysis(result);
      // Parse calories burned and duration from AI response
      const parsed = parseWorkoutFromText(result);
      if (parsed.caloriesBurned !== null) setWorkoutCalories(String(Math.round(parsed.caloriesBurned)));
      if (parsed.duration !== null) setWorkoutDuration(String(Math.round(parsed.duration)));
    } catch {
      // ignore
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-calculate total duration from exercise start/end times
  const calcDurationFromTimers = () => {
    const setsWithTime = workoutSets.filter((s) => s.startTime && s.endTime);
    if (setsWithTime.length === 0) return;
    // Find earliest start and latest end
    const earliestStart = Math.min(...setsWithTime.map((s) => s.startTime!));
    const latestEnd = Math.max(...setsWithTime.map((s) => s.endTime!));
    const durationMin = Math.round((latestEnd - earliestStart) / 60000);
    if (durationMin > 0) setWorkoutDuration(String(durationMin));
  };

  // Update a single set field
  const updateSet = (index: number, field: keyof WorkoutSet, value: string | number | undefined) => {
    setWorkoutSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Add empty set
  const addSet = () => {
    setWorkoutSets((prev) => [...prev, { exerciseId: '', exerciseName: '', weight: undefined, reps: undefined, sets: undefined, duration: undefined, distance: undefined, notes: '', startTime: undefined, endTime: undefined }]);
  };

  // Remove set
  const removeSet = (index: number) => {
    setWorkoutSets((prev) => prev.filter((_, i) => i !== index));
  };

  // Duplicate set (copy exercise, clear timer fields)
  const duplicateSet = (index: number) => {
    setWorkoutSets((prev) => {
      const source = prev[index];
      const copy: WorkoutSet = {
        ...source,
        startTime: undefined,
        endTime: undefined,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  // Start/stop timer for an exercise
  const toggleTimer = (index: number) => {
    setWorkoutSets((prev) => {
      const next = [...prev];
      const set = next[index];
      if (!set.startTime) {
        // Start timer
        next[index] = { ...set, startTime: Date.now(), endTime: undefined };
      } else if (!set.endTime) {
        // Stop timer
        next[index] = { ...set, endTime: Date.now() };
      } else {
        // Reset timer
        next[index] = { ...set, startTime: undefined, endTime: undefined };
      }
      return next;
    });
  };

  // Select exercise for a set
  const selectExerciseForSet = (index: number, exerciseId: string) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (exercise) {
      setWorkoutSets((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], exerciseId: exercise.id, exerciseName: exercise.name };
        return next;
      });
    }
  };

  // Toggle expanded entry
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Activity entries grouped by date
  const todayActivityEntries = activityEntries.filter((e) => e.date === today);
  const totalActivityMin = todayActivityEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);

  const olderActivityEntries = useMemo(() => {
    const nonToday = activityEntries.filter((e) => e.date !== today);
    const grouped = new Map<string, DiaryEntry[]>();
    for (const entry of nonToday) {
      if (!grouped.has(entry.date)) grouped.set(entry.date, []);
      grouped.get(entry.date)!.push(entry);
    }
    const sortedDates = Array.from(grouped.keys()).sort().reverse();
    return sortedDates.map((date) => ({ date, entries: grouped.get(date)! }));
  }, [activityEntries, today]);

  // Activity dialog handlers
  const openNewActivity = () => {
    setEditingActivityId(null);
    setActivityDesc('');
    setActivityDuration('');
    setActivityDate(today);
    const now = new Date();
    setActivityTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setIsActivityDialogOpen(true);
  };

  const openEditActivity = (entry: DiaryEntry) => {
    setEditingActivityId(entry.id ?? null);
    setActivityDesc(entry.description ?? '');
    setActivityDuration(entry.durationMinutes ? String(entry.durationMinutes) : '');
    setActivityDate(entry.date);
    setActivityTime(entry.time ?? '');
    setIsActivityDialogOpen(true);
  };

  const handleSaveActivity = async () => {
    if (!activityDesc.trim()) return;
    const data = {
      type: 'activity' as const,
      date: activityDate,
      time: activityTime || undefined,
      description: activityDesc.trim(),
      durationMinutes: activityDuration ? Number(activityDuration) : undefined,
    };
    if (editingActivityId) {
      await updateDiaryEntry(editingActivityId, data);
    } else {
      await addDiaryEntry(data as Omit<DiaryEntry, 'id' | 'createdAt'>);
    }
    setIsActivityDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Today summary */}
      <Card className="border-emerald-200 dark:border-emerald-900">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Сегодня</h3>
            <span className="text-xs text-muted-foreground">{todayEntries.length} тренировок{todayActivityEntries.length > 0 ? `, ${todayActivityEntries.length} активностей` : ''}</span>
          </div>
          {todayEntries.length > 0 || todayActivityEntries.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-lg font-bold text-emerald-600">{totalDuration}</div><div className="text-[10px] text-muted-foreground">мин</div></div>
              <div><div className="text-lg font-bold text-orange-500">{totalCaloriesBurned}</div><div className="text-[10px] text-muted-foreground">ккал</div></div>
              <div><div className="text-lg font-bold text-blue-600">{totalActivityMin || '—'}</div><div className="text-[10px] text-muted-foreground">мин акт.</div></div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Добавьте тренировку или активность</p>
          )}
        </CardContent>
      </Card>

      {/* Exercise Library (expandable) */}
      <Card>
        <CardContent className="p-3">
          <button
            className="flex w-full items-center justify-between"
            onClick={() => setLibraryOpen(!libraryOpen)}
          >
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold">Библиотека упражнений</span>
              <Badge variant="secondary" className="text-[10px]">{exercises.length}</Badge>
            </div>
            {libraryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {libraryOpen && (
            <div className="mt-3 space-y-3">
              {CATEGORIES.map((cat) => {
                const catExercises = exercisesByCategory.get(cat) ?? [];
                if (catExercises.length === 0) return null;
                return (
                  <div key={cat}>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">
                      {EXERCISE_CATEGORY_LABELS[cat]}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {catExercises.map((ex) => (
                        <div
                          key={ex.id}
                          className="group flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs"
                        >
                          <span>{ex.name}</span>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="rounded-full p-0.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить упражнение?</AlertDialogTitle>
                                <AlertDialogDescription>«{ex.name}» будет удалено из библиотеки.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteExercise(ex.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={() => setAddExerciseOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить упражнение
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workout Log */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Dumbbell className="h-4 w-4 text-emerald-600" />
          Тренировки
        </h3>

        {todayEntries.map((entry) => {
          const isExpanded = expandedIds.has(entry.id!);
          return (
            <Card key={entry.id} className="overflow-hidden">
              <CardContent className="p-3">
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => toggleExpanded(entry.id!)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Dumbbell className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {entry.name || 'Тренировка'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {entry.sets.slice(0, isExpanded ? undefined : 2).map((set, i) => {
                        let line = set.exerciseName;
                        if (set.weight) line += `: ${set.weight}кг`;
                        if (set.reps) line += ` × ${set.reps} повт.`;
                        if (set.sets) line += ` × ${set.sets} подх.`;
                        if (set.duration) line += ` ${set.duration}мин`;
                        if (set.distance) line += ` ${set.distance}км`;
                        return <p key={i}>• {line}</p>;
                      })}
                      {!isExpanded && entry.sets.length > 2 && (
                        <p className="text-muted-foreground/60">...и ещё {entry.sets.length - 2}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {entry.estimatedDuration && (
                        <Badge variant="outline" className="text-[10px] gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> {entry.estimatedDuration} мин
                        </Badge>
                      )}
                      {entry.estimatedCaloriesBurned && (
                        <Badge variant="outline" className="text-[10px] gap-0.5">
                          <Flame className="h-2.5 w-2.5" /> {entry.estimatedCaloriesBurned} ккал
                        </Badge>
                      )}
                      {entry.aiAnalysis && (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <Sparkles className="h-2.5 w-2.5 mr-0.5" /> ИИ
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <button
                      className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); openEditWorkout(entry); }}
                      title="Редактировать"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); handleWorkoutTemplate(entry); }}
                      title="Создать из шаблона"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id!); }}
                      title={isExpanded ? 'Свернуть' : 'Подробнее'}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="rounded-md p-1 hover:bg-destructive/10 text-destructive"
                          onClick={(e) => e.stopPropagation()}
                          title="Удалить"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Удалить тренировку?</AlertDialogTitle>
                          <AlertDialogDescription>Тренировка «{entry.name || 'Без названия'}» будет удалена.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Отмена</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteWorkoutEntry(entry.id!)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Удалить
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Expanded: AI analysis */}
                {isExpanded && entry.aiAnalysis && (
                  <div className="mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 border border-emerald-200 dark:border-emerald-800/40">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">ИИ-анализ</span>
                    </div>
                    <MarkdownRenderer content={entry.aiAnalysis} className="text-xs" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Today activity entries */}
        {todayActivityEntries.map((entry) => (
          <Card key={entry.id} className="overflow-hidden border-blue-200 dark:border-blue-900/50">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Activity className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span className="text-sm font-medium">Активность</span>
                    {entry.time && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-1">
                        <Clock className="h-2.5 w-2.5" />{entry.time}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                  {entry.durationMinutes && (
                    <Badge variant="outline" className="text-[10px] gap-0.5 mt-1.5">
                      <Clock className="h-2.5 w-2.5" /> {entry.durationMinutes} мин
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <button className="rounded-md p-1 hover:bg-muted text-muted-foreground" onClick={() => openEditActivity(entry)} title="Редактировать">
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
                        <AlertDialogTitle>Удалить активность?</AlertDialogTitle>
                        <AlertDialogDescription>«{entry.description}» будет удалено.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteDiaryEntry(entry.id!)} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {paginatedGroups.map((group) => (
          <React.Fragment key={group.date}>
            <div className="flex items-center gap-2 pt-3 pb-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateLabel(group.date)}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {group.entries.map((entry) => {
              const isExpanded = expandedIds.has(entry.id!);
              return (
                <Card key={entry.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer"
                      onClick={() => toggleExpanded(entry.id!)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Dumbbell className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-sm font-medium truncate">
                            {entry.name || 'Тренировка'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {entry.sets.slice(0, isExpanded ? undefined : 2).map((set, i) => {
                            let line = set.exerciseName;
                            if (set.weight) line += `: ${set.weight}кг`;
                            if (set.reps) line += ` × ${set.reps} повт.`;
                            if (set.sets) line += ` × ${set.sets} подх.`;
                            if (set.duration) line += ` ${set.duration}мин`;
                            if (set.distance) line += ` ${set.distance}км`;
                            return <p key={i}>• {line}</p>;
                          })}
                          {!isExpanded && entry.sets.length > 2 && (
                            <p className="text-muted-foreground/60">...и ещё {entry.sets.length - 2}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {entry.estimatedDuration && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <Clock className="h-2.5 w-2.5" /> {entry.estimatedDuration} мин
                            </Badge>
                          )}
                          {entry.estimatedCaloriesBurned && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <Flame className="h-2.5 w-2.5" /> {entry.estimatedCaloriesBurned} ккал
                            </Badge>
                          )}
                          {entry.aiAnalysis && (
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> ИИ
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <button
                          className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); openEditWorkout(entry); }}
                          title="Редактировать"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); handleWorkoutTemplate(entry); }}
                          title="Создать из шаблона"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id!); }}
                          title={isExpanded ? 'Свернуть' : 'Подробнее'}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className="rounded-md p-1 hover:bg-destructive/10 text-destructive"
                              onClick={(e) => e.stopPropagation()}
                              title="Удалить"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить тренировку?</AlertDialogTitle>
                              <AlertDialogDescription>Тренировка «{entry.name || 'Без названия'}» будет удалена.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteWorkoutEntry(entry.id!)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Удалить
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Expanded: AI analysis */}
                    {isExpanded && entry.aiAnalysis && (
                      <div className="mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 border border-emerald-200 dark:border-emerald-800/40">
                        <div className="flex items-center gap-1 mb-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">ИИ-анализ</span>
                        </div>
                        <MarkdownRenderer content={entry.aiAnalysis} className="text-xs" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </React.Fragment>
        ))}

        {/* Older activity entries by date */}
        {olderActivityEntries.map((group) => (
          <React.Fragment key={`act-${group.date}`}>
            <div className="flex items-center gap-2 pt-3 pb-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateLabel(group.date)}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {group.entries.map((entry) => (
              <Card key={entry.id} className="overflow-hidden border-blue-200 dark:border-blue-900/50">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Activity className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="text-sm font-medium">Активность</span>
                        {entry.time && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-1">
                            <Clock className="h-2.5 w-2.5" />{entry.time}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                      {entry.durationMinutes && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 mt-1.5">
                          <Clock className="h-2.5 w-2.5" /> {entry.durationMinutes} мин
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <button className="rounded-md p-1 hover:bg-muted text-muted-foreground" onClick={() => openEditActivity(entry)} title="Редактировать">
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
                            <AlertDialogTitle>Удалить активность?</AlertDialogTitle>
                            <AlertDialogDescription>«{entry.description}» будет удалено.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteDiaryEntry(entry.id!)} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </React.Fragment>
        ))}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}

        {workoutEntries.length === 0 && activityEntries.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <Dumbbell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Нет тренировок или активностей</p>
              <p className="text-xs text-muted-foreground mt-1">Нажмите + чтобы добавить</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* FAB - Add workout or activity */}
      <div className="fixed bottom-20 right-4 z-30 flex items-end gap-2">
        <button
          onClick={openNewActivity}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
          title="Добавить активность"
        >
          <Activity className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={openNewWorkout}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors"
          title="Добавить тренировку"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Add Exercise Dialog */}
      <Dialog open={addExerciseOpen} onOpenChange={setAddExerciseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Новое упражнение</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Название</Label>
              <Input
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                placeholder="Например: Жим лёжа"
                className="mt-1"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddExercise(); }}
              />
            </div>
            <div>
              <Label className="text-xs">Категория</Label>
              <Select value={newExCategory} onValueChange={(v) => setNewExCategory(v as ExerciseCategory)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {EXERCISE_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button onClick={handleAddExercise} disabled={!newExName.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Workout Dialog */}
      <Dialog open={isWorkoutDialogOpen} onOpenChange={setIsWorkoutDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWorkout ? 'Редактировать тренировку' : 'Новая тренировка'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Workout name */}
            <div>
              <Label className="text-xs">Название тренировки (необязательно)</Label>
              <Input
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                placeholder="Например: Утренняя тренировка"
                className="mt-1"
              />
            </div>

            {/* Date */}
            <div>
              <Label className="text-xs">Дата</Label>
              <Input
                type="date"
                value={workoutDate}
                onChange={(e) => setWorkoutDate(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Sets list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Упражнения</Label>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={addSet}>
                  <Plus className="h-3 w-3" /> Добавить
                </Button>
              </div>

              {workoutSets.map((set, index) => {
                const exercise = exercises.find((e) => e.id === set.exerciseId);
                const isCardio = exercise?.category === 'cardio';
                // Timer state for this exercise
                const isTimerRunning = !!(set.startTime && !set.endTime);
                const isTimerDone = !!(set.startTime && set.endTime);
                const elapsedMs = isTimerRunning
                  ? Date.now() - set.startTime!
                  : isTimerDone
                    ? set.endTime! - set.startTime!
                    : 0;
                const elapsedSec = Math.floor(elapsedMs / 1000);
                const elapsedMin = Math.floor(elapsedSec / 60);
                const elapsedDisplay = elapsedMin > 0
                  ? `${elapsedMin}:${String(elapsedSec % 60).padStart(2, '0')}`
                  : `${elapsedSec}с`;
                return (
                  <div key={index} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground">Упражнение {index + 1}</span>
                      <div className="flex items-center gap-1">
                        {/* Timer button */}
                        <button
                          className={`rounded p-1 ${isTimerRunning ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : isTimerDone ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'hover:bg-muted text-muted-foreground'}`}
                          onClick={() => toggleTimer(index)}
                          title={isTimerRunning ? 'Остановить' : isTimerDone ? 'Сбросить таймер' : 'Начать таймер'}
                        >
                          {isTimerRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </button>
                        {/* Copy button */}
                        <button
                          className="rounded p-1 hover:bg-muted text-muted-foreground"
                          onClick={() => duplicateSet(index)}
                          title="Создать копию"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        {/* Delete button */}
                        {workoutSets.length > 1 && (
                          <button
                            className="rounded p-1 hover:bg-destructive/10 text-destructive"
                            onClick={() => removeSet(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Timer display */}
                    {(isTimerRunning || isTimerDone) && (
                      <div className={`flex items-center gap-1 text-[10px] font-medium ${isTimerRunning ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        <Timer className="h-3 w-3" />
                        <span>{isTimerRunning ? `${elapsedDisplay} (идёт)` : `${elapsedDisplay}`}</span>
                      </div>
                    )}

                    {/* Exercise selector */}
                    <Select
                      value={set.exerciseId}
                      onValueChange={(v) => selectExerciseForSet(index, v)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Выберите упражнение" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => {
                          const catExercises = exercisesByCategory.get(cat) ?? [];
                          if (catExercises.length === 0) return null;
                          return (
                            <React.Fragment key={cat}>
                              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">
                                {EXERCISE_CATEGORY_LABELS[cat]}
                              </div>
                              {catExercises.map((ex) => (
                                <SelectItem key={ex.id} value={ex.id} className="text-xs">
                                  {ex.name}
                                </SelectItem>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    {/* Inputs grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {!isCardio && (
                        <>
                          <div>
                            <Label className="text-[10px]">Вес (кг)</Label>
                            <Input
                              type="number"
                              value={set.weight ?? ''}
                              onChange={(e) => updateSet(index, 'weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                              placeholder="0"
                              className="mt-0.5 h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">Повторения</Label>
                            <Input
                              type="number"
                              value={set.reps ?? ''}
                              onChange={(e) => updateSet(index, 'reps', e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="0"
                              className="mt-0.5 h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">Подходы</Label>
                            <Input
                              type="number"
                              value={set.sets ?? ''}
                              onChange={(e) => updateSet(index, 'sets', e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="0"
                              className="mt-0.5 h-8 text-xs"
                            />
                          </div>
                        </>
                      )}
                      {isCardio && (
                        <>
                          <div>
                            <Label className="text-[10px]">Длительность (мин)</Label>
                            <Input
                              type="number"
                              value={set.duration ?? ''}
                              onChange={(e) => updateSet(index, 'duration', e.target.value ? parseFloat(e.target.value) : undefined)}
                              placeholder="0"
                              className="mt-0.5 h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">Дистанция (км)</Label>
                            <Input
                              type="number"
                              value={set.distance ?? ''}
                              onChange={(e) => updateSet(index, 'distance', e.target.value ? parseFloat(e.target.value) : undefined)}
                              placeholder="0"
                              className="mt-0.5 h-8 text-xs"
                            />
                          </div>
                        </>
                      )}
                      <div className={isCardio ? 'col-span-2' : ''}>
                        <Label className="text-[10px]">Заметки</Label>
                        <Input
                          value={set.notes ?? ''}
                          onChange={(e) => updateSet(index, 'notes', e.target.value || undefined)}
                          placeholder="..."
                          className="mt-0.5 h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Duration & Calories */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Длительность (мин)</Label>
                  <Input
                    type="number"
                    value={workoutDuration}
                    onChange={(e) => setWorkoutDuration(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Сожжено (ккал)</Label>
                  <Input
                    type="number"
                    value={workoutCalories}
                    onChange={(e) => setWorkoutCalories(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>
              {workoutSets.some((s) => s.startTime && s.endTime) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs w-full"
                  onClick={calcDurationFromTimers}
                >
                  <Timer className="h-3 w-3" /> Рассчитать длительность из таймеров
                </Button>
              )}
            </div>

            {/* AI Analysis */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-emerald-600" />
                  ИИ-анализ
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isSending || workoutSets.filter((s) => s.exerciseId).length === 0}
                >
                  {isAnalyzing || isSending ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Анализ...</>
                  ) : (
                    <><Sparkles className="h-3 w-3" /> Анализировать</>
                  )}
                </Button>
              </div>
              {(isAnalyzing || isSending) && streamingAnalysis && (
                <div className="rounded-lg bg-muted p-2 text-xs">
                  <MarkdownRenderer content={streamingAnalysis} />
                </div>
              )}
              {aiAnalysis && !isAnalyzing && !isSending && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2 border border-emerald-200 dark:border-emerald-800/40 text-xs">
                  <MarkdownRenderer content={aiAnalysis} />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button
              onClick={handleSaveWorkout}
              disabled={workoutSets.filter((s) => s.exerciseId && s.exerciseName).length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {editingWorkout ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Activity Dialog */}
      <Dialog open={isActivityDialogOpen} onOpenChange={setIsActivityDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingActivityId ? 'Редактировать активность' : 'Новая активность'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Описание активности</Label>
              <Textarea
                value={activityDesc}
                onChange={(e) => setActivityDesc(e.target.value)}
                placeholder="Прогулка 10км пешком, занятия на тренажерах..."
                rows={2}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Дата</Label>
                <Input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Время</Label>
                <Input type="time" value={activityTime} onChange={(e) => setActivityTime(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Минут</Label>
                <Input type="number" value={activityDuration} onChange={(e) => setActivityDuration(e.target.value)} placeholder="60" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button onClick={handleSaveActivity} disabled={!activityDesc.trim()} className="bg-blue-600 hover:bg-blue-700">
              <Check className="mr-1.5 h-4 w-4" /> {editingActivityId ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
