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
import { callLLM, callLLMStream, buildChatMessages, buildVisionMessages } from '@/lib/llm-client';
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
  renameChatSession: (id: string, title: string) => Promise<void>;
  updateChatMessage: (id: string, content: string) => Promise<void>;
  resendFromMessage: (messageId: string, newContent: string, nutritionPeriod?: string) => Promise<void>;
  loadChatMessages: () => Promise<void>;

  // Streaming abort controller ref
  _abortController: AbortController | null;

  // LLM interaction
  sendChatMessage: (content: string, nutritionPeriod?: string) => Promise<string>;
  analyzeFoodImage: (imageBase64: string, description?: string, weight?: number) => Promise<string>;
  analyzeFoodText: (description: string, weight?: number) => Promise<string>;
  lastAnalysisDebug: { prompt: string; response: string } | null;
  isSending: boolean;
  streamingContent: string;
  stopStreaming: () => void;
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
  streamingContent: '',
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
    const { currentChatId, chatMessages, profile, foodEntries } = get();
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
      let systemPrompt = NutritionPrompts.getContextualPrompt(contextType, profile);
      const period = nutritionPeriod as 'today' | 'week' | 'month';
      const nutritionSummary = buildNutritionSummary(foodEntries, period);
      systemPrompt += nutritionSummary;

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
    const { currentChatId, chatMessages, profile, foodEntries } = get();
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

  analyzeFoodImage: async (imageBase64: string, description?: string, weight?: number): Promise<string> => {
    const provider = get().getActiveProvider();
    if (!provider || !provider.baseUrl || !provider.model) {
      throw new Error('Настройте провайдер LLM с поддержкой Vision в настройках');
    }

    set({ isSending: true, lastAnalysisDebug: null });

    try {
      // Step 1: Get image description using vision
      const visionMessages = buildVisionMessages(imageBase64);
      const imgDescription = await callLLM(provider, visionMessages, 0.6);

      // Step 2: Build combined food description (image + user text + weight)
      let combinedDesc = `Описание с фото: ${imgDescription.content}`;
      if (description) combinedDesc += `\nДополнительное описание от пользователя: ${description}`;
      if (weight) combinedDesc += `\nУказанный вес порции: ${weight}г`;

      // Step 3: Analyze with nutrition prompt
      const systemPrompt = NutritionPrompts.getFoodAnalysisPrompt();
      const analysisMessages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Проанализируй эту еду: ${combinedDesc}` },
      ];
      const analysis = await callLLM(provider, analysisMessages, 0.6);

      set({
        isSending: false,
        lastAnalysisDebug: {
          prompt: `--- Системный промпт ---\n${systemPrompt}\n\n--- Запрос пользователя ---\nПроанализируй эту еду: ${combinedDesc}`,
          response: analysis.content,
        },
      });
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

    set({ isSending: true, lastAnalysisDebug: null });

    try {
      const systemPrompt = NutritionPrompts.getFoodAnalysisPrompt();
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
}));
