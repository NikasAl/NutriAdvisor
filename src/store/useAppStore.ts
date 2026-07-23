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
} from '@/lib/types';
import { NutritionPrompts } from '@/lib/prompts';
import { callLLM, buildChatMessages, buildVisionMessages } from '@/lib/llm-client';
import type { LLMMessage } from '@/lib/llm-client';

const DEFAULT_PROVIDER: Omit<LLMProvider, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'OpenAI',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
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
};

interface AppState {
  // Navigation
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

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

  // Food entries
  foodEntries: FoodEntry[];
  loadFoodEntries: () => Promise<void>;
  addFoodEntry: (entry: Omit<FoodEntry, 'id' | 'createdAt'>) => Promise<void>;
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
  loadChatMessages: () => Promise<void>;

  // LLM interaction
  sendChatMessage: (content: string, nutritionPeriod?: string) => Promise<string>;
  analyzeFoodImage: (imageBase64: string) => Promise<string>;
  analyzeFoodText: (description: string, weight?: number) => Promise<string>;
  isSending: boolean;
}

/** Build a nutrition summary string from food entries for a given period */
function buildNutritionSummary(
  foodEntries: FoodEntry[],
  period: 'today' | 'week' | 'month'
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

  let summary = `\n--- Данные о питании ${periodLabel} ---\n`;

  // Group by date for today; aggregate for week/month
  if (period === 'today') {
    summary += `Количество приёмов пищи: ${filtered.length}\n\n`;
    for (const entry of filtered) {
      summary += `• [${entry.date} ${new Date(entry.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}] `;
      summary += `${entry.description}`;
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
        summary += `  • ${entry.description}`;
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
  },

  deleteFoodEntry: async (id) => {
    await db.foodEntries.delete(id);
    set((s) => ({ foodEntries: s.foodEntries.filter((e) => e.id !== id) }));
  },

  getEntriesForDate: (date: string) => {
    return get().foodEntries.filter((e) => e.date === date);
  },

  // Chat
  chatSessions: [],
  currentChatId: null,
  chatMessages: [],
  isSending: false,

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

  loadChatMessages: async () => {
    const { currentChatId } = get();
    if (!currentChatId) return;
    const messages = await db.chatMessages.where('sessionId').equals(currentChatId).sortBy('createdAt');
    set({ chatMessages: messages });
  },

  sendChatMessage: async (content: string, nutritionPeriod: string = 'today'): Promise<string> => {
    const { currentChatId, chatMessages, profile, foodEntries } = get();
    const provider = get().getActiveProvider();

    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    let sessionId = currentChatId;
    if (!sessionId) {
      sessionId = await get().createChatSession();
    }

    set({ isSending: true });

    try {
      // Save user message
      const userMsg: ChatMessage = {
        id: uuid(),
        sessionId,
        role: 'user',
        content,
        createdAt: new Date(),
      };
      await db.chatMessages.add(userMsg);

      // Detect context and build system prompt
      const contextType = NutritionPrompts.detectContextFromMessage(content);
      let systemPrompt = NutritionPrompts.getContextualPrompt(contextType, profile);

      // Add nutrition context based on selected period
      const period = nutritionPeriod as 'today' | 'week' | 'month';
      const nutritionSummary = buildNutritionSummary(foodEntries, period);
      systemPrompt += nutritionSummary;

      // Build history for LLM (limit to last 20 messages)
      const history: LLMMessage[] = chatMessages
        .slice(-20)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const llmMessages = buildChatMessages(systemPrompt, history, content);
      const response = await callLLM(provider, llmMessages, 0.8);

      // Save assistant message
      const assistantMsg: ChatMessage = {
        id: uuid(),
        sessionId,
        role: 'assistant',
        content: response.content,
        createdAt: new Date(),
      };
      await db.chatMessages.add(assistantMsg);

      // Update session
      await db.chatSessions.update(sessionId, {
        lastActivity: new Date(),
        title: content.slice(0, 50),
      });

      set((s) => ({
        chatMessages: [...s.chatMessages, userMsg, assistantMsg],
        isSending: false,
      }));

      // Reload sessions to update title
      get().loadChatSessions();

      return response.content;
    } catch (error) {
      set({ isSending: false });
      throw error;
    }
  },

  analyzeFoodImage: async (imageBase64: string): Promise<string> => {
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM с поддержкой Vision в настройках');
    }

    set({ isSending: true });

    try {
      const visionMessages = buildVisionMessages(imageBase64);
      const description = await callLLM(provider, visionMessages, 0.6);

      // Now analyze the food description
      const analysisMessages: LLMMessage[] = [
        { role: 'system', content: NutritionPrompts.getFoodAnalysisPrompt() },
        { role: 'user', content: `Проанализируй эту еду: ${description.content}` },
      ];
      const analysis = await callLLM(provider, analysisMessages, 0.6);

      set({ isSending: false });
      return analysis.content;
    } catch (error) {
      set({ isSending: false });
      throw error;
    }
  },

  analyzeFoodText: async (description: string, weight?: number): Promise<string> => {
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM в настройках');
    }

    set({ isSending: true });

    try {
      const messages: LLMMessage[] = [
        { role: 'system', content: NutritionPrompts.getFoodAnalysisPrompt() },
        {
          role: 'user',
          content: weight
            ? `Проанализируй эту еду: ${description}. Вес порции: ${weight}г.`
            : `Проанализируй эту еду: ${description}`,
        },
      ];
      const response = await callLLM(provider, messages, 0.6);
      set({ isSending: false });
      return response.content;
    } catch (error) {
      set({ isSending: false });
      throw error;
    }
  },
}));
