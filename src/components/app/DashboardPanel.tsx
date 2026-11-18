'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  UtensilsCrossed, MessageSquare, Target, TrendingUp, Zap, Moon, Brain, Heart, Flame, Plus, Minus, Droplets, Settings2, BedDouble, Trash2, CircleHelp, Dumbbell, BarChart, Footprints, HeartPulse, Puzzle, Sparkles, RefreshCw, Loader2, Check, X,
} from 'lucide-react';
import { GOAL_LABELS } from '@/lib/types';
import { todayKey } from '@/lib/dates';
import type { GoalType, SleepPeriod, SuggestionItem, RejectReason } from '@/lib/types';
import type { HelpSection } from './HelpPanel';

/** Calculate sleep duration in minutes, handling overnight */
function calcDuration(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh * 60 + sm, e = eh * 60 + em;
  if (e <= s) e += 24 * 60;
  return e - s;
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}ч ${m > 0 ? m + 'мин' : ''}`.trim() : `${m}мин`;
}

const GOAL_ICONS: Record<GoalType, React.ElementType> = {
  health: Heart, weight_loss: TrendingUp, weight_gain: TrendingUp,
  muscle_gain: Flame, cutting: Flame, better_sleep: Moon,
  wellbeing: Zap, mental_clarity: Brain, energy: Zap, maintenance: Target,
  more_walking: Footprints, reduce_ldl: HeartPulse, logic_tasks: Puzzle,
};

const SUG_ICONS: Record<SuggestionItem['type'], React.ElementType> = {
  meal: UtensilsCrossed, water: Droplets, sleep: BedDouble,
  workout: Dumbbell, bp: HeartPulse, mood: Heart, activity: Footprints,
};

export default function DashboardPanel({ onOpenHelp, onOpenWidgetHelp }: { onOpenHelp?: () => void; onOpenWidgetHelp?: (section: HelpSection) => void }) {
  const profile = useAppStore((s) => s.profile);
  const foodEntries = useAppStore((s) => s.foodEntries);
  const chatSessions = useAppStore((s) => s.chatSessions);
  const getActiveProvider = useAppStore((s) => s.getActiveProvider);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const workoutEntries = useAppStore((s) => s.workoutEntries);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const loadChatSessions = useAppStore((s) => s.loadChatSessions);
  const loadWorkoutEntries = useAppStore((s) => s.loadWorkoutEntries);
  const waterLog = useAppStore((s) => s.waterLog);
  const waterGlassMl = useAppStore((s) => s.waterGlassMl);
  const addWaterGlass = useAppStore((s) => s.addWaterGlass);
  const removeWaterGlass = useAppStore((s) => s.removeWaterGlass);
  const setWaterGlassMl = useAppStore((s) => s.setWaterGlassMl);
  const sleepLog = useAppStore((s) => s.sleepLog);
  const addSleepPeriod = useAppStore((s) => s.addSleepPeriod);
  const removeSleepPeriod = useAppStore((s) => s.removeSleepPeriod);
  const autoSuggestion = useAppStore((s) => s.autoSuggestion);
  const getDailySuggestion = useAppStore((s) => s.getDailySuggestion);
  const peekDaySuggestion = useAppStore((s) => s.peekDaySuggestion);
  const rejectSuggestion = useAppStore((s) => s.rejectSuggestion);
  const [showGlassSettings, setShowGlassSettings] = useState(false);
  const [newSleepStart, setNewSleepStart] = useState('22:00');
  const [newSleepEnd, setNewSleepEnd] = useState('06:00');
  const [showAddSleep, setShowAddSleep] = useState(false);
  // Day suggestion widget («Что дальше?»)
  const [sugOpen, setSugOpen] = useState(false);
  const [sugItems, setSugItems] = useState<SuggestionItem[] | null>(null);
  const [sugLoading, setSugLoading] = useState(false);
  // "Я записал" marks — in-memory only, reset when the date changes
  const [sugChecked, setSugChecked] = useState<Set<string>>(new Set());
  // Rejection dialog state: which item is being dismissed, chosen reason, free-text note
  const [rejectTarget, setRejectTarget] = useState<{ type: SuggestionItem['type']; key: string } | null>(null);
  const [rejectReason, setRejectReason] = useState<RejectReason>('not_want');
  const [rejectNote, setRejectNote] = useState('');

  const REJECT_LABELS: { value: RejectReason; label: string }[] = [
    { value: 'not_want', label: 'Не хочу' },
    { value: 'no_device', label: 'Нет прибора (например, тонометра)' },
    { value: 'no_time', label: 'Нет возможности сейчас' },
    { value: 'other', label: 'Другая причина' },
  ];

  // Open + load: first try the cache (instant, no spinner), then fall back to a network fetch.
  // `force` (the refresh button) bypasses the cache and shows the spinner.
  const loadSuggestion = useCallback(async (force: boolean) => {
    if (!force) {
      const cached = await peekDaySuggestion();
      if (cached) {
        setSugItems(cached);
        setSugChecked(new Set());
        setSugLoading(false);
        return;
      }
    }
    setSugLoading(true);
    try {
      const items = await getDailySuggestion(force);
      setSugItems(items);
      setSugChecked(new Set());
    } finally {
      setSugLoading(false);
    }
  }, [getDailySuggestion, peekDaySuggestion]);

  useEffect(() => {
    loadProfile();
    loadFoodEntries();
    loadChatSessions();
    loadWorkoutEntries();
  }, [loadProfile, loadFoodEntries, loadChatSessions, loadWorkoutEntries]);

  // Auto mode: open the widget and fetch a suggestion on mount.
  // The small delay lets the initial DB loads above finish so day gaps are accurate.
  useEffect(() => {
    if (!autoSuggestion) return;
    const t = setTimeout(() => {
      setSugOpen(true);
      loadSuggestion(false);
    }, 800);
    return () => clearTimeout(t);
  }, [autoSuggestion, loadSuggestion]);

  const provider = getActiveProvider();
  const today = todayKey();

  // Reset "записал" marks when the calendar day changes (setState-in-render pattern,
  // per react.dev/learn/you-might-not-need-an-effect)
  const [sugCheckedDate, setSugCheckedDate] = useState(today);
  if (sugCheckedDate !== today) {
    setSugCheckedDate(today);
    setSugChecked(new Set());
  }
  const todayEntries = foodEntries.filter((e) => e.date === today);

  const totalCalories = todayEntries.reduce((sum, e) => sum + (e.estimatedCalories ?? 0), 0);
  const totalProtein = todayEntries.reduce((sum, e) => sum + (e.estimatedProtein ?? 0), 0);
  const totalFat = todayEntries.reduce((sum, e) => sum + (e.estimatedFat ?? 0), 0);
  const totalCarbs = todayEntries.reduce((sum, e) => sum + (e.estimatedCarbs ?? 0), 0);

  // Calories burned in today's workouts
  const todayWorkouts = workoutEntries.filter((e) => e.date === today);
  const exerciseCalories = todayWorkouts.reduce((sum, e) => sum + (e.estimatedCaloriesBurned ?? 0), 0);
  const netCalories = Math.max(0, totalCalories - exerciseCalories);

  // Rough calorie goal estimation
  const bmr = profile.weight && profile.height && profile.age
    ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.gender === 'male' ? 5 : -161)
    : 2000;
  const activityMultipliers: Record<string, number> = {
    low: 1.2, moderate: 1.55, high: 1.725, very_high: 1.9,
  };
  const tdee = bmr * (activityMultipliers[profile.activityLevel] ?? 1.55);
  const calorieGoal = profile.goals.includes('weight_loss')
    ? tdee - 500
    : profile.goals.includes('weight_gain') || profile.goals.includes('muscle_gain')
      ? tdee + 300
      : tdee;
  const calorieProgress = Math.min(100, Math.round((netCalories / calorieGoal) * 100));

  return (
    <div className="space-y-4 pb-4">
      {/* Greeting */}
      <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">
                {profile.name ? `Привет, ${profile.name}!` : 'Добро пожаловать!'}
              </h1>
              <p className="text-sm text-emerald-100">
                {new Date().toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const next = !sugOpen;
                  setSugOpen(next);
                  if (next && !sugItems && !sugLoading) loadSuggestion(false);
                }}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="Что записать сегодня?"
              >
                <Sparkles className="h-5 w-5" />
              </button>
              {onOpenHelp && (
                <button
                  onClick={onOpenHelp}
                  className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title="О приложении"
                >
                  <CircleHelp className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
        <CardContent className="p-4 space-y-3">
          {/* Provider status */}
          {!provider ? (
            <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Настройте API провайдер для работы AI
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-amber-600"
                onClick={() => setActiveTab('settings')}
              >
                Перейти в настройки →
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className={`h-3.5 w-3.5 ${!provider.apiKey ? 'text-amber-500' : 'text-emerald-500'}`} />
              <span>Провайдер: {provider.name} ({provider.model}){!provider.apiKey ? ' (без ключа)' : ''}</span>
            </div>
          )}

          {/* Goals */}
          {profile.goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.goals.map((goal) => {
                const Icon = GOAL_ICONS[goal] ?? Target;
                return (
                  <Badge key={goal} variant="secondary" className="gap-1 text-xs">
                    <Icon className="h-3 w-3" />
                    {GOAL_LABELS[goal]}
                  </Badge>
                );
              })}
            </div>
          )}

          {profile.goals.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setActiveTab('profile')}
            >
              <Target className="h-4 w-4" />
              Укажите свои цели для персонализации
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Day suggestion widget («Что дальше?») */}
      {sugOpen && (
        <Card className="border-violet-200 dark:border-violet-900">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-violet-500" />
                Что записать сегодня?
              </CardTitle>
              <div className="flex items-center gap-1">
                {onOpenWidgetHelp && (
                  <button
                    onClick={() => onOpenWidgetHelp('suggestion')}
                    className="text-muted-foreground/50 hover:text-muted-foreground p-1 rounded-md hover:bg-muted/30 transition-colors"
                    title="Помощь"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => loadSuggestion(true)}
                  disabled={sugLoading}
                  title="Обновить подсказку"
                >
                  {sugLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {sugLoading && !sugItems && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Готовлю подсказку…
              </div>
            )}
            {sugItems && sugItems.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Все ключевые данные за сегодня уже записаны. Отличный день!
              </p>
            )}
            {sugItems?.map((item, idx) => {
              const Icon = SUG_ICONS[item.type] ?? Sparkles;
              const key = `${item.type}-${idx}`;
              const checked = sugChecked.has(key);
              return (
                <div key={key} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${checked ? 'bg-muted/40 opacity-70' : 'bg-violet-50 dark:bg-violet-950/20'}`}>
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${checked ? 'text-muted-foreground' : 'text-violet-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${checked ? 'line-through text-muted-foreground' : ''}`}>{item.title}</p>
                    {item.rationale && <p className="text-xs text-muted-foreground mt-0.5">{item.rationale}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setSugChecked((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key); else next.add(key);
                          return next;
                        });
                      }}
                      className={`p-1.5 rounded-md transition-colors ${checked ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' : 'text-muted-foreground hover:text-emerald-600 hover:bg-muted'}`}
                      title={checked ? 'Отменить отметку' : 'Я записал'}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setRejectTarget({ type: item.type, key });
                        setRejectReason('not_want');
                        setRejectNote('');
                      }}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="Не актуально"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setActiveTab(item.ctaTab)}
                    >
                      Записать
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Rejection dialog: pick a reason, optionally add a note for "other" */}
            {rejectTarget && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-3 space-y-2">
                <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                  Почему этот совет не актуален?
                </p>
                <div className="grid grid-cols-1 gap-1">
                  {REJECT_LABELS.map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer ${rejectReason === opt.value ? 'bg-rose-100 dark:bg-rose-950/40' : 'hover:bg-muted/50'}`}>
                      <input
                        type="radio"
                        name="reject-reason"
                        value={opt.value}
                        checked={rejectReason === opt.value}
                        onChange={() => setRejectReason(opt.value)}
                        className="accent-rose-600"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {rejectReason === 'other' && (
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Уточните причину (необязательно)"
                    maxLength={200}
                    className="w-full rounded-md border px-2 py-1.5 text-xs bg-background"
                    autoFocus
                  />
                )}
                <p className="text-[10px] text-muted-foreground">
                  Совет скроется и не предложится снова до завтра.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setRejectTarget(null)}
                  >
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs bg-rose-600 hover:bg-rose-700"
                    onClick={async () => {
                      if (!rejectTarget) return;
                      const targetType = rejectTarget.type;
                      await rejectSuggestion(targetType, rejectReason, rejectReason === 'other' ? rejectNote : undefined);
                      setRejectTarget(null);
                      setRejectNote('');
                      // Hide the rejected item from the current list immediately (no spinner)
                      setSugItems((prev) => (prev ?? []).filter((it) => it.type !== targetType));
                    }}
                  >
                    Скрыть совет
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calorie tracker */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UtensilsCrossed className="h-4 w-4 text-emerald-600" />
              Калории за сегодня
            </CardTitle>
            {onOpenWidgetHelp && (
              <button
                onClick={() => onOpenWidgetHelp('calories')}
                className="text-muted-foreground/50 hover:text-muted-foreground p-1 rounded-md hover:bg-muted/30 transition-colors"
                title="Помощь"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-2xl font-bold">{netCalories}</span>
              <span className="ml-1 text-sm text-muted-foreground">/ {Math.round(calorieGoal)} ккал</span>
            </div>
            <span className="text-sm text-muted-foreground">{calorieProgress}%</span>
          </div>
          {exerciseCalories > 0 && (
            <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
              <Dumbbell className="h-3 w-3" />
              <span>Съедено {totalCalories} ккал − сожжено {exerciseCalories} ккал = нетто {netCalories} ккал</span>
            </div>
          )}
          <Progress value={calorieProgress} className="h-2" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950/20">
              <div className="text-sm font-bold text-blue-600">{totalProtein.toFixed(0)}г</div>
              <div className="text-[10px] text-muted-foreground">Белки</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/20">
              <div className="text-sm font-bold text-amber-600">{totalFat.toFixed(0)}г</div>
              <div className="text-[10px] text-muted-foreground">Жиры</div>
            </div>
            <div className="rounded-lg bg-orange-50 p-2 dark:bg-orange-950/20">
              <div className="text-sm font-bold text-orange-600">{totalCarbs.toFixed(0)}г</div>
              <div className="text-[10px] text-muted-foreground">Углеводы</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Water tracker */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Droplets className="h-4 w-4 text-blue-500" />
              Вода
            </CardTitle>
            <div className="flex items-center gap-1">
              {onOpenWidgetHelp && (
                <button
                  onClick={() => onOpenWidgetHelp('water')}
                  className="text-muted-foreground/50 hover:text-muted-foreground p-1 rounded-md hover:bg-muted/30 transition-colors"
                  title="Помощь"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              )}
              {showGlassSettings ? (
                <div className="flex items-center gap-1">
                  <select
                    value={waterGlassMl}
                    onChange={(e) => { setWaterGlassMl(Number(e.target.value)); setShowGlassSettings(false); }}
                    className="text-xs border rounded px-1.5 py-0.5 bg-background"
                    onBlur={() => setShowGlassSettings(false)}
                    autoFocus
                  >
                    {[100, 150, 200, 250, 300, 350, 500].map((ml) => (
                      <option key={ml} value={ml}>{ml} мл</option>
                    ))}
                  </select>
                </div>
              ) : (
                <button
                  onClick={() => setShowGlassSettings(true)}
                  className="text-xs text-muted-foreground hover:text-foreground p-1"
                  title="Настроить объём стакана"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-blue-600">{waterLog?.glasses ?? 0}</span>
              <span className="ml-1 text-sm text-muted-foreground">
                / {Math.ceil((profile.waterTargetMl || 2000) / waterGlassMl)} стаканов
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {((waterLog?.glasses ?? 0) * waterGlassMl)} / {profile.waterTargetMl || 2000} мл
            </span>
          </div>
          <Progress value={Math.min(100, ((waterLog?.glasses ?? 0) * waterGlassMl / (profile.waterTargetMl || 2000)) * 100)} className="h-2" />
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => removeWaterGlass()}
              disabled={!waterLog || waterLog.glasses <= 0}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <div className="text-3xl leading-none">{'💧'}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{waterGlassMl} мл</div>
            </div>
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full bg-blue-500 hover:bg-blue-600"
              onClick={() => addWaterGlass()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sleep tracker */}
      <Card className="border-indigo-200 dark:border-indigo-900">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BedDouble className="h-4 w-4 text-indigo-500" />
              Сон
            </CardTitle>
          <div className="flex items-center gap-1">
            {onOpenWidgetHelp && (
              <button
                onClick={() => onOpenWidgetHelp('sleep')}
                className="text-muted-foreground/50 hover:text-muted-foreground p-1 rounded-md hover:bg-muted/30 transition-colors"
                title="Помощь"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-indigo-600"
              onClick={() => setShowAddSleep(!showAddSleep)}
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </Button>
          </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Existing sleep periods */}
          {sleepLog && sleepLog.periods.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-indigo-600">
                  {fmtDuration(sleepLog.periods.reduce((s, p) => s + calcDuration(p.start, p.end), 0))}
                </span>
                <span className="text-sm text-muted-foreground">
                  {sleepLog.periods.length} {sleepLog.periods.length === 1 ? 'период' : sleepLog.periods.length < 5 ? 'периода' : 'периодов'}
                </span>
              </div>
              <div className="space-y-1.5">
                {sleepLog.periods.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium">{p.start}</span>
                      <span className="text-muted-foreground mx-1.5">—</span>
                      <span className="font-medium">{p.end}</span>
                      <span className="ml-2 text-xs text-muted-foreground">({fmtDuration(calcDuration(p.start, p.end))})</span>
                    </div>
                    <button
                      onClick={() => removeSleepPeriod(today, idx)}
                      className="text-muted-foreground hover:text-red-500 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {/* Target progress bar */}
              <Progress
                value={Math.min(100, (sleepLog.periods.reduce((s, p) => s + calcDuration(p.start, p.end), 0) / ((profile.sleepTargetHours || 8) * 60)) * 100)}
                className="h-2"
              />
              <div className="text-[10px] text-muted-foreground text-right">
                Цель: {profile.sleepTargetHours || 8} часов
              </div>
            </>
          )}

          {!sleepLog && (
            <div className="text-center py-3">
              <div className="text-3xl leading-none">{'😴'}</div>
              <div className="text-xs text-muted-foreground mt-2">Нет записей о сне</div>
            </div>
          )}

          {/* Add new sleep period form */}
          {showAddSleep && (
            <div className="border-t pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Начало</label>
                  <input
                    type="time"
                    value={newSleepStart}
                    onChange={(e) => setNewSleepStart(e.target.value)}
                    className="w-full mt-0.5 rounded-md border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Конец</label>
                  <input
                    type="time"
                    value={newSleepEnd}
                    onChange={(e) => setNewSleepEnd(e.target.value)}
                    className="w-full mt-0.5 rounded-md border px-2 py-1.5 text-sm bg-background"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setShowAddSleep(false)}
                >
                  Отмена
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs bg-indigo-500 hover:bg-indigo-600"
                  onClick={async () => {
                    if (newSleepStart && newSleepEnd) {
                      await addSleepPeriod(today, { start: newSleepStart, end: newSleepEnd });
                      setShowAddSleep(false);
                    }
                  }}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Быстрые действия</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-auto min-h-[67px] gap-2 py-2.5"
            onClick={() => setActiveTab('catalog')}
          >
            <UtensilsCrossed className="h-4 w-4 shrink-0" />
            <span className="flex flex-1 flex-col items-center justify-center break-words text-xs leading-tight whitespace-normal min-w-0 min-h-[45px]">Добавить продукты и блюда</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-[67px] gap-2 py-2.5"
            onClick={() => setActiveTab('diary')}
          >
            <Heart className="h-4 w-4 shrink-0" />
            <span className="flex flex-1 flex-col items-center justify-center break-words text-xs leading-tight whitespace-normal min-w-0 min-h-[45px]">Записать самочувствие/давление</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-[67px] gap-2 py-2.5"
            onClick={() => setActiveTab('workout')}
          >
            <Dumbbell className="h-4 w-4 shrink-0" />
            <span className="flex flex-1 flex-col items-center justify-center break-words text-xs leading-tight whitespace-normal min-w-0 min-h-[45px]">Записать тренировку</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-[67px] gap-2 py-2.5"
            onClick={() => setActiveTab('stats')}
          >
            <BarChart className="h-4 w-4 shrink-0" />
            <span className="flex flex-1 flex-col items-center justify-center break-words text-xs leading-tight whitespace-normal min-w-0 min-h-[45px]">Статистика по дням</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-[67px] gap-2 py-2.5"
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="flex flex-1 flex-col items-center justify-center break-words text-xs leading-tight whitespace-normal min-w-0 min-h-[45px]">Спросить ИИ</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-[67px] gap-2 py-2.5"
            onClick={() => setActiveTab('profile')}
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            <span className="flex flex-1 flex-col items-center justify-center break-words text-xs leading-tight whitespace-normal min-w-0 min-h-[45px]">Заполнить профиль и цели</span>
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Статистика</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold">{todayEntries.length}</div>
              <div className="text-[10px] text-muted-foreground">Записей сегодня</div>
            </div>
            <div>
              <div className="text-lg font-bold">{chatSessions.length}</div>
              <div className="text-[10px] text-muted-foreground">Разговоров</div>
            </div>
            <div>
              <div className="text-lg font-bold">{foodEntries.length}</div>
              <div className="text-[10px] text-muted-foreground">Всего записей</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
