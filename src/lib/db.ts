import Dexie, { type Table } from 'dexie';
import type {
  LLMProvider,
  UserProfile,
  FoodEntry,
  ChatSession,
  ChatMessage,
} from './types';

export class NutriDexie extends Dexie {
  providers!: Table<LLMProvider, string>;
  userProfile!: Table<UserProfile, string>;
  foodEntries!: Table<FoodEntry, string>;
  chatSessions!: Table<ChatSession, string>;
  chatMessages!: Table<ChatMessage, string>;

  constructor() {
    super('NutriAdvisorDB');

    this.version(1).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
    });
  }
}

export const db = new NutriDexie();
