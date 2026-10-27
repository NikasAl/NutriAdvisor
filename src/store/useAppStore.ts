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
  Exercise,
  ExerciseCategory,
  WorkoutEntry,
  WorkoutSet,
  MedTestParam,
  MedTestMeasure,
  ProductAnalysis,
  ProductVerdict,
} from '@/lib/types';
import { DEFAULT_MED_TEST_PARAMS, computeTrend } from '@/lib/types';
import { NutritionPrompts } from '@/lib/prompts';
import { callLLM, callLLMStream, buildChatMessages, buildUserContentWithImages } from '@/lib/llm-client';
import type { LLMMessage, ContentPart } from '@/lib/llm-client';
import { SEED_PRODUCTS, SEED_DISHES, SEED_EXERCISES } from '@/data/seed-data';

const DEFAULT_PROVIDER: Omit<LLMProvider, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'NuAdvi Proxy',
  type: 'nuadvi',
  baseUrl: 'https://kreagenium.ru/nuadvi/v1',
  apiKey: '',
  model: 'gemma-4',
  isActive: true,
  supportsVision: true,
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
  waterTargetMl: 2000,
  sleepTargetHours: 8,
};

interface AppState {
  // Navigation
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // TTS (text-to-speech)
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
  /** Selected TTS engine name (null = system default). Android native only. */
  ttsEngineName: string | null;
  setTtsEngineName: (name: string | null) => void;
  /** Selected TTS voice name (null = engine default). */
  ttsVoiceName: string | null;
  setTtsVoiceName: (name: string | null) => void;

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
  resendFromMessage: (messageId: string, newContent: string, dateFrom: string, dateTo: string) => Promise<void>;
  loadChatMessages: () => Promise<void>;

  // Exercises (like foodProducts)
  exercises: Exercise[];
  loadExercises: () => Promise<void>;
  addExercise: (name: string, category: ExerciseCategory) => Promise<void>;
  updateExercise: (id: string, updates: Partial<Exercise>) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
  seedExerciseCatalog: () => Promise<void>;

  // Workout entries (like foodEntries)
  workoutEntries: WorkoutEntry[];
  loadWorkoutEntries: () => Promise<void>;
  addWorkoutEntry: (entry: Omit<WorkoutEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateWorkoutEntry: (id: string, updates: Partial<WorkoutEntry>) => Promise<void>;
  deleteWorkoutEntry: (id: string) => Promise<void>;

  // Workout draft (single draft, auto-saved)
  workoutDraft: WorkoutEntry | null;
  loadWorkoutDraft: () => Promise<void>;
  saveWorkoutDraft: (draft: Omit<WorkoutEntry, 'id' | 'createdAt'>) => Promise<void>;
  clearWorkoutDraft: () => Promise<void>;

  // Medical test parameters & measurements
  medTestParams: MedTestParam[];
  medTestMeasures: MedTestMeasure[];  loadMedTestParams: () => Promise<void>;
  addMedTestParam: (name: string, unit: string, refLow?: number, refHigh?: number) => Promise<void>;
  deleteMedTestParam: (id: string) => Promise<void>;
  loadMedTestMeasures: () => Promise<void>;
  addMedTestMeasure: (paramId: string, date: string, value: number, note?: string) => Promise<void>;
  updateMedTestMeasure: (id: string, updates: Partial<MedTestMeasure>) => Promise<void>;
  deleteMedTestMeasure: (id: string) => Promise<void>;
  buildMedTestSummary: () => string;

  // Product analyses ("стоит ли это есть?" — stored single-turn LLM verdicts)
  productAnalyses: ProductAnalysis[];
  loadProductAnalyses: () => Promise<void>;
  addProductAnalysis: (a: Omit<ProductAnalysis, 'id' | 'createdAt'>) => Promise<void>;
  deleteProductAnalysis: (id: string) => Promise<void>;
  /** Run a single-turn LLM product analysis, parse the verdict and store it (newest first). */
  runProductAnalysis: (input: {
    productName: string;
    ingredients?: string;
    nutrientsPer100g?: string;
    sourceProductId?: string;
  }) => Promise<ProductAnalysis>;

  // Streaming abort controller ref
  _abortController: AbortController | null;

  // LLM interaction
  sendChatMessage: (content: string, dateFrom: string, dateTo: string, images?: string[]) => Promise<string>;
  computeContextSize: (dateFrom: string, dateTo: string) => number;
  analyzeFoodStream: (description?: string, imageBase64?: string, weight?: number, mealType?: string) => Promise<string>;
  analyzeFoodText: (description: string, weight?: number, mealType?: string) => Promise<string>;
  analyzeFoodTextStream: (description: string, weight?: number, mealType?: string) => Promise<string>;
  analyzeWorkoutStream: (description: string) => Promise<string>;
  scanMedTestFromPhoto: (imageBase64: string) => Promise<string>;
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

/** Build a sleep summary string for a given date range */
function buildSleepSummaryFromLog(sleepLog: SleepLog | null, dateFrom: string, dateTo: string): string {
  if (!sleepLog) return '';
  // Sleep log is only for today in current data model; show only if today is in range
  const today = new Date().toISOString().split('T')[0];
  if (today < dateFrom || today > dateTo) return '';
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

/** Build a water summary string for a given date range */
function buildWaterSummary(waterLog: WaterLog | null, dateFrom: string, dateTo: string): string {
  if (!waterLog) return '';
  // Water log is only for today in current data model; show only if today is in range
  const today = new Date().toISOString().split('T')[0];
  if (today < dateFrom || today > dateTo) return '';
  const totalMl = waterLog.glasses * waterLog.glassMl;
  return `\n--- Вода за сегодня ---\nВыпито: ${waterLog.glasses} стаканов (${totalMl} мл, по ${waterLog.glassMl} мл/стакан)\n--- Конец данных о воде ---`;
}

/** Build a diary summary string from diary entries for a given date range */
function buildDiarySummary(
  diaryEntries: DiaryEntry[],
  dateFrom: string,
  dateTo: string
): string {
  const filtered = diaryEntries.filter((e) => e.date >= dateFrom && e.date <= dateTo);

  if (filtered.length === 0) {
    return `\n--- Записи дневника за ${dateFrom}–${dateTo} ---\nНет записей.\n--- Конец записей дневника ---`;
  }

  let summary = `\n--- Записи дневника за ${dateFrom}–${dateTo} ---\n`;

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

/** Build a nutrition summary string from food entries for a given date range */
function buildNutritionSummary(
  foodEntries: FoodEntry[],
  dateFrom: string,
  dateTo: string,
  expandItems?: (items: FoodEntryItem[]) => string
): string {
  const today = new Date().toISOString().split('T')[0];

  const filtered = foodEntries.filter((e) => e.date >= dateFrom && e.date <= dateTo);

  if (filtered.length === 0) {
    return `\n--- Данные о питании за ${dateFrom}–${dateTo} ---\nНет записей о приёмах пищи за указанный период.\n--- Конец данных о питании ---`;
  }

  const isSingleDay = dateFrom === dateTo;
  const periodLabel = isSingleDay ? (dateFrom === today ? 'сегодня' : dateFrom) : `${dateFrom}–${dateTo}`;

  const desc = (e: FoodEntry) =>
    e.items && expandItems ? expandItems(e.items) : e.description;

  let summary = `\n--- Данные о питании ${periodLabel} ---\n`;

  if (isSingleDay) {
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
    summary += `\nИтого за ${periodLabel}: ${totalCal} ккал | Б: ${totalProt.toFixed(0)}г | Ж: ${totalFat.toFixed(0)}г | У: ${totalCarbs.toFixed(0)}г\n`;
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

/** Build a workout summary string from workout entries for a given date range */
function buildWorkoutSummary(
  workoutEntries: WorkoutEntry[],
  dateFrom: string,
  dateTo: string
): string {
  const filtered = workoutEntries.filter((e) => e.date >= dateFrom && e.date <= dateTo);

  if (filtered.length === 0) {
    return `\n--- Тренировки за ${dateFrom}–${dateTo} ---\nНет тренировок.\n--- Конец данных о тренировках ---`;
  }

  let summary = `\n--- Тренировки за ${dateFrom}–${dateTo} ---\n`;
  summary += `Количество тренировок: ${filtered.length}\n\n`;

  for (const entry of filtered) {
    const name = entry.name || 'Тренировка';
    summary += `• [${entry.date}] ${name}\n`;
    for (const set of entry.sets) {
      let line = `  - ${set.exerciseName}`;
      if (set.weight) line += ` ${set.weight}кг`;
      if (set.reps) line += ` × ${set.reps} повторов`;
      if (set.sets) line += ` × ${set.sets} подхода`;
      if (set.duration) line += ` ${set.duration}мин`;
      if (set.distance) line += ` ${set.distance}км`;
      summary += line + '\n';
    }
    if (entry.estimatedDuration) summary += `  Длительность: ~${entry.estimatedDuration} мин\n`;
    if (entry.estimatedCaloriesBurned) summary += `  Сожжено: ~${entry.estimatedCaloriesBurned} ккал\n`;
  }

  const totalCal = filtered.reduce((s, e) => s + (e.estimatedCaloriesBurned ?? 0), 0);
  const totalDur = filtered.reduce((s, e) => s + (e.estimatedDuration ?? 0), 0);
  if (totalCal > 0 || totalDur > 0) {
    summary += `\nИтого: ${totalDur} мин, ${totalCal} ккал\n`;
  }

  summary += '--- Конец данных о тренировках ---';
  return summary;
}

/** Build a medical test summary with time series and trend for LLM context */
function buildMedTestSummary(
  medTestParams: MedTestParam[],
  medTestMeasures: MedTestMeasure[]
): string {
  if (medTestParams.length === 0 || medTestMeasures.length === 0) return '';

  let summary = '\n--- Медицинские показатели (анализы) ---\n';

  for (const param of medTestParams) {
    const measures = medTestMeasures
      .filter((m) => m.paramId === param.id)
      .sort((a, b) => a.date.localeCompare(b.date)); // oldest → newest

    if (measures.length === 0) continue;

    const values = measures.map((m) => m.value);
    const trend = computeTrend(values);
    const trendLabel = trend === 'up' ? '↑ растёт' : trend === 'down' ? '↓ снижается' : trend === 'stable' ? '→ стабильно' : '? неизвестно';

    const refRange = (param.refLow != null && param.refHigh != null)
      ? ` (реф. ${param.refLow}–${param.refHigh} ${param.unit})`
      : '';

    summary += `${param.name}${refRange}:\n`;

    // Show all measurements (capped at last 10 for brevity)
    const showMeasures = measures.slice(-10);
    for (const m of showMeasures) {
      const isOutOfRange = (param.refLow != null && m.value < param.refLow) || (param.refHigh != null && m.value > param.refHigh);
      const flag = isOutOfRange ? ' ⚠' : '';
      const noteStr = m.note ? ` (${m.note})` : '';
      summary += `  ${m.date}: ${m.value} ${param.unit}${noteStr}${flag}\n`;
    }

    summary += `  Тренд: ${trendLabel}, последнее: ${values[values.length - 1]} ${param.unit}\n\n`;
  }

  summary += '--- Конец медицинских показателей ---';
  return summary;
}

/**
 * Parse the structured verdict from a product analysis LLM response.
 * Expected first line: "ВЕРДИКТ: ПОДХОДИТ | С ОСТОРОЖНОСТЬЮ | НЕ РЕКОМЕНДУЮ",
 * followed by "КРАТКО: ..." summary. Falls back to heuristics and the first
 * meaningful line when the model deviates from the format.
 */
function parseProductVerdict(text: string): { verdict: ProductVerdict; summary: string } {
  let verdict: ProductVerdict = 'caution';
  // Tolerant to markdown decorations: "**ВЕРДИКТ:** ПОДХОДИТ" etc.
  const m = text.match(/ВЕРДИКТ\D{0,20}?(НЕ\s*РЕКОМЕНДУЮ|С\s*ОСТОРОЖНОСТЬЮ|ПОДХОДИТ)/i);
  if (m) {
    const v = m[1].toUpperCase().replace(/\s+/g, ' ');
    if (v.startsWith('НЕ')) verdict = 'not_recommended';
    else if (v.startsWith('ПОДХОДИТ')) verdict = 'suitable';
    else verdict = 'caution';
  } else {
    const up = text.toUpperCase();
    if (up.includes('НЕ РЕКОМЕНДУЮ')) verdict = 'not_recommended';
    else if (up.includes('ПОДХОДИТ')) verdict = 'suitable';
  }

  let summary = '';
  const sm = text.match(/КРАТКО\s*:?\s*([\s\S]+?)(?=\n\s*\*\*|\n\s*-{3,}|$)/i);
  if (sm && sm[1].trim()) {
    summary = sm[1].trim();
  } else {
    // Fallback: first non-empty line that is not the verdict line / header
    for (const line of text.split('\n')) {
      const l = line.trim();
      if (!l) continue;
      if (/^ВЕРДИКТ/i.test(l) || /^#{1,3}\s/.test(l)) continue;
      if (/^\*\*.*\*\*:?$/.test(l)) continue; // section header like **Риски:**
      summary = l.replace(/^КРАТКО\s*:?\s*/i, '');
      break;
    }
  }
  summary = summary.replace(/\*+/g, '').replace(/\s+/g, ' ').trim().slice(0, 250);
  return { verdict, summary };
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
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Update theme-color meta for Android status/nav bars
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#171717' : '#059669');
    }
  },

  // TTS — read from localStorage, default false (off)
  ttsEnabled: typeof window !== 'undefined' ? localStorage.getItem('nutri-tts-enabled') === 'true' : false,
  setTtsEnabled: (enabled) => {
    set({ ttsEnabled: enabled });
    localStorage.setItem('nutri-tts-enabled', String(enabled));
  },
  // TTS engine — persisted to localStorage, null = system default
  ttsEngineName: typeof window !== 'undefined' ? localStorage.getItem('nutri-tts-engine') || null : null,
  setTtsEngineName: (name) => {
    set({ ttsEngineName: name });
    if (name) {
      localStorage.setItem('nutri-tts-engine', name);
    } else {
      localStorage.removeItem('nutri-tts-engine');
    }
  },
  // TTS voice — persisted to localStorage, null = engine default
  ttsVoiceName: typeof window !== 'undefined' ? localStorage.getItem('nutri-tts-voice') || null : null,
  setTtsVoiceName: (name) => {
    set({ ttsVoiceName: name });
    if (name) {
      localStorage.setItem('nutri-tts-voice', name);
    } else {
      localStorage.removeItem('nutri-tts-voice');
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
    const today = new Date().toISOString().split('T')[0];
    return buildSleepSummaryFromLog(get().sleepLog, today, today);
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

  // Exercises
  exercises: [],

  loadExercises: async () => {
    const exercises = await db.exercises.orderBy('name').toArray();
    set({ exercises });
  },

  addExercise: async (name, category) => {
    const exercise: Exercise = { id: uuid(), name: name.trim(), category, createdAt: new Date() };
    await db.exercises.add(exercise);
    set((s) => ({ exercises: [...s.exercises, exercise].sort((a, b) => a.name.localeCompare(b.name)) }));
  },

  updateExercise: async (id, updates) => {
    await db.exercises.update(id, updates);
    set((s) => ({
      exercises: s.exercises.map((e) => (e.id === id ? { ...e, ...updates } : e)).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  deleteExercise: async (id) => {
    await db.exercises.delete(id);
    set((s) => ({ exercises: s.exercises.filter((e) => e.id !== id) }));
  },

  seedExerciseCatalog: async () => {
    const existingCount = await db.exercises.count();
    if (existingCount > 0) return;

    const now = new Date();
    const exercises: Exercise[] = SEED_EXERCISES.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      createdAt: now,
    }));

    await db.exercises.bulkAdd(exercises);
    set((s) => ({ exercises: [...s.exercises, ...exercises].sort((a, b) => a.name.localeCompare(b.name)) }));
  },

  // Workout entries
  workoutEntries: [],

  loadWorkoutEntries: async () => {
    const entries = await db.workoutEntries.orderBy('createdAt').reverse().toArray();
    set({ workoutEntries: entries });
  },

  addWorkoutEntry: async (entry) => {
    const id = uuid();
    const now = new Date();
    const full: WorkoutEntry = { ...entry, id, createdAt: now };
    await db.workoutEntries.add(full);
    set((s) => ({ workoutEntries: [full, ...s.workoutEntries] }));
  },

  updateWorkoutEntry: async (id, updates) => {
    await db.workoutEntries.update(id, updates);
    set((s) => ({
      workoutEntries: s.workoutEntries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  },

  deleteWorkoutEntry: async (id) => {
    await db.workoutEntries.delete(id);
    set((s) => ({ workoutEntries: s.workoutEntries.filter((e) => e.id !== id) }));
  },

  // Workout draft
  workoutDraft: null,

  loadWorkoutDraft: async () => {
    const drafts = await db.workoutEntries.filter((e) => e.isDraft === true).toArray();
    // Enforce single draft: if multiple drafts exist, keep only the newest
    if (drafts.length > 1) {
      drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (let i = 1; i < drafts.length; i++) {
        await db.workoutEntries.delete(drafts[i].id!);
      }
      // Remove extras from workoutEntries state as well
      set((s) => ({
        workoutEntries: s.workoutEntries.filter((e) => !e.isDraft || e.id === drafts[0].id),
        workoutDraft: drafts[0],
      }));
    } else {
      set({ workoutDraft: drafts[0] ?? null });
    }
  },

  saveWorkoutDraft: async (draft) => {
    const current = get().workoutDraft;
    const draftData = { ...draft, isDraft: true };
    if (current?.id) {
      // Update existing draft
      await db.workoutEntries.update(current.id, draftData);
      const updated = { ...current, ...draftData };
      set((s) => ({
        workoutDraft: updated,
        workoutEntries: s.workoutEntries.map((e) => (e.id === current.id ? updated : e)),
      }));
    } else {
      // Create new draft (ensure no other drafts exist)
      const existingDrafts = await db.workoutEntries.filter((e) => e.isDraft === true).toArray();
      if (existingDrafts.length > 0) {
        // Clear stale drafts first
        for (const d of existingDrafts) {
          await db.workoutEntries.delete(d.id!);
        }
      }
      const id = uuid();
      const now = new Date();
      const full: WorkoutEntry = { ...draftData, id, createdAt: now };
      await db.workoutEntries.add(full);
      set((s) => ({
        workoutDraft: full,
        workoutEntries: [full, ...s.workoutEntries.filter((e) => !e.isDraft)],
      }));
    }
  },

  clearWorkoutDraft: async () => {
    const draft = get().workoutDraft;
    if (draft?.id) {
      await db.workoutEntries.delete(draft.id);
      set((s) => ({
        workoutDraft: null,
        workoutEntries: s.workoutEntries.filter((e) => e.id !== draft.id),
      }));
    } else {
      set({ workoutDraft: null });
    }
  },

  // Medical test parameters & measurements
  medTestParams: [],
  medTestMeasures: [],

  loadMedTestParams: async () => {
    let params = await db.medTestParams.toArray();
    // Seed default params if DB is empty
    if (params.length === 0) {
      const now = new Date();
      const seeded: MedTestParam[] = DEFAULT_MED_TEST_PARAMS.map((p) => ({
        ...p,
        id: uuid(),
        createdAt: now,
      }));
      await db.medTestParams.bulkAdd(seeded);
      params = seeded;
    }
    set({ medTestParams: params });
  },

  addMedTestParam: async (name, unit, refLow, refHigh) => {
    const param: MedTestParam = {
      id: uuid(),
      name,
      unit: unit || '',
      refLow,
      refHigh,
      isDefault: false,
      createdAt: new Date(),
    };
    await db.medTestParams.add(param);
    set((s) => ({ medTestParams: [...s.medTestParams, param] }));
  },

  deleteMedTestParam: async (id) => {
    // Delete param and all its measurements
    await db.medTestMeasures.where('paramId').equals(id).delete();
    await db.medTestParams.delete(id);
    set((s) => ({
      medTestParams: s.medTestParams.filter((p) => p.id !== id),
      medTestMeasures: s.medTestMeasures.filter((m) => m.paramId !== id),
    }));
  },

  loadMedTestMeasures: async () => {
    const measures = await db.medTestMeasures.toArray();
    set({ medTestMeasures: measures });
  },

  addMedTestMeasure: async (paramId, date, value, note) => {
    const measure: MedTestMeasure = {
      id: uuid(),
      paramId,
      date,
      value,
      note: note || undefined,
      createdAt: new Date(),
    };
    await db.medTestMeasures.add(measure);
    set((s) => ({ medTestMeasures: [...s.medTestMeasures, measure] }));
  },

  updateMedTestMeasure: async (id, updates) => {
    await db.medTestMeasures.update(id, updates);
    set((s) => ({
      medTestMeasures: s.medTestMeasures.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
  },

  deleteMedTestMeasure: async (id) => {
    await db.medTestMeasures.delete(id);
    set((s) => ({ medTestMeasures: s.medTestMeasures.filter((m) => m.id !== id) }));
  },

  buildMedTestSummary: () => {
    return buildMedTestSummary(get().medTestParams, get().medTestMeasures);
  },

  // Product analyses ("стоит ли это есть?")
  productAnalyses: [],

  loadProductAnalyses: async () => {
    const analyses = await db.productAnalyses.orderBy('createdAt').reverse().toArray();
    set({ productAnalyses: analyses });
  },

  addProductAnalysis: async (a) => {
    const analysis: ProductAnalysis = { ...a, id: uuid(), createdAt: new Date() };
    await db.productAnalyses.add(analysis);
    set((s) => ({ productAnalyses: [analysis, ...s.productAnalyses] }));
  },

  deleteProductAnalysis: async (id) => {
    await db.productAnalyses.delete(id);
    set((s) => ({ productAnalyses: s.productAnalyses.filter((a) => a.id !== id) }));
  },

  runProductAnalysis: async (input) => {
    const { profile, customGoals } = get();
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    set({ isSending: true, streamingAnalysis: '', lastAnalysisDebug: null });

    try {
      const profileInfo = buildProfileInfoForAnalysis(profile, customGoals);
      const medTestSummary = buildMedTestSummary(get().medTestParams, get().medTestMeasures);
      const fullProfileInfo = [profileInfo, medTestSummary.trim()].filter(Boolean).join('\n');
      const systemPrompt = NutritionPrompts.getProductAnalysisPrompt(fullProfileInfo || undefined);

      // Product data as the user turn
      const parts: string[] = [`Продукт: ${input.productName}`];
      if (input.ingredients?.trim()) parts.push(`Состав (ингредиенты): ${input.ingredients.trim()}`);
      if (input.nutrientsPer100g?.trim()) parts.push(`Пищевая ценность на 100 г: ${input.nutrientsPer100g.trim()}`);
      const userContent = parts.join('\n');

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      let finalContent = '';
      try {
        await callLLMStream(provider, messages, (text) => {
          finalContent = text;
          set({ streamingAnalysis: text });
        }, 0.5);
      } catch {
        // Streaming not supported — fallback to non-streaming
        const response = await callLLM(provider, messages, 0.5);
        finalContent = response.content;
        set({ streamingAnalysis: finalContent });
      }

      if (!finalContent.trim()) {
        throw new Error('Модель вернула пустой ответ');
      }

      const { verdict, summary } = parseProductVerdict(finalContent);

      set({
        isSending: false,
        streamingAnalysis: '',
        lastAnalysisDebug: {
          prompt: `--- Системный промпт ---\n${systemPrompt}\n\n--- Данные продукта ---\n${userContent}`,
          response: finalContent,
        },
      });

      const analysis: ProductAnalysis = {
        id: uuid(),
        productName: input.productName,
        verdict,
        summary: summary || 'Анализ выполнен',
        analysis: finalContent,
        ingredients: input.ingredients?.trim() || undefined,
        nutrientsPer100g: input.nutrientsPer100g?.trim() || undefined,
        sourceProductId: input.sourceProductId,
        createdAt: new Date(),
      };
      await db.productAnalyses.add(analysis);
      set((s) => ({ productAnalyses: [analysis, ...s.productAnalyses] }));
      return analysis;
    } catch (error) {
      set({ isSending: false, streamingAnalysis: '' });
      throw error;
    }
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
    await db.chatSessions.update(id, { title, lastActivity: new Date() });
 set((s) => ({
      chatSessions: s.chatSessions.map((cs) => cs.id === id ? { ...cs, title, lastActivity: new Date() } : cs),
    }));
  },

  updateChatMessage: async (id: string, content: string) => {
    await db.chatMessages.update(id, { content });
    set((s) => ({
      chatMessages: s.chatMessages.map((m) => m.id === id ? { ...m, content } : m),
    }));
  },

  resendFromMessage: async (messageId: string, newContent: string, dateFrom: string, dateTo: string) => {
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

      // Build history from kept messages (exclude system). The last kept message
      // is the edited one — it goes as the current user message (with images if any).
      const allNonSystem = keptMessages.filter((m) => m.role !== 'system');
      const editedMsg = allNonSystem[allNonSystem.length - 1];
      const history: LLMMessage[] = allNonSystem
        .slice(0, -1)
        .slice(-19)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Build system prompt
      const contextType = NutritionPrompts.detectContextFromMessage(newContent);
      const activeGoalNames = customGoals.filter((g) => g.isActive).map((g) => g.name);
      let systemPrompt = NutritionPrompts.getContextualPrompt(contextType, profile, activeGoalNames);
      systemPrompt += NutritionPrompts.getTimeOfDayContext();
      const nutritionSummary = buildNutritionSummary(foodEntries, dateFrom, dateTo, get().expandEntryItemsToText);
      const diarySummary = buildDiarySummary(diaryEntries, dateFrom, dateTo);
      const waterSummary = buildWaterSummary(get().waterLog, dateFrom, dateTo);
      const sleepSummary = buildSleepSummaryFromLog(get().sleepLog, dateFrom, dateTo);
      const workoutSummary = buildWorkoutSummary(get().workoutEntries, dateFrom, dateTo);
      const medTestSummary = buildMedTestSummary(get().medTestParams, get().medTestMeasures);
      const dataContext = nutritionSummary + diarySummary + waterSummary + sleepSummary + workoutSummary + medTestSummary;
      // Apply 10k char limit to data context
      const MAX_CONTEXT = 10000;
      const trimmedContext = dataContext.length > MAX_CONTEXT
        ? dataContext.slice(0, MAX_CONTEXT) + '\n...[контекст обрезан — слишком много данных]'
        : dataContext;
      systemPrompt += trimmedContext;

      // Pass images only when the provider supports vision — otherwise plain text
      const editedImages = provider.supportsVision ? editedMsg?.imagesBase64 : undefined;
      const userContent = buildUserContentWithImages(newContent, editedImages);
      const llmMessages = buildChatMessages(systemPrompt, history, userContent);

      // Use streaming
      let finalContent = '';
      try {
        await callLLMStream(provider, llmMessages, (text) => {
          if (abort.signal.aborted) return;
          finalContent = text;
          set({ streamingContent: text });
        }, 0.8, { signal: abort.signal });
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

  sendChatMessage: async (content: string, dateFrom: string, dateTo: string, images?: string[]): Promise<string> => {
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
      // Save user message to DB and immediately show in chat (images included)
      const userMsg: ChatMessage = {
        id: uuid(),
        sessionId,
        role: 'user',
        content,
        imagesBase64: images && images.length > 0 ? images : undefined,
        createdAt: new Date(),
      };
      await db.chatMessages.add(userMsg);
      set((s) => ({ chatMessages: [...s.chatMessages, userMsg] }));

      // Detect context and build system prompt
      const contextType = NutritionPrompts.detectContextFromMessage(content);
      const activeGoalNames = customGoals.filter((g) => g.isActive).map((g) => g.name);
      let systemPrompt = NutritionPrompts.getContextualPrompt(contextType, profile, activeGoalNames);
      systemPrompt += NutritionPrompts.getTimeOfDayContext();

      // Add data context based on selected date range
      const nutritionSummary = buildNutritionSummary(foodEntries, dateFrom, dateTo, get().expandEntryItemsToText);
      const diarySummary = buildDiarySummary(diaryEntries, dateFrom, dateTo);
      const waterSummary = buildWaterSummary(get().waterLog, dateFrom, dateTo);
      const sleepSummary = buildSleepSummaryFromLog(get().sleepLog, dateFrom, dateTo);
      const workoutSummary = buildWorkoutSummary(get().workoutEntries, dateFrom, dateTo);
      const medTestSummary = buildMedTestSummary(get().medTestParams, get().medTestMeasures);
      const dataContext = nutritionSummary + diarySummary + waterSummary + sleepSummary + workoutSummary + medTestSummary;
      // Apply 10k char limit to data context
      const MAX_CONTEXT = 10000;
      const trimmedContext = dataContext.length > MAX_CONTEXT
        ? dataContext.slice(0, MAX_CONTEXT) + '\n...[контекст обрезан — слишком много данных]'
        : dataContext;
      systemPrompt += trimmedContext;

      // Build history for LLM (limit to last 20 messages)
      const history: LLMMessage[] = chatMessages
        .slice(-20)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Pass images to LLM only when the provider supports vision — otherwise
      // send plain text so non-vision providers are not broken
      const imagesForLLM = provider.supportsVision ? images : undefined;
      const userContent = buildUserContentWithImages(content, imagesForLLM);

      const llmMessages = buildChatMessages(systemPrompt, history, userContent);

      // Use streaming
      let finalContent = '';
      try {
        await callLLMStream(provider, llmMessages, (text) => {
          if (abort.signal.aborted) return;
          finalContent = text;
          set({ streamingContent: text });
        }, 0.8, { signal: abort.signal });
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

      // Update session (fallback title when only an image was sent)
      await db.chatSessions.update(sessionId, {
        lastActivity: new Date(),
        title: (content.trim() || 'Изображение').slice(0, 50),
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

  computeContextSize: (dateFrom: string, dateTo: string): number => {
    const { foodEntries, diaryEntries } = get();
    const nutritionSummary = buildNutritionSummary(foodEntries, dateFrom, dateTo, get().expandEntryItemsToText);
    const diarySummary = buildDiarySummary(diaryEntries, dateFrom, dateTo);
    const waterSummary = buildWaterSummary(get().waterLog, dateFrom, dateTo);
    const sleepSummary = buildSleepSummaryFromLog(get().sleepLog, dateFrom, dateTo);
    const workoutSummary = buildWorkoutSummary(get().workoutEntries, dateFrom, dateTo);
    const medTestSummary = buildMedTestSummary(get().medTestParams, get().medTestMeasures);
    return (nutritionSummary + diarySummary + waterSummary + sleepSummary + workoutSummary + medTestSummary).length;
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
        await callLLMStream(provider, messages, (text) => {
          finalContent = text;
          set({ streamingAnalysis: text });
        }, 0.6);
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
        await callLLMStream(provider, messages, (text) => {
          finalContent = text;
          set({ streamingAnalysis: text });
        }, 0.6);
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

  analyzeWorkoutStream: async (description: string): Promise<string> => {
    const { profile, customGoals } = get();
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    set({ isSending: true, streamingAnalysis: '', lastAnalysisDebug: null });

    try {
      const profileInfo = buildProfileInfoForAnalysis(profile, customGoals);
      const systemPrompt = NutritionPrompts.getWorkoutAnalysisPrompt(profileInfo);
      const userContent = description;
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      let finalContent = '';
      try {
        await callLLMStream(provider, messages, (text) => {
          finalContent = text;
          set({ streamingAnalysis: text });
        }, 0.6);
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

  scanMedTestFromPhoto: async (imageBase64: string): Promise<string> => {
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    set({ isSending: true, streamingAnalysis: '', lastAnalysisDebug: null });

    try {
      const systemPrompt = `Ты — медицинский OCR-ассистент. Пользователь отправляет фотографию выписки/результата лабораторных анализов крови или других тестов.

Твоя задача — точно распознать и извлечь ВСЕ параметры анализов из документа.

Возвращай СТРОГО JSON-массив (без markdown, без \`\`\`, просто чистый JSON):
[
  {
    "date": "YYYY-MM-DD",
    "items": [
      {
        "name": "Название параметра на русском",
        "value": 5.2,
        "unit": "ммоль/л",
        "refLow": 3.0,
        "refHigh": 5.2,
        "note": "необязательная заметка"
      }
    ]
  }
]

Правила:
- date: дата сдачи анализа в формате YYYY-MM-DD. Если несколько дат — несколько объектов в массиве. Если дата не указана — используй пустую строку.
- name: точное название параметра как в документе (Холестерин общий, ЛПНП, ЛПВП, Глюкоза и т.д.)
- value: ЧИСЛО (float), не строка. Если значение вроде "<0.1" — value: 0.1, note: "<0.1"
- unit: единица измерения (ммоль/л, г/л, Ед/л, мкмоль/л, %, нг/мл и т.д.)
- refLow, refHigh: референсные значения из документа (числа). Если указано "до 5.2" — refLow: null, refHigh: 5.2. Если не указаны — null.
- note: опционально, если есть пометки (натощак, после нагрузки и т.п.)

Если на фото нет анализов или не удалось распознать — верни пустой массив: []

Будь максимально точным в распознавании чисел и единиц. Не придумывай данные.`;

      const userContent: ContentPart[] = [
        {
          type: 'text',
          text: 'Распознай результаты анализов из этого изображения. Верни JSON-массив.',
        },
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
          },
        },
      ];

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      let finalContent = '';
      try {
        await callLLMStream(provider, messages, (text) => {
          finalContent = text;
          set({ streamingAnalysis: text });
        }, 0.3);
      } catch {
        const response = await callLLM(provider, messages, 0.3);
        finalContent = response.content;
        set({ streamingAnalysis: finalContent });
      }

      set({
        isSending: false,
        streamingAnalysis: '',
        lastAnalysisDebug: {
          prompt: `--- Системный промпт ---\n${systemPrompt}\n\n--- Запрос ---\n[фото анализов]`,
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
