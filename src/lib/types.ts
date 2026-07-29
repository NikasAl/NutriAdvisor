export type ProviderType = 'openai' | 'openrouter' | 'dashscope' | 'ollama' | 'llamacpp' | 'custom';

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
  | 'maintenance';

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
  updatedAt: Date;
}

export interface FoodEntry {
  id?: string;
  date: string; // ISO date string
  mealType: MealType;
  description: string;
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

export type TabId = 'dashboard' | 'food' | 'chat' | 'profile' | 'settings';
