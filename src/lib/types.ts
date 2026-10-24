export type ProviderType = 'openai' | 'openrouter' | 'dashscope' | 'ollama' | 'llamacpp' | 'nuadvi' | 'custom';

export interface LLMProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string; // Can be empty for keyless providers (llama.cpp, Ollama)
  model: string;
  models?: string[]; // List of saved model names for quick selection
  isActive: boolean;
  supportsVision: boolean;
  headers?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export type GoalType =
  | 'health'
  | 'weight_loss'
  | 'weight_gain'
  | 'muscle_gain'
  | 'cutting'
  | 'better_sleep'
  | 'wellbeing'
  | 'mental_clarity'
  | 'energy'
  | 'maintenance'
  | 'more_walking'
  | 'reduce_ldl'
  | 'logic_tasks';

export const GOAL_LABELS: Record<GoalType, string> = {
  health: 'Здоровье',
  weight_loss: 'Похудение',
  weight_gain: 'Набор массы',
  muscle_gain: 'Набор мышц',
  cutting: 'Сушка',
  better_sleep: 'Улучшить сон',
  wellbeing: 'Самочувствие',
  mental_clarity: 'Бодрость ума',
  energy: 'Энергия',
  maintenance: 'Поддержание веса',
  more_walking: 'Больше ходить',
  reduce_ldl: 'Уменьшить ЛПНП',
  logic_tasks: 'Решать логические задачи',
};

export const GOAL_ICONS: Record<GoalType, string> = {
  health: 'Heart',
  weight_loss: 'TrendingDown',
  weight_gain: 'TrendingUp',
  muscle_gain: 'Dumbbell',
  cutting: 'Flame',
  better_sleep: 'Moon',
  wellbeing: 'Smile',
  mental_clarity: 'Brain',
  energy: 'Zap',
  maintenance: 'Target',
  more_walking: 'Footprints',
  reduce_ldl: 'HeartPulse',
  logic_tasks: 'Puzzle',
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

export type ActivityLevel = 'low' | 'moderate' | 'high' | 'very_high';

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  low: 'Низкий',
  moderate: 'Умеренный',
  high: 'Высокий',
  very_high: 'Очень высокий',
};

export interface UserProfile {
  id?: string;
  name: string;
  age: number | null;
  weight: number | null;
  height: number | null;
  gender: 'male' | 'female' | 'other' | '';
  goals: GoalType[];
  restrictions: string;
  activityLevel: ActivityLevel;
  healthNotes: string;
  waterTargetMl: number;  // daily water target in ml (default 2000)
  sleepTargetHours: number; // daily sleep target in hours (default 8)
  updatedAt: Date;
}

export interface FoodProduct {
  id: string;
  name: string;
  createdAt: Date;
}

export interface DishIngredientData {
  productId: string;
  weightGrams: number;
}

export interface Dish {
  id?: string;
  name: string;
  ingredients: DishIngredientData[];
  createdAt: Date;
}

export interface FoodEntryItem {
  productId?: string;
  dishId?: string;
  name: string;
  weightGrams: number;
}

export interface FoodEntry {
  id?: string;
  date: string; // ISO date string
  mealType: MealType;
  description: string;
  items?: FoodEntryItem[]; // structured items
  photoBase64?: string;
  weight?: number; // grams
  estimatedCalories?: number;
  estimatedProtein?: number;
  estimatedFat?: number;
  estimatedCarbs?: number;
  aiAnalysis?: string;
  createdAt: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface ChatMessage {
  id?: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageBase64?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface ConversationContext {
  profile: UserProfile | null;
  recentHistory: ChatMessage[];
  summary: string | null;
}

export interface CustomGoal {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

export type DiaryEntryType = 'activity' | 'wellbeing' | 'blood_pressure';

export const DIARY_TYPE_LABELS: Record<DiaryEntryType, string> = {
  activity: 'Активность',
  wellbeing: 'Самочувствие',
  blood_pressure: 'Давление',
};

export interface DiaryEntry {
  id?: string;
  type: DiaryEntryType;
  date: string; // ISO date string
  time?: string; // HH:MM optional
  // activity
  description?: string;
  durationMinutes?: number;
  // wellbeing
  note?: string;
  // blood_pressure
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  createdAt: Date;
}

export interface FoodLibraryItem {
  id: string;
  name: string;
  defaultWeight?: number;
  lastMealType: MealType;
  useCount: number;
  lastUsedAt: Date;
  createdAt: Date;
}

export type ExerciseCategory = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core' | 'cardio' | 'other';

export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  arms: 'Руки',
  legs: 'Ноги',
  core: 'Кор',
  cardio: 'Кардио',
  other: 'Другое',
};

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  createdAt: Date;
}

export interface WorkoutSet {
  id: string;           // stable ID for drag-and-drop and React keys
  exerciseId: string;
  exerciseName: string;
  weight?: number;
  reps?: number;
  sets?: number;
  duration?: number;
  distance?: number;
  notes?: string;
  startTime?: number; // ms timestamp when exercise started
  endTime?: number;   // ms timestamp when exercise ended
}

export interface WorkoutEntry {
  id?: string;
  date: string;
  name?: string;
  sets: WorkoutSet[];
  estimatedDuration?: number;
  estimatedCaloriesBurned?: number;
  aiAnalysis?: string;
  createdAt: Date;
}

export type TabId = 'dashboard' | 'food' | 'catalog' | 'diary' | 'workout' | 'stats' | 'chat' | 'profile' | 'settings';

export interface DayEval {
  id?: string;
  date: string;
  analysis: string;
  updatedAt: Date;
}

export interface WaterLog {
  id?: string;
  date: string; // ISO date string
  glasses: number;
  glassMl: number;
  updatedAt: Date;
}

export interface SleepPeriod {
  start: string; // HH:MM
  end: string;   // HH:MM
}

export interface SleepLog {
  id?: string;
  date: string; // ISO date string
  periods: SleepPeriod[];
  updatedAt: Date;
}

// ─── Medical Test Parameters & Measurements ────────────────────────

/** A medical test parameter definition (e.g. "Холестерин общий", "Глюкоза") */
export interface MedTestParam {
  id: string;
  name: string;
  unit: string;          // e.g. "ммоль/л", "г/л", "%"
  refLow?: number;       // reference range low
  refHigh?: number;      // reference range high
  isDefault: boolean;    // true = pre-seeded built-in parameter
  createdAt: Date;
}

/** A single measurement for a MedTestParam */
export interface MedTestMeasure {
  id: string;
  paramId: string;       // FK → MedTestParam.id
  date: string;          // ISO date string when test was taken
  value: number;         // numeric result
  note?: string;         // optional note (e.g. "натощак", "после еды")
  createdAt: Date;
}

/** Pre-seeded default medical test parameters */
export const DEFAULT_MED_TEST_PARAMS: Omit<MedTestParam, 'id' | 'createdAt'>[] = [
  { name: 'Холестерин общий', unit: 'ммоль/л', refLow: 3.0, refHigh: 5.2, isDefault: true },
  { name: 'ЛПНП', unit: 'ммоль/л', refLow: 0, refHigh: 3.0, isDefault: true },
  { name: 'ЛПВП', unit: 'ммоль/л', refLow: 1.0, refHigh: 2.5, isDefault: true },
  { name: 'Тироксин Т4', unit: 'пмоль/л', refLow: 9.0, refHigh: 22.0, isDefault: true },
  { name: 'ТТГ', unit: 'мЕд/л', refLow: 0.4, refHigh: 4.0, isDefault: true },
  { name: 'Гликированный гемоглобин', unit: '%', refLow: 4.0, refHigh: 6.0, isDefault: true },
  { name: 'Гемоглобин', unit: 'г/л', refLow: 120, refHigh: 160, isDefault: true },
  { name: 'Глюкоза', unit: 'ммоль/л', refLow: 3.9, refHigh: 6.1, isDefault: true },
  { name: 'Креатинин', unit: 'мкмоль/л', refLow: 44, refHigh: 106, isDefault: true },
  { name: 'Триглицериды', unit: 'ммоль/л', refLow: 0, refHigh: 1.7, isDefault: true },
  { name: 'Альбумин', unit: 'г/л', refLow: 35, refHigh: 50, isDefault: true },
  { name: 'АЛТ', unit: 'Ед/л', refLow: 0, refHigh: 40, isDefault: true },
  { name: 'АСТ', unit: 'Ед/л', refLow: 0, refHigh: 40, isDefault: true },
  { name: 'Мочевая кислота', unit: 'мкмоль/л', refLow: 150, refHigh: 420, isDefault: true },
  { name: 'Ферритин', unit: 'мкг/л', refLow: 15, refHigh: 200, isDefault: true },
  { name: 'Витамин D', unit: 'нг/мл', refLow: 30, refHigh: 100, isDefault: true },
];

/** Compute trend direction from a series of measurements (sorted oldest→newest) */
export type TrendDirection = 'up' | 'down' | 'stable' | 'unknown';

export function computeTrend(values: number[]): TrendDirection {
  if (values.length < 2) return 'unknown';
  const last = values.slice(-3); // last 3 points
  let ups = 0, downs = 0;
  for (let i = 1; i < last.length; i++) {
    const diff = last[i] - last[i - 1];
    if (Math.abs(diff) < 0.001) { /* negligible change */ }
    else if (diff > 0) ups++;
    else downs++;
  }
  if (ups === 0 && downs === 0) return 'stable';
  if (ups > downs) return 'up';
  if (downs > ups) return 'down';
  return 'stable';
}
