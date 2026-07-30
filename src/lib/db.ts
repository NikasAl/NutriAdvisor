import Dexie, { type Table } from 'dexie';
import type {
  LLMProvider,
  UserProfile,
  FoodEntry,
  ChatSession,
  ChatMessage,
  CustomGoal,
  FoodLibraryItem,
} from './types';

export class NutriDexie extends Dexie {
  providers!: Table<LLMProvider, string>;
  userProfile!: Table<UserProfile, string>;
  foodEntries!: Table<FoodEntry, string>;
  chatSessions!: Table<ChatSession, string>;
  chatMessages!: Table<ChatMessage, string>;
  customGoals!: Table<CustomGoal, string>;
  foodLibrary!: Table<FoodLibraryItem, string>;

  constructor() {
    super('NutriAdvisorDB');

    this.version(1).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
    });

    this.version(2).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
      customGoals: 'id, isActive, createdAt',
    });

    this.version(3).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
      customGoals: 'id, isActive, createdAt',
      foodLibrary: 'id, name, lastUsedAt, useCount',
    });
  }
}

export const db = new NutriDexie();
