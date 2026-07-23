'use client';

import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BottomNav from '@/components/app/BottomNav';
import DashboardPanel from '@/components/app/DashboardPanel';
import FoodJournalPanel from '@/components/app/FoodJournalPanel';
import ChatAssistantPanel from '@/components/app/ChatAssistantPanel';
import ProfilePanel from '@/components/app/ProfilePanel';
import SettingsPanel from '@/components/app/SettingsPanel';

export default function Home() {
  const activeTab = useAppStore((s) => s.activeTab);
  const loadProviders = useAppStore((s) => s.loadProviders);
  const loadProfile = useAppStore((s) => s.loadProfile);
  const loadFoodEntries = useAppStore((s) => s.loadFoodEntries);

  useEffect(() => {
    loadProviders();
    loadProfile();
    loadFoodEntries();
  }, [loadProviders, loadProfile, loadFoodEntries]);

  return (
    <div className="min-h-screen bg-background">
      {/* Main content */}
      <main className="mx-auto max-w-lg px-4 pt-4 pb-20">
        {activeTab === 'dashboard' && <DashboardPanel />}
        {activeTab === 'food' && <FoodJournalPanel />}
        {activeTab === 'chat' && <ChatAssistantPanel />}
        {activeTab === 'profile' && <ProfilePanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
