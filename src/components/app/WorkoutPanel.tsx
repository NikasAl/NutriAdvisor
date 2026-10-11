'use client';

import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import type { ExerciseCategory, WorkoutEntry, WorkoutSet } from '@/lib/types';
import { EXERCISE_CATEGORY_LABELS } from '@/lib/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yd = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yd) return 'Вчера';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

const CATEGORIES: ExerciseCategory[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio', 'other'];

export default function WorkoutPanel() {
  const exercises = useAppStore((s) => s.exercises);
  const workoutEntries = useAppStore((s) => s.workoutEntries);
  const loadWorkoutEntries = useAppStore((s) => s.loadWorkoutEntries);
  const addWorkoutEntry = useAppStore((s) => s.addWorkoutEntry);
  const updateWorkoutEntry = useAppStore((s) => s.updateWorkoutEntry);
  const deleteWorkoutEntry = useAppStore((s) => s.deleteWorkoutEntry);
  const addExercise = useAppStore((s) => s.addExercise);
  const deleteExercise = useAppStore((s) => s.deleteExercise);
  const analyzeFoodTextStream = useAppStore((s) => s.analyzeFoodTextStream);
  const isSending = useAppStore((s) => s.isSending);
  const streamingAnalysis = useAppStore((s) => s.streamingAnalysis);
  const profile = useAppStore((s) => s.profile);

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

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

  // Expanded entry cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  React.useEffect(() => { loadWorkoutEntries(); }, [loadWorkoutEntries]);

  // Date nav
  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Entries for selected date
  const dateEntries = useMemo(
    () => workoutEntries.filter((e) => e.date === selectedDate),
    [workoutEntries, selectedDate]
  );

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
    setWorkoutDate(selectedDate);
    setWorkoutSets([{ exerciseId: '', exerciseName: '', weight: undefined, reps: undefined, sets: undefined, duration: undefined, distance: undefined, notes: '' }]);
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
    setWorkoutSets(entry.sets.length > 0 ? entry.sets : [{ exerciseId: '', exerciseName: '', weight: undefined, reps: undefined, sets: undefined, duration: undefined, distance: undefined, notes: '' }]);
    setWorkoutDuration(entry.estimatedDuration?.toString() || '');
    setWorkoutCalories(entry.estimatedCaloriesBurned?.toString() || '');
    setAiAnalysis(entry.aiAnalysis || '');
    setIsWorkoutDialogOpen(true);
  };

  // Save workout
  const handleSaveWorkout = async () => {
    const validSets = workoutSets.filter((s) => s.exerciseId && s.exerciseName);
    if (validSets.length === 0) return;

    const entryData = {
      date: workoutDate || selectedDate,
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

      const prompt = `Проанализируй следующую тренировку и оцени нагрузку, интенсивность и рекомендуемое время восстановления. Дай рекомендации по улучшению. Укажи примерное количество сожжённых калорий.\n\n${profileInfo.length > 0 ? 'Данные пользователя: ' + profileInfo.join(', ') + '\n\n' : ''}Тренировка: ${workoutName || 'Без названия'}\n${lines.join('\n')}${workoutDuration ? `\nДлительность: ${workoutDuration} мин` : ''}`;

      const result = await analyzeFoodTextStream(prompt);
      setAiAnalysis(result);
    } catch {
      // ignore
    } finally {
      setIsAnalyzing(false);
    }
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
    setWorkoutSets((prev) => [...prev, { exerciseId: '', exerciseName: '', weight: undefined, reps: undefined, sets: undefined, duration: undefined, distance: undefined, notes: '' }]);
  };

  // Remove set
  const removeSet = (index: number) => {
    setWorkoutSets((prev) => prev.filter((_, i) => i !== index));
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

  return (
    <div className="space-y-4">
      {/* Date selector */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{formatDateLabel(selectedDate)}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

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

        {dateEntries.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Dumbbell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Нет тренировок за этот день</p>
            </CardContent>
          </Card>
        ) : (
          dateEntries.map((entry) => {
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
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="rounded p-1 hover:bg-muted text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); openEditWorkout(entry); }}
                        title="Редактировать"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="rounded p-1 hover:bg-destructive/10 text-destructive"
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
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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
          })
        )}
      </div>

      {/* FAB - Add workout */}
      <button
        onClick={openNewWorkout}
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors"
        title="Добавить тренировку"
      >
        <Plus className="h-5 w-5" />
      </button>

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
                return (
                  <div key={index} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground">Упражнение {index + 1}</span>
                      {workoutSets.length > 1 && (
                        <button
                          className="rounded p-1 hover:bg-destructive/10 text-destructive"
                          onClick={() => removeSet(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>

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
    </div>
  );
}
