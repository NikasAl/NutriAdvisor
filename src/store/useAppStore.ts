import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db';
import type {
  LLMProvider,
  UserProfile,
  GoalType,
  TabId,
  ChatSession,
  ChatMessage,
  FoodEntry,
  MealType,
  CustomGoal,
  FoodLibraryItem,
  DiaryEntry,
  FoodProduct,
  Dish,
  DishIngredientData,
  FoodEntryItem,
  WaterLog,
  SleepLog,
  SleepPeriod,
} from '@/lib/types';
import { NutritionPrompts } from '@/lib/prompts';
import { callLLM, callLLMStream, buildChatMessages } from '@/lib/llm-client';
import type { LLMMessage, ContentPart } from '@/lib/llm-client';
import { SEED_PRODUCTS, SEED_DISHES } from '@/data/seed-data';

const DEFAULT_PROVIDER: Omit<LLMProvider, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'NuAdvi Proxy',
  type: 'nuadvi',
  baseUrl: 'https://kreagenium.ru/nuadvi/v1',
  apiKey: '',
  model: 'gemma-4',
  isActive: true,
  supportsVision: false,
};

const DEFAULT_PROFILE: Omit<UserProfile, 'id' | 'updatedAt'> = {
  name: '',
  age: null,
  weight: null,
  height: null,
  gender: '',
  goals: [],
  restrictions: '',
  activityLevel: 'moderate',
  healthNotes: '',
};

interface AppState {
  // Navigation
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Providers
  providers: LLMProvider[];
  activeProviderId: string | null;
  loadProviders: () => Promise<void>;
  addProvider: (p: Partial<LLMProvider>) => Promise<void>;
  updateProvider: (id: string, p: Partial<LLMProvider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  getActiveProvider: () => LLMProvider | null;

  // Profile
  profile: UserProfile;
  loadProfile: () => Promise<void>;
  saveProfile: (p: Partial<UserProfile>) => Promise<void>;

  // Custom Goals
  customGoals: CustomGoal[];
  loadCustomGoals: () => Promise<void>;
  addCustomGoal: (name: string) => Promise<void>;
  deleteCustomGoal: (id: string) => Promise<void>;
  toggleCustomGoal: (id: string) => Promise<void>;

  // Food Library
  foodLibrary: FoodLibraryItem[];
  loadFoodLibrary: () => Promise<void>;
  addFoodLibraryItem: (name: string, mealType: MealType, weight?: number) => Promise<void>;
  deleteFoodLibraryItem: (id: string) => Promise<void>;
  seedFoodLibraryFromEntries: () => Promise<void>;

  // Diary entries
  diaryEntries: DiaryEntry[];
  loadDiaryEntries: () => Promise<void>;
  addDiaryEntry: (entry: Omit<DiaryEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateDiaryEntry: (id: string, updates: Partial<DiaryEntry>) => Promise<void>;
  deleteDiaryEntry: (id: string) => Promise<void>;

  // Water tracking
  waterLog: WaterLog | null;
  waterGlassMl: number;
  loadWaterLog: (date: string) => Promise<void>;
  setWaterGlassMl: (ml: number) => void;
  addWaterGlass: () => Promise<void>;
  removeWaterGlass: () => Promise<void>;

  // Sleep tracking
  sleepLog: SleepLog | null;
  loadSleepLog: (date: string) => Promise<void>;
  saveSleepPeriods: (date: string, periods: SleepPeriod[]) => Promise<void>;
  addSleepPeriod: (date: string, period: SleepPeriod) => Promise<void>;
  removeSleepPeriod: (date: string, index: number) => Promise<void>;

  // Food Products
  foodProducts: FoodProduct[];
  loadFoodProducts: () => Promise<void>;
  addFoodProduct: (name: string) => Promise<void>;
  updateFoodProduct: (id: string, updates: Partial<FoodProduct>) => Promise<void>;
  deleteFoodProduct: (id: string) => Promise<void>;
  seedFoodCatalog: () => Promise<void>;
  buildSleepSummary: () => string;

  // Dishes
  dishes: Dish[];
  loadDishes: () => Promise<void>;
  addDish: (name: string, ingredients: DishIngredientData[]) => Promise<void>;
  updateDish: (id: string, updates: Partial<Dish>) => Promise<void>;
  deleteDish: (id: string) => Promise<void>;

  // Expand food entry items to description for LLM
  expandEntryItemsToText: (items: FoodEntryItem[]) => string;

  // Food entries
  foodEntries: FoodEntry[];
  loadFoodEntries: () => Promise<void>;
  addFoodEntry: (entry: Omit<FoodEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateFoodEntry: (id: string, updates: Partial<FoodEntry>) => Promise<void>;
  deleteFoodEntry: (id: string) => Promise<void>;
  getEntriesForDate: (date: string) => FoodEntry[];

  // Chat
  chatSessions: ChatSession[];
  currentChatId: string | null;
  chatMessages: ChatMessage[];
  loadChatSessions: () => Promise<void>;
  createChatSession: () => Promise<string>;
  selectChatSession: (id: string) => Promise<void>;
  deleteChatSession: (id: string) => Promise<void>;
  renameChatSession: (id: string, title: string) => Promise<void>;
  updateChatMessage: (id: string, content: string) => Promise<void>;
  resendFromMessage: (messageId: string, newContent: string, nutritionPeriod?: string) => Promise<void>;
  loadChatMessages: () => Promise<void>;

  // Streaming abort controller ref
  _abortController: AbortController | null;

  // LLM interaction
  sendChatMessage: (content: string, nutritionPeriod?: string) => Promise<string>;
  analyzeFoodStream: (description?: string, imageBase64?: string, weight?: number, mealType?: string) => Promise<string>;
  analyzeFoodText: (description: string, weight?: number, mealType?: string) => Promise<string>;
  analyzeFoodTextStream: (description: string, weight?: number, mealType?: string) => Promise<string>;
  lastAnalysisDebug: { prompt: string; response: string } | null;
  isSending: boolean;
  streamingContent: string;
  streamingAnalysis: string;
  stopStreaming: () => void;
}

/** Build a compact profile info string for food analysis prompts */
function buildProfileInfoForAnalysis(profile: UserProfile, customGoals: CustomGoal[]): string | undefined {
  const parts: string[] = [];
  if (profile.name) parts.push(`Пациент: ${profile.name}`);
  if (profile.age) parts.push(`Возраст: ${profile.age}`);
  if (profile.weight) parts.push(`Вес: ${profile.weight} кг`);
  if (profile.height) parts.push(`Рост: ${profile.height} см`);
  if (profile.gender) parts.push(`Пол: ${profile.gender === 'male' ? 'мужской' : profile.gender === 'female' ? 'женский' : 'другой'}`);
  const actLabels: Record<string, string> = { low: 'низкий', moderate: 'умеренный', high: 'высокий', very_high: 'очень высокий' };
  parts.push(`Активность: ${actLabels[profile.activityLevel] || profile.activityLevel}`);
  const goalNames = profile.goals.map((g) => NutritionPrompts.goalLabel(g));
  const customActive = customGoals.filter((g) => g.isActive).map((g) => g.name);
  const allGoals = [...goalNames, ...customActive].filter(Boolean);
  if (allGoals.length > 0) parts.push(`Цели: ${allGoals.join(', ')}`);
  if (profile.restrictions) parts.push(`Ограничения: ${profile.restrictions}`);
  if (profile.healthNotes) parts.push(`Здоровье: ${profile.healthNotes}`);
  return parts.length > 0 ? `Информация о пациенте:\n${parts.join('\n')}` : undefined;
}

/** Build a sleep summary string for a given period */
function buildSleepSummaryFromLog(sleepLog: SleepLog | null, period: 'today' | 'week' | 'month'): string {
  if (!sleepLog || period !== 'today') return '';
  if (sleepLog.periods.length === 0) return '';

  const parts: string[] = [];
  let totalMinutes = 0;
  for (const p of sleepLog.periods) {
    const duration = calcSleepDuration(p.start, p.end);
    totalMinutes += duration;
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    parts.push(`${p.start} – ${p.end} (${hours}ч ${mins > 0 ? mins + 'мин' : ''})`.trim());
  }
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  return `\n--- Сон за сегодня ---\nПериоды: ${parts.join('; ')}\nИтого: ${totalH}ч ${totalM > 0 ? totalM + 'мин' : ''}\n--- Конец данных о сне ---`.trim();
}

/** Calculate sleep duration in minutes, handling overnight (e.g. 22:05 -> 05:40) */
function calcSleepDuration(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60; // overnight
  return endMin - startMin;
}

/** Build a water summary string for a given period */
function buildWaterSummary(waterLog: WaterLog | null, period: 'today' | 'week' | 'month'): string {
  if (!waterLog) return '';
  if (period !== 'today') return ''; // Only show today's water for now
  const totalMl = waterLog.glasses * waterLog.glassMl;
  return `\n--- Вода за сегодня ---\nВыпито: ${waterLog.glasses} стаканов (${totalMl} мл, по ${waterLog.glassMl} мл/стакан)\n--- Конец данных о воде ---`;
}

/** Build a diary summary string from diary entries for a given period */
function buildDiarySummary(
  diaryEntries: DiaryEntry[],
  period: 'today' | 'week' | 'month'
): string {
  const now = new Date();
  const periodStart = new Date();
  if (period === 'today') {
    periodStart.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    periodStart.setDate(periodStart.getDate() - 7);
    periodStart.setHours(0, 0, 0, 0);
  } else {
    periodStart.setDate(periodStart.getDate() - 30);
    periodStart.setHours(0, 0, 0, 0);
  }

  const filtered = diaryEntries.filter((e) => new Date(e.date) >= periodStart);

  if (filtered.length === 0) {
    const label = period === 'today' ? 'за сегодня' : period === 'week' ? 'за последнюю неделю' : 'за последний месяц';
    return `\n--- Записи дневника ${label} ---\nНет записей.\n--- Конец записей дневника ---`;
  }

  const label = period === 'today' ? 'за сегодня' : period === 'week' ? 'за последнюю неделю' : 'за последний месяц';
  let summary = `\n--- Записи дневника ${label} ---\n`;

  for (const e of filtered) {
    const time = e.time ? ` ${e.time}` : '';
    if (e.type === 'activity') {
      const dur = e.durationMinutes ? ` ${e.durationMinutes} мин` : '';
      summary += `• [${e.date}${time}] Активность: ${e.description || ''}${dur}\n`;
    } else if (e.type === 'wellbeing') {
      summary += `• [${e.date}${time}] Самочувствие: ${e.note || ''}\n`;
    } else if (e.type === 'blood_pressure') {
      summary += `• [${e.date}${time}] Давление: ${e.systolic ?? '?'}/${e.diastolic ?? '?'} мм рт.ст., пульс ${e.pulse ?? '?'} уд/мин\n`;
    }
  }
  summary += '--- Конец записей дневника ---';
  return summary;
}

/** Build a nutrition summary string from food entries for a given period */
function buildNutritionSummary(
  foodEntries: FoodEntry[],
  period: 'today' | 'week' | 'month',
  expandItems?: (items: FoodEntryItem[]) => string
): string {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Determine date range
  const periodStart = new Date();
  if (period === 'today') {
    periodStart.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    periodStart.setDate(periodStart.getDate() - 7);
    periodStart.setHours(0, 0, 0, 0);
  } else {
    periodStart.setDate(periodStart.getDate() - 30);
    periodStart.setHours(0, 0, 0, 0);
  }

  const filtered = foodEntries.filter((e) => {
    const entryDate = new Date(e.date);
    return entryDate >= periodStart;
  });

  if (filtered.length === 0) {
    return period === 'today'
      ? '\n--- Данные о питании за сегодня ---\nНет записей о приёмах пищи за сегодня.\n--- Конец данных о питании ---'
      : `\n--- Данные о питании за ${period === 'week' ? 'последнюю неделю' : 'последний месяц'} ---\nНет записей о приёмах пищи за указанный период.\n--- Конец данных о питании ---`;
  }

  const periodLabel = period === 'today' ? 'сегодня' : period === 'week' ? 'за последнюю неделю' : 'за последний месяц';

  const desc = (e: FoodEntry) =>
    e.items && expandItems ? expandItems(e.items) : e.description;

  let summary = `\n--- Данные о питании ${periodLabel} ---\n`;

  // Group by date for today; aggregate for week/month
  if (period === 'today') {
    summary += `Количество приёмов пищи: ${filtered.length}\n\n`;
    for (const entry of filtered) {
      summary += `• [${entry.date} ${new Date(entry.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}] `;
      summary += `${desc(entry)}`;
      if (entry.weight) summary += ` (${entry.weight}г)`;
      if (entry.estimatedCalories) summary += ` — ${entry.estimatedCalories} ккал`;
      if (entry.estimatedProtein || entry.estimatedFat || entry.estimatedCarbs) {
        const macros: string[] = [];
        if (entry.estimatedProtein) macros.push(`Б:${entry.estimatedProtein}г`);
        if (entry.estimatedFat) macros.push(`Ж:${entry.estimatedFat}г`);
        if (entry.estimatedCarbs) macros.push(`У:${entry.estimatedCarbs}г`);
        summary += ` [${macros.join(', ')}]`;
      }
      summary += '\n';
    }
    const totalCal = filtered.reduce((s, e) => s + (e.estimatedCalories ?? 0), 0);
    const totalProt = filtered.reduce((s, e) => s + (e.estimatedProtein ?? 0), 0);
    const totalFat = filtered.reduce((s, e) => s + (e.estimatedFat ?? 0), 0);
    const totalCarbs = filtered.reduce((s, e) => s + (e.estimatedCarbs ?? 0), 0);
    summary += `\nИтого за сегодня: ${totalCal} ккал | Б: ${totalProt.toFixed(0)}г | Ж: ${totalFat.toFixed(0)}г | У: ${totalCarbs.toFixed(0)}г\n`;
  } else {
    // Aggregate by date
    const byDate: Record<string, FoodEntry[]> = {};
    for (const e of filtered) {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    }
    const dates = Object.keys(byDate).sort().reverse();

    // Overall totals
    const totalCal = filtered.reduce((s, e) => s + (e.estimatedCalories ?? 0), 0);
    const totalProt = filtered.reduce((s, e) => s + (e.estimatedProtein ?? 0), 0);
    const totalFat = filtered.reduce((s, e) => s + (e.estimatedFat ?? 0), 0);
    const totalCarbs = filtered.reduce((s, e) => s + (e.estimatedCarbs ?? 0), 0);
    const numDays = dates.length;
    const avgCal = numDays > 0 ? totalCal / numDays : 0;
    const avgProt = numDays > 0 ? totalProt / numDays : 0;
    const avgFat = numDays > 0 ? totalFat / numDays : 0;
    const avgCarbs = numDays > 0 ? totalCarbs / numDays : 0;

    summary += `Количество дней с записями: ${numDays}\n\n`;
    summary += `Среднее за день: ${avgCal.toFixed(0)} ккал | Б: ${avgProt.toFixed(0)}г | Ж: ${avgFat.toFixed(0)}г | У: ${avgCarbs.toFixed(0)}г\n`;
    summary += `Общее за период: ${totalCal} ккал | Б: ${totalProt.toFixed(0)}г | Ж: ${totalFat.toFixed(0)}г | У: ${totalCarbs.toFixed(0)}г\n\n`;

    // Brief per-day summary (last 3 days with details, rest aggregated)
    const detailedDates = dates.slice(0, 3);
    const otherDates = dates.slice(3);

    for (const date of detailedDates) {
      const entries = byDate[date];
      const dayCal = entries.reduce((s, e) => s + (e.estimatedCalories ?? 0), 0);
      summary += `\n${date} (${dayCal} ккал, ${entries.length} приёмов):\n`;
      for (const entry of entries) {
        summary += `  • ${desc(entry)}`;
        if (entry.weight) summary += ` (${entry.weight}г)`;
        if (entry.estimatedCalories) summary += ` — ${entry.estimatedCalories} ккал`;
        summary += '\n';
      }
    }

    if (otherDates.length > 0) {
      summary += `\n...и ещё ${otherDates.length} дней с записями (подробности доступны по запросу).\n`;
    }
  }

  summary += '--- Конец данных о питании ---';
  return summary;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Theme — read from localStorage, apply on init
  theme: (typeof window !== 'undefined' ? (localStorage.getItem('nutri-theme') as 'light' | 'dark' | 'system') || 'system' : 'system'),
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('nutri-theme', theme);
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  },

  // Providers
  providers: [],
  activeProviderId: null,

  loadProviders: async () => {
    const providers = await db.providers.toArray();
    if (providers.length === 0) {
      const id = uuid();
      const now = new Date();
      const def = { ...DEFAULT_PROVIDER, id, createdAt: now, updatedAt: now };
      await db.providers.add(def);
      providers.push(def);
    }
    const active = providers.find((p) => p.isActive) ?? providers[0];
    set({ providers, activeProviderId: active?.id ?? null });
  },

  addProvider: async (p) => {
    const now = new Date();
    const provider: LLMProvider = {
      id: uuid(),
      name: p.name ?? 'New Provider',
      type: p.type ?? 'custom',
      baseUrl: p.baseUrl ?? '',
      apiKey: p.apiKey ?? '',
      model: p.model ?? '',
      isActive: p.isActive ?? false,
      supportsVision: p.supportsVision ?? false,
      headers: p.headers,
      createdAt: now,
      updatedAt: now,
    };
    await db.providers.add(provider);
    set((s) => ({ providers: [...s.providers, provider] }));
  },

  updateProvider: async (id, p) => {
    const updated = { ...p, updatedAt: new Date() };
    await db.providers.update(id, updated);
    set((s) => ({
      providers: s.providers.map((pr) => (pr.id === id ? { ...pr, ...updated } : pr)),
    }));
  },

  deleteProvider: async (id) => {
    await db.providers.delete(id);
    set((s) => ({
      providers: s.providers.filter((pr) => pr.id !== id),
      activeProviderId: s.activeProviderId === id ? (s.providers[0]?.id ?? null) : s.activeProviderId,
    }));
  },

  getActiveProvider: () => {
    const s = get();
    return s.providers.find((p) => p.id === s.activeProviderId) ?? null;
  },

  // Profile
  profile: { ...DEFAULT_PROFILE, id: 'main', updatedAt: new Date() },

  loadProfile: async () => {
    const existing = await db.userProfile.get('main');
    if (existing) {
      set({ profile: existing });
    }
  },

  saveProfile: async (p) => {
    const updated = { ...get().profile, ...p, id: 'main', updatedAt: new Date() };
    await db.userProfile.put(updated);
    set({ profile: updated });
  },

  // Custom Goals
  customGoals: [],

  loadCustomGoals: async () => {
    const goals = await db.customGoals.orderBy('createdAt').reverse().toArray();
    set({ customGoals: goals });
  },

  addCustomGoal: async (name: string) => {
    const id = uuid();
    const now = new Date();
    const goal: CustomGoal = { id, name, isActive: true, createdAt: now };
    await db.customGoals.add(goal);
    set((s) => ({ customGoals: [goal, ...s.customGoals] }));
  },

  deleteCustomGoal: async (id: string) => {
    await db.customGoals.delete(id);
    set((s) => ({ customGoals: s.customGoals.filter((g) => g.id !== id) }));
  },

  toggleCustomGoal: async (id: string) => {
    const goal = get().customGoals.find((g) => g.id === id);
    if (!goal) return;
    const updated = { ...goal, isActive: !goal.isActive };
    await db.customGoals.update(id, { isActive: updated.isActive });
    set((s) => ({
      customGoals: s.customGoals.map((g) => (g.id === id ? updated : g)),
    }));
  },

  // Food Library
  foodLibrary: [],

  loadFoodLibrary: async () => {
    const items = await db.foodLibrary.orderBy('lastUsedAt').reverse().toArray();
    set({ foodLibrary: items });
  },

  addFoodLibraryItem: async (name: string, mealType: MealType, weight?: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = await db.foodLibrary.where('name').equalsIgnoreCase(trimmed).first();
    const now = new Date();
    if (existing) {
      const updated = {
        ...existing,
        useCount: existing.useCount + 1,
        lastUsedAt: now,
        lastMealType: mealType,
        defaultWeight: weight ?? existing.defaultWeight,
      };
      await db.foodLibrary.update(existing.id, updated);
      set((s) => ({
        foodLibrary: [updated, ...s.foodLibrary.filter((i) => i.id !== existing.id)],
      }));
    } else {
      const id = uuid();
      const item: FoodLibraryItem = {
        id, name: trimmed, defaultWeight: weight, lastMealType: mealType,
        useCount: 1, lastUsedAt: now, createdAt: now,
      };
      await db.foodLibrary.add(item);
      set((s) => ({ foodLibrary: [item, ...s.foodLibrary] }));
    }
  },

  deleteFoodLibraryItem: async (id: string) => {
    await db.foodLibrary.delete(id);
    set((s) => ({ foodLibrary: s.foodLibrary.filter((i) => i.id !== id) }));
  },

  seedFoodLibraryFromEntries: async () => {
    const existingCount = await db.foodLibrary.count();
    if (existingCount > 0) return; // Already seeded
    const entries = await db.foodEntries.toArray();
    // Extract unique descriptions, keep latest weight per description
    const map = new Map<string, { weight?: number; mealType: MealType; lastUsed: Date }>();
    for (const e of entries) {
      const key = e.description.trim().toLowerCase();
      const prev = map.get(key);
      if (!prev || e.createdAt > prev.lastUsed) {
        map.set(key, { weight: e.weight ?? undefined, mealType: e.mealType, lastUsed: e.createdAt });
      }
    }
    const now = new Date();
    const items: FoodLibraryItem[] = [];
    for (const [key, val] of map) {
      // Use original casing from entries
      const originalName = entries.find((e) => e.description.trim().toLowerCase() === key)?.description.trim() ?? key;
      items.push({
        id: uuid(), name: originalName, defaultWeight: val.weight,
        lastMealType: val.mealType, useCount: 1, lastUsedAt: val.lastUsed, createdAt: now,
      });
    }
    if (items.length > 0) {
      await db.foodLibrary.bulkAdd(items);
      set((s) => ({ foodLibrary: [...items, ...s.foodLibrary] }));
    }
  },

  // Diary entries
  diaryEntries: [],

  loadDiaryEntries: async () => {
    const entries = await db.diaryEntries.orderBy('createdAt').reverse().toArray();
    set({ diaryEntries: entries });
  },

  addDiaryEntry: async (entry) => {
    const newEntry: DiaryEntry = { ...entry, id: uuid(), createdAt: new Date() };
    await db.diaryEntries.add(newEntry);
    set((s) => ({ diaryEntries: [newEntry, ...s.diaryEntries] }));
  },

  updateDiaryEntry: async (id, updates) => {
    await db.diaryEntries.update(id, updates);
    set((s) => ({
      diaryEntries: s.diaryEntries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  },

  deleteDiaryEntry: async (id) => {
    await db.diaryEntries.delete(id);
    set((s) => ({ diaryEntries: s.diaryEntries.filter((e) => e.id !== id) }));
  },

  // Water tracking
  waterLog: null,
  waterGlassMl: 250,

  loadWaterLog: async (date: string) => {
    const logs = await db.waterLogs.where('date').equals(date).toArray();
    if (logs.length > 0) {
      set({ waterLog: logs[0], waterGlassMl: logs[0].glassMl });
    } else {
      set({ waterLog: null });
    }
  },

  setWaterGlassMl: (ml: number) => {
    set({ waterGlassMl: ml });
  },

  addWaterGlass: async () => {
    const { waterLog, waterGlassMl } = get();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    if (waterLog && waterLog.date === today) {
      const updated = { ...waterLog, glasses: waterLog.glasses + 1, glassMl: waterGlassMl, updatedAt: now };
      await db.waterLogs.put(updated);
      set({ waterLog: updated });
    } else {
      const newLog: WaterLog = { id: uuid(), date: today, glasses: 1, glassMl: waterGlassMl, updatedAt: now };
      await db.waterLogs.add(newLog);
      set({ waterLog: newLog });
    }
  },

  removeWaterGlass: async () => {
    const { waterLog, waterGlassMl } = get();
    if (!waterLog || waterLog.glasses <= 0) return;
    const today = new Date().toISOString().split('T')[0];
    if (waterLog.date !== today) return;
    const updated = { ...waterLog, glasses: Math.max(0, waterLog.glasses - 1), glassMl: waterGlassMl, updatedAt: new Date() };
    if (updated.glasses === 0) {
      await db.waterLogs.delete(waterLog.id!);
      set({ waterLog: null });
    } else {
      await db.waterLogs.put(updated);
      set({ waterLog: updated });
    }
  },

  // Sleep tracking
  sleepLog: null,

  loadSleepLog: async (date: string) => {
    const logs = await db.sleepLogs.where('date').equals(date).toArray();
    if (logs.length > 0) {
      set({ sleepLog: logs[0] });
    } else {
      set({ sleepLog: null });
    }
  },

  saveSleepPeriods: async (date: string, periods: SleepPeriod[]) => {
    const { sleepLog } = get();
    const now = new Date();
    if (sleepLog && sleepLog.date === date) {
      const updated = { ...sleepLog, periods, updatedAt: now };
      await db.sleepLogs.put(updated);
      set({ sleepLog: updated });
    } else {
      const newLog: SleepLog = { id: uuid(), date, periods, updatedAt: now };
      await db.sleepLogs.add(newLog);
      set({ sleepLog: newLog });
    }
  },

  addSleepPeriod: async (date: string, period: SleepPeriod) => {
    const { sleepLog } = get();
    const periods = sleepLog?.date === date ? [...sleepLog.periods, period] : [period];
    await get().saveSleepPeriods(date, periods);
  },

  removeSleepPeriod: async (date: string, index: number) => {
    const { sleepLog } = get();
    if (!sleepLog || sleepLog.date !== date) return;
    const periods = sleepLog.periods.filter((_, i) => i !== index);
    if (periods.length === 0) {
      await db.sleepLogs.delete(sleepLog.id!);
      set({ sleepLog: null });
    } else {
      await get().saveSleepPeriods(date, periods);
    }
  },

  buildSleepSummary: () => {
    return buildSleepSummaryFromLog(get().sleepLog, 'today');
  },

  // Food Products
  foodProducts: [],

  loadFoodProducts: async () => {
    const products = await db.foodProducts.orderBy('name').toArray();
    set({ foodProducts: products });
  },

  addFoodProduct: async (name) => {
    const product: FoodProduct = { id: uuid(), name: name.trim(), createdAt: new Date() };
    await db.foodProducts.add(product);
    set((s) => ({ foodProducts: [...s.foodProducts, product].sort((a, b) => a.name.localeCompare(b.name)) }));
  },

  updateFoodProduct: async (id, updates) => {
    await db.foodProducts.update(id, updates);
    set((s) => ({
      foodProducts: s.foodProducts.map((p) => (p.id === id ? { ...p, ...updates } : p)).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  deleteFoodProduct: async (id) => {
    await db.foodProducts.delete(id);
    set((s) => ({ foodProducts: s.foodProducts.filter((p) => p.id !== id) }));
  },

  // Dishes
  dishes: [],

  loadDishes: async () => {
    const dishes = await db.dishes.orderBy('name').toArray();
    set({ dishes });
  },

  addDish: async (name, ingredients) => {
    const dish: Dish = { id: uuid(), name: name.trim(), ingredients, createdAt: new Date() };
    await db.dishes.add(dish);
    set((s) => ({ dishes: [...s.dishes, dish].sort((a, b) => a.name.localeCompare(b.name)) }));
  },

  updateDish: async (id, updates) => {
    await db.dishes.update(id, updates);
    set((s) => ({
      dishes: s.dishes.map((d) => (d.id === id ? { ...d, ...updates } : d)).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  deleteDish: async (id) => {
    await db.dishes.delete(id);
    set((s) => ({ dishes: s.dishes.filter((d) => d.id !== id) }));
  },

  seedFoodCatalog: async () => {
    // Only seed if both tables are empty (first launch)
    const existingProducts = await db.foodProducts.count();
    if (existingProducts > 0) return;

    const now = new Date();
    const products: FoodProduct[] = SEED_PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: now,
    }));
    const dishes: Dish[] = SEED_DISHES.map((d) => ({
      id: d.id,
      name: d.name,
      ingredients: d.ingredients,
      createdAt: now,
    }));

    await db.foodProducts.bulkAdd(products);
    await db.dishes.bulkAdd(dishes);

    set({
      foodProducts: products.sort((a, b) => a.name.localeCompare(b.name)),
      dishes: dishes.sort((a, b) => a.name.localeCompare(b.name)),
    });
  },

  // Expand food entry items to text description for LLM prompts
  expandEntryItemsToText: (items: FoodEntryItem[]): string => {
    const { foodProducts, dishes } = get();
    const parts: string[] = [];
    for (const item of items) {
      if (item.dishId) {
        const dish = dishes.find((d) => d.id === item.dishId);
        if (dish && dish.ingredients.length > 0) {
          const totalDishWeight = dish.ingredients.reduce((s, i) => s + i.weightGrams, 0);
          const expanded = dish.ingredients.map((ing) => {
            const prod = foodProducts.find((p) => p.id === ing.productId);
            const scaled = totalDishWeight > 0 ? Math.round((ing.weightGrams / totalDishWeight) * item.weightGrams) : ing.weightGrams;
            return `${prod?.name ?? 'неизвестно'} ${scaled}г`;
          }).join(', ');
          parts.push(`${item.name} ${item.weightGrams}г (${expanded})`);
        } else {
          parts.push(`${item.name} ${item.weightGrams}г`);
        }
      } else {
        parts.push(`${item.name} ${item.weightGrams}г`);
      }
    }
    return parts.join(', ');
  },

  // Food entries
  foodEntries: [],

  loadFoodEntries: async () => {
    const entries = await db.foodEntries.orderBy('createdAt').reverse().toArray();
    set({ foodEntries: entries });
  },

  addFoodEntry: async (entry) => {
    const id = uuid();
    const now = new Date();
    const full: FoodEntry = { ...entry, id, createdAt: now };
    await db.foodEntries.add(full);
    set((s) => ({ foodEntries: [full, ...s.foodEntries] }));
    // Auto-update food library
    get().addFoodLibraryItem(entry.description, entry.mealType, entry.weight);
  },

  deleteFoodEntry: async (id) => {
    await db.foodEntries.delete(id);
    set((s) => ({ foodEntries: s.foodEntries.filter((e) => e.id !== id) }));
  },

  updateFoodEntry: async (id, updates) => {
    await db.foodEntries.update(id, updates);
    set((s) => ({
      foodEntries: s.foodEntries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
    // Update library if description changed
    if (updates.description) {
      get().addFoodLibraryItem(updates.description, updates.mealType ?? 'lunch', updates.weight);
    }
  },

  getEntriesForDate: (date: string) => {
    return get().foodEntries.filter((e) => e.date === date);
  },

  // Chat
  chatSessions: [],
  currentChatId: null,
  chatMessages: [],
  isSending: false,
  streamingContent: '',
  streamingAnalysis: '',
  lastAnalysisDebug: null,
  _abortController: null as AbortController | null,

  stopStreaming: () => {
    const ctrl = get()._abortController;
    if (ctrl) ctrl.abort();
    set({ _abortController: null, isSending: false, streamingContent: '' });
  },

  loadChatSessions: async () => {
    const sessions = await db.chatSessions.orderBy('lastActivity').reverse().toArray();
    set({ chatSessions: sessions });
  },

  createChatSession: async () => {
    const id = uuid();
    const now = new Date();
    const session: ChatSession = { id, title: 'Новый разговор', createdAt: now, lastActivity: now };
    await db.chatSessions.add(session);
    set((s) => ({ chatSessions: [session, ...s.chatSessions], currentChatId: id, chatMessages: [] }));
    return id;
  },

  selectChatSession: async (id) => {
    set({ currentChatId: id });
    const messages = await db.chatMessages.where('sessionId').equals(id).sortBy('createdAt');
    set({ chatMessages: messages });
  },

  deleteChatSession: async (id) => {
    await db.chatMessages.where('sessionId').equals(id).delete();
    await db.chatSessions.delete(id);
    set((s) => ({
      chatSessions: s.chatSessions.filter((cs) => cs.id !== id),
      currentChatId: s.currentChatId === id ? null : s.currentChatId,
      chatMessages: s.currentChatId === id ? [] : s.chatMessages,
    }));
  },

  renameChatSession: async (id: string, title: string) => {
    await db.chatSessions.update(id, { title, updatedAt: new Date() });
 set((s) => ({
      chatSessions: s.chatSessions.map((cs) => cs.id === id ? { ...cs, title, updatedAt: new Date() } : cs),
    }));
  },

  updateChatMessage: async (id: string, content: string) => {
    await db.chatMessages.update(id, { content });
    set((s) => ({
      chatMessages: s.chatMessages.map((m) => m.id === id ? { ...m, content } : m),
    }));
  },

  resendFromMessage: async (messageId: string, newContent: string, nutritionPeriod: string = 'today') => {
    const { currentChatId, chatMessages, profile, foodEntries, customGoals, diaryEntries } = get();
    const provider = get().getActiveProvider();

    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }
    if (!currentChatId) return;

    // Find index of the message being edited
    const msgIndex = chatMessages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const abort = new AbortController();
    set({ isSending: true, streamingContent: '', _abortController: abort });

    try {
      // Update the edited user message in DB and state
      await db.chatMessages.update(messageId, { content: newContent });

      // Delete all messages after this one (assistant response + any following exchange)
      const messagesToDelete = chatMessages.slice(msgIndex + 1);
      for (const m of messagesToDelete) {
        if (m.id) await db.chatMessages.delete(m.id);
      }

      // Rebuild messages list: keep up to and including edited message, update in state immediately
      const keptMessages = chatMessages.slice(0, msgIndex + 1).map((m) =>
        m.id === messageId ? { ...m, content: newContent } : m
      );
      set({ chatMessages: keptMessages });

      // Build history from kept messages (exclude system)
      const history: LLMMessage[] = keptMessages
        .filter((m) => m.role !== 'system')
        .slice(-20)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Build system prompt
      const contextType = NutritionPrompts.detectContextFromMessage(newContent);
      const activeGoalNames = customGoals.filter((g) => g.isActive).map((g) => g.name);
      let systemPrompt = NutritionPrompts.getContextualPrompt(contextType, profile, activeGoalNames);
      const period = nutritionPeriod as 'today' | 'week' | 'month';
      const nutritionSummary = buildNutritionSummary(foodEntries, period, get().expandEntryItemsToText);
      const diarySummary = buildDiarySummary(diaryEntries, period);
      const waterSummary = buildWaterSummary(get().waterLog, period);
      const sleepSummary = buildSleepSummaryFromLog(get().sleepLog, period);
      systemPrompt += nutritionSummary + diarySummary + waterSummary + sleepSummary;

      const llmMessages = buildChatMessages(systemPrompt, history, newContent);

      // Use streaming
      let finalContent = '';
      try {
        await callLLMStream(provider, llmMessages, 0.8, undefined, (text) => {
          if (abort.signal.aborted) return;
          finalContent = text;
          set({ streamingContent: text });
        });
      } catch (streamErr) {
        if (abort.signal.aborted) return;
        // Streaming not supported — fallback to non-streaming
        const response = await callLLM(provider, llmMessages, 0.8);
        finalContent = response.content;
        set({ streamingContent: finalContent });
      }

      // Save assistant message
      const assistantMsg: ChatMessage = {
        id: uuid(),
        sessionId: currentChatId,
        role: 'assistant',
        content: finalContent,
        createdAt: new Date(),
      };
      await db.chatMessages.add(assistantMsg);

      // Update session
      await db.chatSessions.update(currentChatId, {
        lastActivity: new Date(),
      });

      set((s) => ({
        chatMessages: [...keptMessages, assistantMsg],
        isSending: false,
        streamingContent: '',
        _abortController: null,
      }));

      // Note: keptMessages was already set in state above, so this appends assistantMsg

      get().loadChatSessions();
    } catch (error) {
      set({ isSending: false, streamingContent: '', _abortController: null });
      throw error;
    }
  },

  loadChatMessages: async () => {
    const { currentChatId } = get();
    if (!currentChatId) return;
    const messages = await db.chatMessages.where('sessionId').equals(currentChatId).sortBy('createdAt');
    set({ chatMessages: messages });
  },

  sendChatMessage: async (content: string, nutritionPeriod: string = 'today'): Promise<string> => {
    const { currentChatId, chatMessages, profile, foodEntries, customGoals, diaryEntries } = get();
    const provider = get().getActiveProvider();

    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    let sessionId = currentChatId;
    if (!sessionId) {
      sessionId = await get().createChatSession();
    }

    const abort = new AbortController();
    set({ isSending: true, streamingContent: '', _abortController: abort });

    try {
      // Save user message to DB and immediately show in chat
      const userMsg: ChatMessage = {
        id: uuid(),
        sessionId,
        role: 'user',
        content,
        createdAt: new Date(),
      };
      await db.chatMessages.add(userMsg);
      set((s) => ({ chatMessages: [...s.chatMessages, userMsg] }));

      // Detect context and build system prompt
      const contextType = NutritionPrompts.detectContextFromMessage(content);
      const activeGoalNames = customGoals.filter((g) => g.isActive).map((g) => g.name);
      let systemPrompt = NutritionPrompts.getContextualPrompt(contextType, profile, activeGoalNames);

      // Add nutrition context based on selected period
      const period = nutritionPeriod as 'today' | 'week' | 'month';
      const nutritionSummary = buildNutritionSummary(foodEntries, period, get().expandEntryItemsToText);
      const diarySummary = buildDiarySummary(diaryEntries, period);
      const waterSummary = buildWaterSummary(get().waterLog, period);
      const sleepSummary = buildSleepSummaryFromLog(get().sleepLog, period);
      systemPrompt += nutritionSummary + diarySummary + waterSummary + sleepSummary;

      // Build history for LLM (limit to last 20 messages)
      const history: LLMMessage[] = chatMessages
        .slice(-20)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const llmMessages = buildChatMessages(systemPrompt, history, content);

      // Use streaming
      let finalContent = '';
      try {
        await callLLMStream(provider, llmMessages, 0.8, undefined, (text) => {
          if (abort.signal.aborted) return;
          finalContent = text;
          set({ streamingContent: text });
        });
      } catch (streamErr) {
        if (abort.signal.aborted) return '';
        // Streaming not supported — fallback to non-streaming
        const response = await callLLM(provider, llmMessages, 0.8);
        finalContent = response.content;
        set({ streamingContent: finalContent });
      }

      // Save assistant message
      const assistantMsg: ChatMessage = {
        id: uuid(),
        sessionId,
        role: 'assistant',
        content: finalContent,
        createdAt: new Date(),
      };
      await db.chatMessages.add(assistantMsg);

      // Update session
      await db.chatSessions.update(sessionId, {
        lastActivity: new Date(),
        title: content.slice(0, 50),
      });

      set((s) => ({
        chatMessages: [...s.chatMessages, assistantMsg],
        isSending: false,
        streamingContent: '',
        _abortController: null,
      }));

      // Reload sessions to update title
      get().loadChatSessions();

      return finalContent;
    } catch (error) {
      set({ isSending: false, streamingContent: '', _abortController: null });
      throw error;
    }
  },

  analyzeFoodStream: async (description?: string, imageBase64?: string, weight?: number, mealType?: string): Promise<string> => {
    const { profile, customGoals } = get();
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    set({ isSending: true, streamingAnalysis: '', lastAnalysisDebug: null });

    try {
      const profileInfo = buildProfileInfoForAnalysis(profile, customGoals);
      const systemPrompt = NutritionPrompts.getFoodAnalysisPrompt(mealType, profileInfo);

      // Build user message content — with optional image inline
      let userContent: string | ContentPart[];
      const textParts: string[] = [];
      if (imageBase64) textParts.push('На фотографии изображена еда.');
      if (description) textParts.push(description);
      if (weight) textParts.push(`Вес порции: ${weight}г.`);
      const userText = `Проанализируй эту еду: ${textParts.join(' ')}`;

      if (imageBase64) {
        userContent = [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } },
        ];
      } else {
        userContent = userText;
      }

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      const debugPrompt = typeof userContent === 'string'
        ? userContent
        : `${(userContent as ContentPart[]).map(p => p.type === 'text' ? (p as { text: string }).text : '[изображение]').join(' ')}`;

      let finalContent = '';
      try {
        await callLLMStream(provider, messages, 0.6, undefined, (text) => {
          finalContent = text;
          set({ streamingAnalysis: text });
        });
      } catch {
        // Streaming not supported — fallback to non-streaming
        const response = await callLLM(provider, messages, 0.6);
        finalContent = response.content;
        set({ streamingAnalysis: finalContent });
      }

      set({
        isSending: false,
        streamingAnalysis: '',
        lastAnalysisDebug: {
          prompt: `--- Системный промпт ---\n${systemPrompt}\n\n--- Запрос пользователя ---\n${debugPrompt}`,
          response: finalContent,
        },
      });
      return finalContent;
    } catch (error) {
      set({ isSending: false, streamingAnalysis: '' });
      throw error;
    }
  },

  analyzeFoodText: async (description: string, weight?: number, mealType?: string): Promise<string> => {
    const { profile, customGoals } = get();
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    set({ isSending: true, lastAnalysisDebug: null });

    try {
      const profileInfo = buildProfileInfoForAnalysis(profile, customGoals);
      const systemPrompt = NutritionPrompts.getFoodAnalysisPrompt(mealType, profileInfo);
      const userContent = weight
        ? `Проанализируй эту еду: ${description}. Вес порции: ${weight}г.`
        : `Проанализируй эту еду: ${description}`;
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];
      const response = await callLLM(provider, messages, 0.6);

      set({
        isSending: false,
        lastAnalysisDebug: {
          prompt: `--- Системный промпт ---\n${systemPrompt}\n\n--- Запрос пользователя ---\n${userContent}`,
          response: response.content,
        },
      });
      return response.content;
    } catch (error) {
      set({ isSending: false });
      throw error;
    }
  },

  analyzeFoodTextStream: async (description: string, weight?: number, mealType?: string): Promise<string> => {
    const { profile, customGoals } = get();
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    set({ isSending: true, streamingAnalysis: '', lastAnalysisDebug: null });

    try {
      const profileInfo = buildProfileInfoForAnalysis(profile, customGoals);
      const systemPrompt = NutritionPrompts.getFoodAnalysisPrompt(mealType, profileInfo);
      const userContent = weight
        ? `Проанализируй эту еду: ${description}. Вес порции: ${weight}г.`
        : `Проанализируй эту еду: ${description}`;
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      let finalContent = '';
      try {
        await callLLMStream(provider, messages, 0.6, undefined, (text) => {
          finalContent = text;
          set({ streamingAnalysis: text });
        });
      } catch {
        // Streaming not supported — fallback to non-streaming
        const response = await callLLM(provider, messages, 0.6);
        finalContent = response.content;
        set({ streamingAnalysis: finalContent });
      }

      set({
        isSending: false,
        streamingAnalysis: '',
        lastAnalysisDebug: {
          prompt: `--- Системный промпт ---\n${systemPrompt}\n\n--- Запрос пользователя ---\n${userContent}`,
          response: finalContent,
        },
      });
      return finalContent;
    } catch (error) {
      set({ isSending: false, streamingAnalysis: '' });
      throw error;
    }
  },
}));
