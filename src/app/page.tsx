'use client';

import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BottomNav from '@/components/app/BottomNav';
import DashboardPanel from '@/components/app/DashboardPanel';
import FoodJournalPanel from '@/components/app/FoodJournalPanel';
import FoodCatalogPanel from '@/components/app/FoodCatalogPanel';
import DiaryPanel from '@/components/app/DiaryPanel';
import ChatAssistantPanel from '@/components/app/ChatAssistantPanel';
import ProfilePanel from '@/components/app/ProfilePanel';
import SettingsPanel from '@/components/app/SettingsPanel';

export default function Home() {
  const activeTab = useAppStore((s) => s.activeTab);
  const loadProviders = useAppStore((s) => s.loadProviders);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const loadDiaryEntries = useAppStore((s) => s.loadDiaryEntries);
  const loadFoodProducts = useAppStore((s) => s.loadFoodProducts);
  const loadDishes = useAppStore((s) => s.loadDishes);

  useEffect(() => {
    loadProviders();
    loadProfile();
    loadFoodEntries();
    loadDiaryEntries();
    loadFoodProducts();
    loadDishes();
  }, [loadProviders, loadProfile, loadFoodEntries, loadDiaryEntries, loadFoodProducts, loadDishes]);

  return (
    <div className="h-[100dvh] bg-background flex flex-col">
      {activeTab === 'chat' ? (
        <main className="flex-1 min-h-0 flex flex-col">
          <ChatAssistantPanel />
        </main>
      ) : (
        <main className="flex-1 min-h-0 overflow-y-auto mx-auto w-full max-w-lg px-4 pt-4 pb-20">
          {activeTab === 'dashboard' && <DashboardPanel />}
          {activeTab === 'food' && <FoodJournalPanel />}
          {activeTab === 'catalog' && <FoodCatalogPanel />}
          {activeTab === 'diary' && <DiaryPanel />}
          {activeTab === 'profile' && <ProfilePanel />}
          {activeTab === 'settings' && <SettingsPanel />}
        </main>
      )}
      <BottomNav />
    </div>
  );
}
