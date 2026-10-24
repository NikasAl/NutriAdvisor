'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, Flame, Dumbbell, Droplets, BedDouble, Apple, TrendingUp, Target, Calendar, Activity } from 'lucide-react';
import type { GoalType, DayEval } from '@/lib/types';
import { computeTrend } from '@/lib/types';
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

// Quality score: 0-100 based on multiple factors
interface QualityFactor {
  label: string;
  value: number;   // score points
  max: number;     // max score points
  icon: React.ElementType;
  actual?: string; // human-readable actual value (e.g. "1000 мл")
  target?: string; // human-readable target value (e.g. "1500 мл")
  barRatio?: number; // visual fill ratio (actual/target), used for bar width instead of value/max
}

function calcDayQuality(day: DaySummary, calGoal: number, waterTarget: number, sleepTargetH: number): { score: number; factors: QualityFactor[] } {
  const factors: QualityFactor[] = [];
  let totalScore = 0;
  let totalMax = 0;

  // 1. Calorie intake (0-30 points) — closer to goal = better
  if (day.caloriesIn > 0) {
    const calRatio = calGoal > 0 ? Math.min(day.caloriesIn / calGoal, 1.5) : 0;
    const calScore = calRatio >= 0.85 && calRatio <= 1.15 ? 30
      : calRatio >= 0.7 && calRatio <= 1.3 ? 20
      : calRatio >= 0.5 ? 10 : 5;
    factors.push({ label: 'Калории', value: calScore, max: 30, icon: Flame,
      actual: `${day.caloriesIn} ккал`, target: `${Math.round(calGoal)} ккал`,
      barRatio: Math.min(calGoal > 0 ? day.caloriesIn / calGoal : 0, 1) });
    totalScore += calScore;
    totalMax += 30;
  }

  // 2. Protein (0-15 points)
  if (day.protein > 0) {
    const protScore = day.protein >= 80 ? 15 : day.protein >= 50 ? 10 : day.protein >= 30 ? 5 : 2;
    factors.push({ label: 'Белок', value: protScore, max: 15, icon: Apple,
      actual: `${day.protein}г`, target: '80г',
      barRatio: Math.min(day.protein / 80, 1) });
    totalScore += protScore;
    totalMax += 15;
  }

  // 3. Workout (0-20 points)
  if (day.workoutMin > 0) {
    const workScore = day.workoutMin >= 45 ? 20 : day.workoutMin >= 20 ? 15 : day.workoutMin >= 10 ? 10 : 5;
    factors.push({ label: 'Тренировка', value: workScore, max: 20, icon: Dumbbell,
      actual: `${day.workoutMin} мин`, target: '45 мин',
      barRatio: Math.min(day.workoutMin / 45, 1) });
    totalScore += workScore;
    totalMax += 20;
  }

  // 4. Water (0-15 points) — uses profile target
  if (day.waterMl > 0) {
    const waterRatio = day.waterMl / waterTarget;
    const waterScore = waterRatio >= 1 ? 15 : waterRatio >= 0.7 ? 10 : waterRatio >= 0.4 ? 5 : 2;
    factors.push({ label: 'Вода', value: waterScore, max: 15, icon: Droplets,
      actual: `${day.waterMl} мл`, target: `${waterTarget} мл`,
      barRatio: Math.min(waterRatio, 1) });
    totalScore += waterScore;
    totalMax += 15;
  }

  // 5. Sleep (0-20 points) — uses profile target
  if (day.sleepMin > 0) {
    const sleepH = day.sleepMin / 60;
    const sleepScore = sleepH >= sleepTargetH - 0.5 && sleepH <= sleepTargetH + 1 ? 20
      : sleepH >= sleepTargetH - 1 ? 14 : sleepH >= sleepTargetH - 2 ? 8 : 3;
    factors.push({ label: 'Сон', value: sleepScore, max: 20, icon: BedDouble,
      actual: `${sleepH.toFixed(1)} ч`, target: `${sleepTargetH} ч`,
      barRatio: Math.min(sleepTargetH > 0 ? sleepH / sleepTargetH : 0, 1) });
    totalScore += sleepScore;
    totalMax += 20;
  }

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

  const buildMedTestSummary = useAppStore((s) => s.buildMedTestSummary);
  const medTestParams = useAppStore((s) => s.medTestParams);
  const medTestMeasures = useAppStore((s) => s.medTestMeasures);

  const [period, setPeriod] = useState<Period>('week');
  const [pageOffset, setPageOffset] = useState(0);
  const [dayEvals, setDayEvals] = useState<Record<string, string>>({});
  const [expandedEvals, setExpandedEvals] = useState<Set<string>>(new Set());
  const [evaluatingDate, setEvaluatingDate] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);

  const days = period === 'week' ? 7 : 30;
  const periodDays = useMemo(() => {
    const start = pageOffset * days;
    return dateRange(days).map((_, i) => getDaysAgo(start + days - 1 - i));
  }, [period, pageOffset, days]);

  // Load historical water/sleep/eval data
  useEffect(() => {
    const loadHistorical = async () => {
      try {
        const wLogs = await db.waterLogs.where('date').anyOf(periodDays).toArray();
        const sLogs = await db.sleepLogs.where('date').anyOf(periodDays).toArray();
        setWaterLogs(wLogs);
        setSleepLogs(sLogs);
      } catch (e) {
        console.warn('[StatsPanel] Failed to load water/sleep logs:', e);
      }
      // Load saved day evals from DB (separate try/catch so water/sleep isn't blocked)
      try {
        const evals = await db.dayEvals.where('date').anyOf(periodDays).toArray();
        const evalMap: Record<string, string> = {};
        for (const e of evals) {
          if (e.analysis) evalMap[e.date] = e.analysis;
        }
        console.log('[StatsPanel] Loaded', Object.keys(evalMap).length, 'day evals from DB');
        setDayEvals(evalMap);
      } catch (e) {
        console.warn('[StatsPanel] Failed to load day evals:', e);
      }
    };
    loadHistorical();
  }, [periodDays.join(',')]);

  const calGoal = useMemo(() => calcCalorieGoal(profile), [profile]);
  const waterTarget = profile.waterTargetMl || 2000;
  const sleepTargetH = profile.sleepTargetHours || 8;

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
          if (diff < 0) diff += 1440;
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
      avgQuality: withData.length ? Math.round(withData.reduce((s, d) => s + calcDayQuality(d, calGoal, waterTarget, sleepTargetH).score, 0) / withData.length) : 0,
      calorieGoalMet: withData.filter((d) => d.caloriesIn > 0 && Math.abs(d.caloriesIn - calGoal) / calGoal <= 0.15).length,
      workoutDays: withData.filter((d) => d.workoutMin > 0).length,
    };
  }, [daySummaries, calGoal, waterTarget, sleepTargetH]);

  // Toggle eval expand
  const toggleEvalExpand = (date: string) => {
    setExpandedEvals((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  // AI day evaluation
  const handleEvalDay = async (date: string) => {
    const provider = useAppStore.getState().providers.find((p) => p.isActive);
    if (!provider || !provider.baseUrl || !provider.model) return;

    const day = daySummaries.find((d) => d.date === date);
    if (!day) return;

    setIsEvaluating(true);
    setEvaluatingDate(date);
    try {
      const q = calcDayQuality(day, calGoal, waterTarget, sleepTargetH);
      const sleepH = (day.sleepMin / 60).toFixed(1);
      const calPct = calGoal > 0 ? Math.round((day.caloriesIn / calGoal) * 100) : 0;
      const waterPct = waterTarget > 0 ? Math.round((day.waterMl / waterTarget) * 100) : 0;
      const sleepPct = sleepTargetH > 0 ? Math.round((parseFloat(sleepH) / sleepTargetH) * 100) : 0;

      // Build meal breakdown
      const dayFood = foodEntries.filter((e) => e.date === date);
      const mealsByType: Record<string, string[]> = {};
      for (const f of dayFood) {
        const type = f.mealType || 'other';
        if (!mealsByType[type]) mealsByType[type] = [];
        const desc = f.description || 'Без описания';
        const cal = f.estimatedCalories ? ` (${f.estimatedCalories} ккал)` : '';
        mealsByType[type].push(`  - ${desc}${cal}`);
      }
      const mealLabels: Record<string, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
      let mealSection = '';
      for (const [type, items] of Object.entries(mealsByType)) {
        mealSection += `\n${mealLabels[type] || type}:\n${items.join('\n')}`;
      }

      // Build workout breakdown
      const dayWorkouts = workoutEntries.filter((e) => e.date === date);
      let workoutSection = '';
      for (const w of dayWorkouts) {
        const sets = w.sets.map((s) => {
          let line = s.exerciseName;
          if (s.weight) line += ` ${s.weight}кг`;
          if (s.reps) line += ` ×${s.reps}`;
          if (s.sets) line += ` ×${s.sets} под.`;
          return `  - ${line}`;
        }).join('\n');
        workoutSection += `\n${w.name || 'Тренировка'} (${w.estimatedDuration || '?'} мин, ${w.estimatedCaloriesBurned || '?'} ккал):\n${sets}`;
      }

      // Build activity breakdown
      const dayActivities = diaryEntries.filter((e) => e.date === date && e.type === 'activity');
      const activitySection = dayActivities.length > 0
        ? '\n' + dayActivities.map((a) => `  - ${a.description || 'Активность'} (${a.durationMinutes || '?'} мин)`).join('\n')
        : '';

      // Build BP data
      const dayBp = diaryEntries.filter((e) => e.date === date && e.type === 'blood_pressure');
      const bpSection = dayBp.length > 0
        ? '\n' + dayBp.map((b) => `  - ${b.systolic}/${b.diastolic} мм рт.ст., пульс ${b.pulse || '?'} уд/мин`).join('\n')
        : '';

      const prompt = `Ты — персональный диетолог и тренер пользователя Дневника Здоровья. Проанализируй день пользователя на основе всех накопленных данных.

Дата: ${formatDateLabel(date)} (${date})

--- ПИТАНИЕ ---
Всего: ${day.caloriesIn} ккал из ${Math.round(calGoal)} ккал цели (${calPct}%)
Белки: ${day.protein}г, Жиры: ${day.fat}г, Углеводы: ${day.carbs}г${mealSection}

--- ТРЕНИРОВКИ ---
Всего: ${day.workoutMin} мин, ${day.workoutCount} шт, сожжено ${day.caloriesBurned} ккал${workoutSection}

--- АКТИВНОСТЬ ---
Всего: ${day.activityMin} мин, ${day.activityCount} шт${activitySection}

--- ВОДА ---
${day.waterMl} мл из ${waterTarget} мл цели (${waterPct}%)

--- СОН ---
${sleepH} ч из ${sleepTargetH} ч цели (${sleepPct}%)

--- ДАВЛЕНИЕ И ПУЛЬС ---${bpSection || '\nНет данных'}

--- МЕДИЦИНСКИЕ ПОКАЗАТЕЛИ ---
${buildMedTestSummary() || 'Нет данных'}

--- ИТОГО ---
Оценка качества дня: ${q.score}/100

Проанализируй день комплексно:
1. Оцени питание: баланс КБЖУ, достаточно ли белка, не много ли жиров/углеводов
2. Оцени тренировки и активность: объём, интенсивность, восстановление
3. Оцени гидратацию и сон
4. Учитывай давление и пульс если есть
5. Учитывай тренды медицинских анализов — как диета и образ жизни влияют на показатели крови
6. Дай конкретные рекомендации на завтра: что изменить, добавить, на что обратить внимание

Будь конкретным и практичным. 4-6 предложений.`;

      const result = await analyzeWorkoutStream(prompt);
      setDayEvals((prev) => ({ ...prev, [date]: result }));
      setExpandedEvals((prev) => new Set(prev).add(date));
      // Save to DB (delete-then-add to avoid duplicate/upsert issues)
      try {
        await db.dayEvals.where('date').equals(date).delete();
        await db.dayEvals.add({ id: crypto.randomUUID(), date, analysis: result, updatedAt: new Date() });
        console.log('[StatsPanel] Day eval saved to DB for', date);
      } catch (e) {
        console.warn('[StatsPanel] Failed to save day eval to DB:', e);
      }
    } catch {
      // ignore LLM error
    } finally {
      setIsEvaluating(false);
      setEvaluatingDate(null);
    }
  };

  // Quality color helpers
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

  const qualityBarColor = (score: number) =>
    score >= 80 ? 'bg-emerald-500'
    : score >= 60 ? 'bg-yellow-500'
    : score >= 40 ? 'bg-orange-500'
    : 'bg-red-500';

  const qualityLabel = (score: number) =>
    score >= 80 ? 'Отлично' : score >= 60 ? 'Хорошо' : score >= 40 ? 'Средне' : score > 0 ? 'Слабо' : '—';

  const periodLabel = period === 'week' ? 'Неделя' : 'Месяц';

  // Reverse order: today first
  const daysWithData = daySummaries.filter((d) => d.hasData).reverse();

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
            <div className="text-center">
              <div className={`text-2xl font-bold ${qualityColor(periodAgg.avgQuality)}`}>{periodAgg.avgQuality}</div>
              <div className="text-[10px] text-muted-foreground">Ср. качество</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{periodAgg.avgCalories}</div>
              <div className="text-[10px] text-muted-foreground">Ср. ккал/день</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{periodAgg.workoutDays}</div>
              <div className="text-[10px] text-muted-foreground">Трен. дней</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{periodAgg.calorieGoalMet}</div>
              <div className="text-[10px] text-muted-foreground">Цель kcal ±15%</div>
            </div>
          </div>

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
          <div className="flex items-end gap-1" style={{ height: '80px' }}>
            {daySummaries.map((day) => {
              const q = calcDayQuality(day, calGoal, waterTarget, sleepTargetH);
              const heightPct = q.score > 0 ? Math.max(10, q.score) : 6;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                  <div
                    className={`w-full rounded-t-sm transition-all ${q.score > 0 ? qualityBarColor(q.score) : 'bg-muted/40'}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${formatDateLabel(day.date)}: ${q.score}%`}
                  />
                  <span className="text-[8px] text-muted-foreground leading-none mt-0.5">
                    {new Date(day.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Daily details — today first */}
      <div className="space-y-3">
        {daysWithData.map((day) => {
          const q = calcDayQuality(day, calGoal, waterTarget, sleepTargetH);
          const isEvalExpanded = expandedEvals.has(day.date);
          const hasEval = !!dayEvals[day.date];
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
                            style={{ width: `${(f.barRatio ?? (f.value / f.max)) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-auto text-right">{f.actual && f.target ? `${f.actual}/${f.target}` : `${f.value}/${f.max}`}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Day metrics row */}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {day.caloriesIn > 0 && (
                    <span className="flex items-center gap-0.5"><Flame className="h-2.5 w-2.5" /> {day.caloriesIn} ккал</span>
                  )}
                  {day.protein > 0 && <span>Б: {day.protein}г</span>}
                  {day.workoutMin > 0 && (
                    <span className="flex items-center gap-0.5"><Dumbbell className="h-2.5 w-2.5" /> {day.workoutMin} мин</span>
                  )}
                  {day.caloriesBurned > 0 && <span>−{day.caloriesBurned} ккал</span>}
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

                {/* AI evaluation — collapsible */}
                {hasEval && (
                  <div className="mt-1">
                    <button
                      className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                      onClick={() => toggleEvalExpand(day.date)}
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Оценка ИИ</span>
                      {isEvalExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {isEvalExpanded && (
                      <div className="mt-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2 border border-emerald-200 dark:border-emerald-800/40 text-xs">
                        <MarkdownRenderer content={dayEvals[day.date]} className="text-xs" />
                      </div>
                    )}
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

        {daysWithData.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Нет данных за этот период
          </div>
        )}
      </div>
    </div>
  );
}
