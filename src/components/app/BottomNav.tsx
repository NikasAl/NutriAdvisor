'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { TabId } from '@/lib/types';
import {
  LayoutDashboard,
  UtensilsCrossed,
  MessageSquare,
  User,
  Settings,
} from 'lucide-react';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Главная', icon: LayoutDashboard },
  { id: 'food', label: 'Питание', icon: UtensilsCrossed },
  { id: 'chat', label: 'Чат', icon: MessageSquare },
  { id: 'profile', label: 'Профиль', icon: User },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export default function BottomNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-bottom">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors ${
              activeTab === id
                ? 'text-emerald-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={activeTab === id ? 2.5 : 2} />
            <span className="text-[10px] font-medium leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
