'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ChevronLeft, ChevronRight, Loader2, Flame, Dumbbell, Droplets, BedDouble, Apple, TrendingUp, TrendingDown, Minus, Target, Calendar, Activity } from 'lucide-react';
import type { GoalType } from '@/lib/types';
import { db } from '@/lib/db';
import type { WaterLog, SleepLog } from '@/lib/types';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

// ─── Helpers ────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const today = getToday();
  const yd = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yd) return 'Вчера';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function dateRange(days: number): string[] {
  return Array.from({ length: days }, (_, i) => getDaysAgo(days - 1 - i));
}

// Calculate BMR/TDEE/Calorie goal from profile
function calcCalorieGoal(profile: { weight: number | null; height: number | null; age: number | null; gender: string; goals: GoalType[]; activityLevel: string }): number {
  const bmr = profile.weight && profile.height && profile.age
    ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.gender === 'male' ? 5 : -161)
    : 2000;
  const multipliers: Record<string, number> = { low: 1.2, moderate: 1.55, high: 1.725, very_high: 1.9 };
  const tdee = bmr * (multipliers[profile.activityLevel] ?? 1.55);
  if (profile.goals.includes('weight_loss')) return tdee - 500;
  if (profile.goals.includes('weight_gain') || profile.goals.includes('muscle_gain')) return tdee + 300;
  return tdee;
}

// ─── Day Summary Type ───────────────────────────────────────────────

interface DaySummary {
  date: string;
  caloriesIn: number;
  protein: number;
  fat: number;
  carbs: number;
  caloriesBurned: number;
  workoutMin: number;
  workoutCount: number;
  activityMin: number;
  activityCount: number;
  waterMl: number;
  sleepMin: number;
  bpEntries: number;
  pulseAvg: number | null;
  hasData: boolean;
}
function calcDayQuality(day: DaySummary, calGoal: number): { score: number; factors: { label: string; value: number; max: number; icon: React.ElementType }[] } {
  const factors: { label: string; value: number; max: number; icon: React.ElementType }[] = [];
  let totalScore = 0;
  let totalMax = 0;

  // 1. Calorie intake (0-30 points) — closer to goal = better
  if (day.caloriesIn > 0) {
    const calRatio = calGoal > 0 ? Math.min(day.caloriesIn / calGoal, 1.5) : 0;
    // Optimal is 0.85-1.15 of goal
    const calScore = calRatio >= 0.85 && calRatio <= 1.15 ? 30
      : calRatio >= 0.7 && calRatio <= 1.3 ? 20
      : calRatio >= 0.5 ? 10 : 5;
    factors.push({ label: 'Калории', value: calScore, max: 30, icon: Flame });
    totalScore += calScore;
    totalMax += 30;
  }

  // 2. Protein (0-15 points) — at least 1g per kg body weight
  if (day.protein > 0) {
    const protScore = day.protein >= 80 ? 15 : day.protein >= 50 ? 10 : day.protein >= 30 ? 5 : 2;
    factors.push({ label: 'Белок', value: protScore, max: 15, icon: Apple });
    totalScore += protScore;
    totalMax += 15;
  }

  // 3. Workout (0-20 points) — any workout is good
  if (day.workoutMin > 0) {
    const workScore$ = day.workoutMin >= 45 ? 20 : day.workoutMin >= 20 ? 15 : day.workoutMin >= 10 ? 10 : 5;
    factors.push({ label: 'Тренировка', value: workScore$, max: 20, icon: Dumbbell });
    totalScore += workScore$;
    totalMax += 20;
  }

  // 4. Water (0-15 points) — target 2000ml
  if (day.waterMl > 0) {
    const waterRatio = day.waterMl / 2000;
    const waterScore = waterRatio >= 1 ? 15 : waterRatio >= 0.7 ? 10 : waterRatio >= 0.4 ? 5 : 2;
    factors.push({ label: 'Вода', value: waterScore, max: 15, icon: Droplets });
    totalScore += waterScore;
    totalMax += 15;
  }

  // 5. Sleep (0-20 points) — target 7-9 hours
  if (day.sleepMin > 0) {
    const sleepH = day.sleepMin / 60;
    const sleepScore = sleepH >= 7 && sleepH <= 9 ? 20 : sleepH >= 6 ? 14 : sleepH >= 5 ? 8 : 3;
    factors.push({ label: 'Сон', value: sleepScore, max: 20, icon: BedDouble });
    totalScore += sleepScore;
    totalMax += 20;
  }

  // Normalize to 0-100
  const score = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  return { score, factors };
}

// ─── Component ──────────────────────────────────────────────────────

type Period = 'week' | 'month';

export default function StatsPanel() {
  const foodEntries = useAppStore((s) => s.foodEntries);
  const workoutEntries = useAppStore((s) => s.workoutEntries);
  const diaryEntries = useAppStore((s) => s.diaryEntries);
  const profile = useAppStore((s) => s.profile);
  const analyzeWorkoutStream = useAppStore((s) => s.analyzeWorkoutStream);
  const isSending = useAppStore((s) => s.isSending);
  const streamingAnalysis = useAppStore((s) => s.streamingAnalysis);

  const [period, setPeriod] = useState<Period>('week');
  const [pageOffset, setPageOffset] = useState(0); // 0 = current, 1 = previous week/month, etc.
  const [dayEvals, setDayEvals] = useState<Record<string, string>>({});
  const [evaluatingDate, setEvaluatingDate] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Load historical water/sleep logs
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);

  const days = period === 'week' ? 7 : 30;
  const periodDays = useMemo(() => {
    const start = pageOffset * days;
    return dateRange(days).map((d, i) => getDaysAgo(start + days - 1 - i));
  }, [period, pageOffset, days]);

  // Load historical water/sleep data for the period
  useEffect(() => {
    const loadHistorical = async () => {
      try {
        const wLogs = await db.waterLogs.where('date').anyOf(periodDays).toArray();
        const sLogs = await db.sleepLogs.where('date').anyOf(periodDays).toArray();
        setWaterLogs(wLogs);
        setSleepLogs(sLogs);
      } catch {
        // ignore
      }
    };
    loadHistorical();
  }, [periodDays.join(',')]);

  const calGoal = useMemo(() => calcCalorieGoal(profile), [profile]);

  // Build day summaries
  const daySummaries = useMemo((): DaySummary[] => {
    return periodDays.map((date) => {
      const dayFood = foodEntries.filter((e) => e.date === date);
      const dayWorkouts = workoutEntries.filter((e) => e.date === date);
      const dayActivities = diaryEntries.filter((e) => e.date === date && e.type === 'activity');
      const dayBp = diaryEntries.filter((e) => e.date === date && e.type === 'blood_pressure');

      const waterLog = waterLogs.find((w) => w.date === date);
      const sleepLog = sleepLogs.find((s) => s.date === date);

      const caloriesIn = dayFood.reduce((s, e) => s + (e.estimatedCalories ?? 0), 0);
      const protein = dayFood.reduce((s, e) => s + (e.estimatedProtein ?? 0), 0);
      const fat = dayFood.reduce((s, e) => s + (e.estimatedFat ?? 0), 0);
      const carbs = dayFood.reduce((s, e) => s + (e.estimatedCarbs ?? 0), 0);
      const caloriesBurned = dayWorkouts.reduce((s, e) => s + (e.estimatedCaloriesBurned ?? 0), 0);
      const workoutMin = dayWorkouts.reduce((s, e) => s + (e.estimatedDuration ?? 0), 0);
      const activityMin = dayActivities.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
      const waterMl = waterLog ? waterLog.glasses * waterLog.glassMl : 0;

      let sleepMin = 0;
      if (sleepLog) {
        for (const p of sleepLog.periods) {
          const [sh, sm] = p.start.split(':').map(Number);
          const [eh, em] = p.end.split(':').map(Number);
          let diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff < 0) diff += 1440; // overnight
          sleepMin += diff;
        }
      }

      const pulseValues = dayBp.filter((e) => e.pulse).map((e) => e.pulse!);
      const pulseAvg = pulseValues.length > 0 ? Math.round(pulseValues.reduce((a, b) => a + b, 0) / pulseValues.length) : null;

      const hasData = caloriesIn > 0 || workoutMin > 0 || activityMin > 0 || waterMl > 0 || sleepMin > 0;

      return { date, caloriesIn, protein, fat, carbs, caloriesBurned, workoutMin, workoutCount: dayWorkouts.length, activityMin, activityCount: dayActivities.length, waterMl, sleepMin, bpEntries: dayBp.length, pulseAvg, hasData };
    });
  }, [periodDays, foodEntries, workoutEntries, diaryEntries, waterLogs, sleepLogs]);

  // Period aggregates
  const periodAgg = useMemo(() => {
    const withData = daySummaries.filter((d) => d.hasData);
    return {
      daysWithData: withData.length,
      avgCalories: withData.length ? Math.round(withData.reduce((s, d) => s + d.caloriesIn, 0) / withData.length) : 0,
      avgProtein: withData.length ? Math.round(withData.reduce((s, d) => s + d.protein, 0) / withData.length) : 0,
      totalWorkoutMin: withData.reduce((s, d) => s + d.workoutMin, 0),
      totalActivityMin: withData.reduce((s, d) => s + d.activityMin, 0),
      totalCalBurned: withData.reduce((s, d) => s + d.caloriesBurned, 0),
      avgWaterMl: withData.length ? Math.round(withData.reduce((s, d) => s + d.waterMl, 0) / withData.length) : 0,
      avgSleepH: withData.filter((d) => d.sleepMin > 0).length ? +(withData.filter((d) => d.sleepMin > 0).reduce((s, d) => s + d.sleepMin, 0) / withData.filter((d) => d.sleepMin > 0).length / 60).toFixed(1) : 0,
      avgQuality: withData.length ? Math.round(withData.reduce((s, d) => s + calcDayQuality(d, calGoal).score, 0) / withData.length) : 0,
      calorieGoalMet: withData.filter((d) => d.caloriesIn > 0 && Math.abs(d.caloriesIn - calGoal) / calGoal <= 0.15).length,
      workoutDays: withData.filter((d) => d.workoutMin > 0).length,
    };
  }, [daySummaries, calGoal]);

  // AI day evaluation
  const handleEvalDay = async (date: string) => {
    const provider = useAppStore.getState().providers.find((p) => p.isActive);
    if (!provider || !provider.baseUrl || !provider.model) return;

    const day = daySummaries.find((d) => d.date === date);
    if (!day) return;

    setIsEvaluating(true);
    setEvaluatingDate(date);
    try {
      const q = calcDayQuality(day, calGoal);
      const prompt = `Оцени день пользователя NutriAdvisor на основе данных:
Дата: ${formatDateLabel(date)}
Калории: ${day.caloriesIn} из ${Math.round(calGoal)} ккал (${Math.round((day.caloriesIn / calGoal) * 100)}% цели)
Белки: ${day.protein}г, Жиры: ${day.fat}г, Углеводы: ${day.carbs}г
Тренировки: ${day.workoutMin} мин, ${day.workoutCount} шт, сожжено ${day.caloriesBurned} ккал
Активность: ${day.activityMin} мин, ${day.activityCount} шт
Вода: ${day.waterMl} мл из 2000 мл
Сон: ${(day.sleepMin / 60).toFixed(1)} ч из 8 ч
Пульс: ${day.pulseAvg ?? 'нет'} уд/мин
Оценка качества дня: ${q.score}/100

Дай краткую оценку дня (2-3 предложения): что хорошо, что можно улучшить, конкретные рекомендации.`;

      const result = await analyzeWorkoutStream(prompt);
      setDayEvals((prev) => ({ ...prev, [date]: result }));
    } catch {
      // ignore
    } finally {
      setIsEvaluating(false);
      setEvaluatingDate(null);
    }
  };

  // Quality color
  const qualityColor = (score: number) =>
    score >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 60 ? 'text-yellow-600 dark:text-yellow-400'
    : score >= 40 ? 'text-orange-600 dark:text-orange-400'
    : 'text-red-600 dark:text-red-400';

  const qualityBg = (score: number) =>
    score >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30'
    : score >= 60 ? 'bg-yellow-100 dark:bg-yellow-900/30'
    : score >= 40 ? 'bg-orange-100 dark:bg-orange-900/30'
    : 'bg-red-100 dark:bg-red-900/30';

  const qualityLabel = (score: number) =>
    score >= 80 ? 'Отлично' : score >= 60 ? 'Хорошо' : score >= 40 ? 'Средне' : score > 0 ? 'Слабо' : 'Нет данных';

  const periodLabel = period === 'week' ? 'Неделя' : 'Месяц';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-1.5">
          <TrendingUp className="h-5 w-5 text-emerald-600" /> Статистика
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant={period === 'week' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setPeriod('week'); setPageOffset(0); }}
          >
            Неделя
          </Button>
          <Button
            variant={period === 'month' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setPeriod('month'); setPageOffset(0); }}
          >
            Месяц
          </Button>
        </div>
      </div>

      {/* Period navigation */}
      <div className="flex items-center justify-between">
        <button
          className="rounded-lg p-2 hover:bg-muted text-muted-foreground"
          onClick={() => setPageOffset((p) => p + 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {pageOffset === 0 ? `Текущая ${periodLabel.toLowerCase()}` : `${periodLabel} −${pageOffset}`}
        </span>
        <button
          className="rounded-lg p-2 hover:bg-muted text-muted-foreground disabled:opacity-30"
          onClick={() => setPageOffset((p) => Math.max(0, p - 1))}
          disabled={pageOffset === 0}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Period Summary Card */}
      <Card className="overflow-hidden border-emerald-200 dark:border-emerald-800/40">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <Target className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold">Итоги {periodLabel.toLowerCase()}</span>
            <Badge variant="outline" className="text-[10px] ml-auto">{periodAgg.daysWithData} дн. с данными</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Avg quality */}
            <div className="text-center">
              <div className={`text-2xl font-bold ${qualityColor(periodAgg.avgQuality)}`}>{periodAgg.avgQuality}</div>
              <div className="text-[10px] text-muted-foreground">Ср. качество</div>
            </div>
            {/* Avg calories */}
            <div className="text-center">
              <div className="text-2xl font-bold">{periodAgg.avgCalories}</div>
              <div className="text-[10px] text-muted-foreground">Ср. ккал/день</div>
            </div>
            {/* Workout */}
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{periodAgg.workoutDays}</div>
              <div className="text-[10px] text-muted-foreground">Трен. дней</div>
            </div>
            {/* Calorie goal met */}
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{periodAgg.calorieGoalMet}</div>
              <div className="text-[10px] text-muted-foreground">Цель kcal ±15%</div>
            </div>
          </div>

          {/* Secondary stats */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center border-t pt-2">
            <div>
              <div className="text-sm font-semibold">{periodAgg.avgProtein}г</div>
              <div className="text-[10px] text-muted-foreground">Ср. белок</div>
            </div>
            <div>
              <div className="text-sm font-semibold">{periodAgg.totalWorkoutMin + periodAgg.totalActivityMin} мин</div>
              <div className="text-[10px] text-muted-foreground">Активность</div>
            </div>
            <div>
              <div className="text-sm font-semibold">{periodAgg.avgSleepH}ч</div>
              <div className="text-[10px] text-muted-foreground">Ср. сон</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mini bar chart: daily quality scores */}
      <Card className="overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Качество дней</span>
          </div>
          <div className="flex items-end gap-1 h-20">
            {daySummaries.map((day) => {
              const q = calcDayQuality(day, calGoal);
              const heightPct = q.score > 0 ? Math.max(8, q.score) : 4;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className={`w-full rounded-t-sm ${q.score > 0 ? qualityBg(q.score) : 'bg-muted/40'}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${formatDateLabel(day.date)}: ${q.score}%`}
                  />
                  <span className="text-[8px] text-muted-foreground leading-none">
                    {new Date(day.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Daily details */}
      <div className="space-y-3">
        {daySummaries.filter((d) => d.hasData).map((day) => {
          const q = calcDayQuality(day, calGoal);
          return (
            <Card key={day.date} className="overflow-hidden">
              <CardContent className="p-3 space-y-2">
                {/* Day header */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{formatDateLabel(day.date)}</span>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${qualityBg(q.score)} ${qualityColor(q.score)} border-0`}>
                      {q.score}% {qualityLabel(q.score)}
                    </Badge>
                    <button
                      className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                      onClick={() => handleEvalDay(day.date)}
                      disabled={isEvaluating}
                      title="ИИ-оценка дня"
                    >
                      {evaluatingDate === day.date && isEvaluating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Factor bars */}
                {q.factors.length > 0 && (
                  <div className="space-y-1">
                    {q.factors.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <f.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground w-16 shrink-0">{f.label}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${(f.value / f.max) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-6 text-right">{f.value}/{f.max}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Day metrics row */}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {day.caloriesIn > 0 && (
                    <span className="flex items-center gap-0.5"><Flame className="h-2.5 w-2.5" /> {day.caloriesIn} ккал</span>
                  )}
                  {day.protein > 0 && (
                    <span>Б: {day.protein}г</span>
                  )}
                  {day.workoutMin > 0 && (
                    <span className="flex items-center gap-0.5"><Dumbbell className="h-2.5 w-2.5" /> {day.workoutMin} мин</span>
                  )}
                  {day.caloriesBurned > 0 && (
                    <span>−{day.caloriesBurned} ккал</span>
                  )}
                  {day.waterMl > 0 && (
                    <span className="flex items-center gap-0.5"><Droplets className="h-2.5 w-2.5" /> {day.waterMl} мл</span>
                  )}
                  {day.sleepMin > 0 && (
                    <span className="flex items-center gap-0.5"><BedDouble className="h-2.5 w-2.5" /> {(day.sleepMin / 60).toFixed(1)}ч</span>
                  )}
                  {day.pulseAvg && (
                    <span className="flex items-center gap-0.5"><Activity className="h-2.5 w-2.5" /> {day.pulseAvg} уд/мин</span>
                  )}
                </div>

                {/* Calorie goal progress */}
                {day.caloriesIn > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Цель: {Math.round(calGoal)} ккал</span>
                      <span>{Math.round((day.caloriesIn / calGoal) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${day.caloriesIn > calGoal * 1.15 ? 'bg-red-500' : day.caloriesIn > calGoal * 0.85 ? 'bg-emerald-500' : 'bg-yellow-500'}`}
                        style={{ width: `${Math.min(100, (day.caloriesIn / calGoal) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* AI evaluation */}
                {dayEvals[day.date] && (
                  <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2 border border-emerald-200 dark:border-emerald-800/40 text-xs">
                    <div className="flex items-center gap-1 mb-1">
                      <Sparkles className="h-3 w-3 text-emerald-600" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">Оценка ИИ</span>
                    </div>
                    <MarkdownRenderer content={dayEvals[day.date]} className="text-xs" />
                  </div>
                )}

                {/* Streaming AI evaluation */}
                {evaluatingDate === day.date && isEvaluating && streamingAnalysis && (
                  <div className="mt-2 rounded-lg bg-muted p-2 text-xs">
                    <MarkdownRenderer content={streamingAnalysis} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {daySummaries.filter((d) => d.hasData).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Нет данных за этот период
          </div>
        )}
      </div>
    </div>
  );
}
