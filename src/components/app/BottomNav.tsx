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
  BookOpen,
} from 'lucide-react';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Главная', icon: LayoutDashboard },
  { id: 'food', label: 'Питание', icon: UtensilsCrossed },
  { id: 'diary', label: 'Дневник', icon: BookOpen },
  { id: 'chat', label: 'Чат', icon: MessageSquare },
  { id: 'profile', label: 'Профиль', icon: User },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export default function BottomNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <nav className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-bottom">
      <div className="mx-auto flex h-16 items-center gap-1 overflow-x-auto px-2 scrollbar-hide">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex min-w-[3.5rem] flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === id
                ? 'text-emerald-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={activeTab === id ? 2.5 : 2} />
            <span className="text-[10px] font-medium leading-tight whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
