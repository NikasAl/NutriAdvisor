'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Heart, TrendingDown, TrendingUp, Dumbbell, Flame, Moon, Smile, Brain, Zap, Target, Check,
  Plus, Trash2, Star,
} from 'lucide-react';
import type { GoalType, ActivityLevel } from '@/lib/types';
import { GOAL_LABELS } from '@/lib/types';

const GOAL_ICONS_MAP: Record<GoalType, React.ElementType> = {
  health: Heart, weight_loss: TrendingDown, weight_gain: TrendingUp,
  muscle_gain: Dumbbell, cutting: Flame, better_sleep: Moon,
  wellbeing: Smile, mental_clarity: Brain, energy: Zap, maintenance: Target,
};

const ALL_GOALS: GoalType[] = [
  'health', 'weight_loss', 'weight_gain', 'muscle_gain', 'cutting',
  'better_sleep', 'wellbeing', 'mental_clarity', 'energy', 'maintenance',
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'low', label: 'Низкий (сидячий образ жизни)' },
  { value: 'moderate', label: 'Умеренный (1-3 тренировки в неделю)' },
  { value: 'high', label: 'Высокий (3-5 тренировок в неделю)' },
  { value: 'very_high', label: 'Очень высокий (проф. спорт / физ. работа)' },
];

export default function ProfilePanel() {
  const profile = useAppStore((s) => s.profile);
  const saveProfile = useAppStore((s) => s.saveProfile);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const customGoals = useAppStore((s) => s.customGoals);
  const loadCustomGoals = useAppStore((s) => s.loadCustomGoals);
  const addCustomGoal = useAppStore((s) => s.addCustomGoal);
  const deleteCustomGoal = useAppStore((s) => s.deleteCustomGoal);
  const toggleCustomGoal = useAppStore((s) => s.toggleCustomGoal);

  const [localProfile, setLocalProfile] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [goalError, setGoalError] = useState('');

  useEffect(() => {
    loadProfile();
    loadCustomGoals();
  }, [loadProfile, loadCustomGoals]);

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  const toggleGoal = (goal: GoalType) => {
    const goals = [...localProfile.goals];
    const idx = goals.indexOf(goal);
    if (idx >= 0) goals.splice(idx, 1);
    else goals.push(goal);
    setLocalProfile({ ...localProfile, goals });
  };

  const handleAddCustomGoal = async () => {
    const name = newGoalName.trim();
    if (!name) {
      setGoalError('Введите название цели');
      return;
    }
    if (name.length > 50) {
      setGoalError('Название слишком длинное (макс. 50 символов)');
      return;
    }
    setGoalError('');
    await addCustomGoal(name);
    setNewGoalName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomGoal();
    }
  };

  const handleSave = async () => {
    await saveProfile(localProfile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 pb-4">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="basic">Основное</TabsTrigger>
          <TabsTrigger value="goals">Цели</TabsTrigger>
          <TabsTrigger value="health">Здоровье</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-base">Личные данные</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Имя</Label>
                <Input
                  value={localProfile.name}
                  onChange={(e) => setLocalProfile({ ...localProfile, name: e.target.value })}
                  placeholder="Ваше имя"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Возраст</Label>
                  <Input
                    type="number"
                    value={localProfile.age ?? ''}
                    onChange={(e) => setLocalProfile({ ...localProfile, age: e.target.value ? Number(e.target.value) : null })}
                    placeholder="30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Пол</Label>
                  <Select value={localProfile.gender} onValueChange={(v) => setLocalProfile({ ...localProfile, gender: v as 'male' | 'female' | 'other' })}>
                    <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Мужской</SelectItem>
                      <SelectItem value="female">Женский</SelectItem>
                      <SelectItem value="other">Другой</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Вес (кг)</Label>
                  <Input
                    type="number"
                    value={localProfile.weight ?? ''}
                    onChange={(e) => setLocalProfile({ ...localProfile, weight: e.target.value ? Number(e.target.value) : null })}
                    placeholder="70"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Рост (см)</Label>
                  <Input
                    type="number"
                    value={localProfile.height ?? ''}
                    onChange={(e) => setLocalProfile({ ...localProfile, height: e.target.value ? Number(e.target.value) : null })}
                    placeholder="175"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Уровень активности</Label>
                <Select
                  value={localProfile.activityLevel}
                  onValueChange={(v) => setLocalProfile({ ...localProfile, activityLevel: v as ActivityLevel })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals" className="mt-4 space-y-4">
          {/* Preset goals */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-base">Предустановленные цели</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Выберите одну или несколько целей. Рекомендации будут адаптированы под них.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_GOALS.map((goal) => {
                  const Icon = GOAL_ICONS_MAP[goal];
                  const isSelected = localProfile.goals.includes(goal);
                  return (
                    <button
                      key={goal}
                      onClick={() => toggleGoal(goal)}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : 'hover:border-muted-foreground/30'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{GOAL_LABELS[goal]}</span>
                      {isSelected && <Check className="ml-auto h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Custom goals */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-base">Свои цели</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Создайте собственные цели. Активные цели используются в рекомендациях.
              </p>
              <div className="flex gap-2 mb-3">
                <Input
                  value={newGoalName}
                  onChange={(e) => { setNewGoalName(e.target.value); setGoalError(''); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Название цели..."
                  maxLength={50}
                  className="flex-1"
                />
                <Button
                  onClick={handleAddCustomGoal}
                  size="icon"
                  disabled={!newGoalName.trim()}
                  className="shrink-0 rounded-full"
                  title="Добавить цель"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {goalError && (
                <p className="text-xs text-destructive mb-2">{goalError}</p>
              )}
              {customGoals.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Нет созданных целей. Добавьте первую выше.
                </p>
              ) : (
                <div className="space-y-2">
                  {customGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className={`flex items-center gap-2 rounded-lg border p-3 transition-all ${
                        goal.isActive
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                          : 'opacity-60'
                      }`}
                    >
                      <button
                        onClick={() => toggleCustomGoal(goal.id)}
                        className="shrink-0"
                        title={goal.isActive ? 'Деактивировать' : 'Активировать'}
                      >
                        <Star
                          className={`h-4 w-4 transition-colors ${
                            goal.isActive
                              ? 'fill-emerald-500 text-emerald-500'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                      <span className={`text-sm font-medium flex-1 ${goal.isActive ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                        {goal.name}
                      </span>
                      <button
                        onClick={() => deleteCustomGoal(goal.id)}
                        className="shrink-0 rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Удалить цель"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-base">Здоровье и ограничения</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Ограничения в питании</Label>
                <Textarea
                  value={localProfile.restrictions}
                  onChange={(e) => setLocalProfile({ ...localProfile, restrictions: e.target.value })}
                  placeholder="Аллергии, непереносимости, религиозные ограничения..."
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Заметки о здоровье</Label>
                <Textarea
                  value={localProfile.healthNotes}
                  onChange={(e) => setLocalProfile({ ...localProfile, healthNotes: e.target.value })}
                  placeholder="Хронические заболевания, принимаемые лекарства, анализы..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button onClick={handleSave} className="w-full gap-2" size="lg">
        {saved ? (
          <>
            <Check className="h-4 w-4" />
            Сохранено!
          </>
        ) : (
          'Сохранить профиль'
        )}
      </Button>
    </div>
  );
}
