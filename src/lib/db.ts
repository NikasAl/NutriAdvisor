import Dexie, { type Table } from 'dexie';
import type {
  LLMProvider,
  UserProfile,
  FoodEntry,
  ChatSession,
  ChatMessage,
  CustomGoal,
  FoodLibraryItem,
  DiaryEntry,
  FoodProduct,
  Dish,
  WaterLog,
  SleepLog,
} from './types';

export class NutriDexie extends Dexie {
  providers!: Table<LLMProvider, string>;
  userProfile!: Table<UserProfile, string>;
  foodEntries!: Table<FoodEntry, string>;
  chatSessions!: Table<ChatSession, string>;
  chatMessages!: Table<ChatMessage, string>;
  customGoals!: Table<CustomGoal, string>;
  foodLibrary!: Table<FoodLibraryItem, string>;
  diaryEntries!: Table<DiaryEntry, string>;
  foodProducts!: Table<FoodProduct, string>;
  dishes!: Table<Dish, string>;
  waterLogs!: Table<WaterLog, string>;
  sleepLogs!: Table<SleepLog, string>;

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

    this.version(4).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
      customGoals: 'id, isActive, createdAt',
      foodLibrary: 'id, name, lastUsedAt, useCount',
      diaryEntries: 'id, type, date, createdAt',
    });

    this.version(5).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
      customGoals: 'id, isActive, createdAt',
      foodLibrary: 'id, name, lastUsedAt, useCount',
      diaryEntries: 'id, type, date, createdAt',
      foodProducts: 'id, name, createdAt',
      dishes: 'id, name, createdAt',
    });

    this.version(6).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
      customGoals: 'id, isActive, createdAt',
      foodLibrary: 'id, name, lastUsedAt, useCount',
      diaryEntries: 'id, type, date, createdAt',
      foodProducts: 'id, name, createdAt',
      dishes: 'id, name, createdAt',
      waterLogs: 'id, date, updatedAt',
    });

    this.version(7).stores({
      providers: 'id, name, type, isActive',
      userProfile: 'id',
      foodEntries: 'id, date, mealType, createdAt',
      chatSessions: 'id, lastActivity',
      chatMessages: 'id, sessionId, createdAt',
      customGoals: 'id, isActive, createdAt',
      foodLibrary: 'id, name, lastUsedAt, useCount',
      diaryEntries: 'id, type, date, createdAt',
      foodProducts: 'id, name, createdAt',
      dishes: 'id, name, createdAt',
      waterLogs: 'id, date, updatedAt',
      sleepLogs: 'id, date, updatedAt',
    });
  }
}

export const db = new NutriDexie();
