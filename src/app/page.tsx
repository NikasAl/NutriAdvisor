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
    <div className="h-[100dvh] bg-background flex flex-col">
      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto mx-auto w-full max-w-lg px-4 pt-4 pb-20">
        {activeTab === 'dashboard' && <DashboardPanel />}
        {activeTab === 'food' && <FoodJournalPanel />}
        {activeTab === 'profile' && <ProfilePanel />}
        {activeTab === 'settings' && <SettingsPanel />}
        {/* Chat uses its own flex layout to manage scroll area + input bar */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            <ChatAssistantPanel />
          </div>
        )}
      </main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
