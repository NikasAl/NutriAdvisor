'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BottomNav from '@/components/app/BottomNav';
import DashboardPanel from '@/components/app/DashboardPanel';
import FoodJournalPanel from '@/components/app/FoodJournalPanel';
import FoodCatalogPanel from '@/components/app/FoodCatalogPanel';
import DiaryPanel from '@/components/app/DiaryPanel';
import ChatAssistantPanel from '@/components/app/ChatAssistantPanel';
import ProfilePanel from '@/components/app/ProfilePanel';
import SettingsPanel from '@/components/app/SettingsPanel';
import HelpPanel from '@/components/app/HelpPanel';
import type { HelpSection } from '@/components/app/HelpPanel';

export default function Home() {
  const activeTab = useAppStore((s) => s.activeTab);
  const loadProviders = useAppStore((s) => s.loadProviders);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);
  const loadDiaryEntries = useAppStore((s) => s.loadDiaryEntries);
  const loadFoodProducts = useAppStore((s) => s.loadFoodProducts);
  const loadDishes = useAppStore((s) => s.loadDishes);
  const seedFoodCatalog = useAppStore((s) => s.seedFoodCatalog);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const loadWaterLog = useAppStore((s) => s.loadWaterLog);
  const loadSleepLog = useAppStore((s) => s.loadSleepLog);
  const [showHelp, setShowHelp] = useState<HelpSection | false>(false);

  // Show help on first launch (after hydration)
  useEffect(() => {
    if (!localStorage.getItem('nutri-help-shown')) {
      setShowHelp('about');
    }
  }, []);

  useEffect(() => {
    loadProviders();
    loadProfile();
    loadFoodEntries();
    loadDiaryEntries();
    loadFoodProducts();
    loadDishes();
    seedFoodCatalog();
    loadWaterLog(new Date().toISOString().split('T')[0]);
    loadSleepLog(new Date().toISOString().split('T')[0]);
  }, [loadProviders, loadProfile, loadFoodEntries, loadDiaryEntries, loadFoodProducts, loadDishes, seedFoodCatalog, loadWaterLog, loadSleepLog]);

  // Apply theme on mount and when it changes
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  // Listen for OS theme changes when in "system" mode
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (useAppStore.getState().theme === 'system') {
        setTheme('system');
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [setTheme]);

  // Close help/privacy overlay when switching tabs
  useEffect(() => {
    if (showHelp) setShowHelp(false);
  }, [activeTab]);

  const openHelp = (section: HelpSection = 'about') => {
    setShowHelp(section);
  };

  if (showHelp) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col">
        <main className="flex-1 min-h-0 overflow-y-auto mx-auto w-full max-w-lg px-4 pt-4 pb-20">
          <HelpPanel
            initialSection={showHelp}
            onBack={() => { localStorage.setItem('nutri-help-shown', '1'); setShowHelp(false); }}
          />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-background flex flex-col">
      {activeTab === 'chat' ? (
        <main className="flex-1 min-h-0 flex flex-col">
          <ChatAssistantPanel />
        </main>
      ) : (
        <main className="flex-1 min-h-0 overflow-y-auto mx-auto w-full max-w-lg px-4 pt-4 pb-20">
          {activeTab === 'dashboard' && <DashboardPanel onOpenHelp={() => openHelp('about')} onOpenWidgetHelp={openHelp} />}
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
