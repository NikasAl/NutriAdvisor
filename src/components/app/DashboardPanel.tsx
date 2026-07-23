'use client';

import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  UtensilsCrossed, MessageSquare, Target, TrendingUp, Zap, Moon, Brain, Heart, Flame,
} from 'lucide-react';
import { GOAL_LABELS } from '@/lib/types';
import type { GoalType } from '@/lib/types';

const GOAL_ICONS: Record<GoalType, React.ElementType> = {
  health: Heart, weight_loss: TrendingUp, weight_gain: TrendingUp,
  muscle_gain: Flame, cutting: Flame, better_sleep: Moon,
  wellbeing: Zap, mental_clarity: Brain, energy: Zap, maintenance: Target,
};

export default function DashboardPanel() {
  const profile = useAppStore((s) => s.profile);
  const foodEntries = useAppStore((s) => s.foodEntries);
  const chatSessions = useAppStore((s) => s.chatSessions);
  const getActiveProvider = useAppStore((s) => s.getActiveProvider);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const loadChatSessions = useAppStore((s) => s.loadChatSessions);

  useEffect(() => {
    loadProfile();
    loadFoodEntries();
    loadChatSessions();
  }, [loadProfile, loadFoodEntries, loadChatSessions]);

  const provider = getActiveProvider();
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = foodEntries.filter((e) => e.date === today);

  const totalCalories = todayEntries.reduce((sum, e) => sum + (e.estimatedCalories ?? 0), 0);
  const totalProtein = todayEntries.reduce((sum, e) => sum + (e.estimatedProtein ?? 0), 0);
  const totalFat = todayEntries.reduce((sum, e) => sum + (e.estimatedFat ?? 0), 0);
  const totalCarbs = todayEntries.reduce((sum, e) => sum + (e.estimatedCarbs ?? 0), 0);

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
  const calorieProgress = Math.min(100, Math.round((totalCalories / calorieGoal) * 100));

  return (
    <div className="space-y-4 pb-4">
      {/* Greeting */}
      <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3">
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
        <CardContent className="p-4 space-y-3">
          {/* Provider status */}
          {!provider || !provider.apiKey ? (
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
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              <span>Провайдер: {provider.name} ({provider.model})</span>
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

      {/* Calorie tracker */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <UtensilsCrossed className="h-4 w-4 text-emerald-600" />
            Калории за сегодня
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-2xl font-bold">{totalCalories}</span>
              <span className="ml-1 text-sm text-muted-foreground">/ {Math.round(calorieGoal)} ккал</span>
            </div>
            <span className="text-sm text-muted-foreground">{calorieProgress}%</span>
          </div>
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

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Быстрые действия</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-auto gap-2 py-3"
            onClick={() => setActiveTab('food')}
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span className="text-xs">Записать приём пищи</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto gap-2 py-3"
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs">Спросить AI</span>
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
