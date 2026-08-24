'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { TabId } from '@/lib/types';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Package,
  BookOpen,
  MessageSquare,
  User,
  Settings,
} from 'lucide-react';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Главная', icon: LayoutDashboard },
  { id: 'food', label: 'Питание', icon: UtensilsCrossed },
  { id: 'catalog', label: 'Продукты', icon: Package },
  { id: 'diary', label: 'Дневник', icon: BookOpen },
  { id: 'chat', label: 'Чат', icon: MessageSquare },
  { id: 'profile', label: 'Профиль', icon: User },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export default function BottomNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const scrollRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hintShown, setHintShown] = useState(false);

  // Update fade indicators based on scroll position
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  // On mount and resize — check scroll state + show hint once
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Small delay to let layout settle
    const timer = setTimeout(() => {
      updateScrollState();

      // Show hint animation once if content overflows
      if (!hintShown && el.scrollWidth > el.clientWidth) {
        setHintShown(true);
        el.scrollTo({ left: 40, behavior: 'smooth' });
        setTimeout(() => {
          el.scrollTo({ left: 0, behavior: 'smooth' });
        }, 400);
      }
    }, 600);

    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, hintShown]);

  // Auto-scroll to active tab when it changes
  useEffect(() => {
    const btn = btnRefs.current.get(activeTab);
    if (!btn || !scrollRef.current) return;

    const container = scrollRef.current;
    const btnRect = btn.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Scroll if button is not fully visible
    const btnCenter = btnRect.left + btnRect.width / 2;
    const containerCenter = containerRect.left + containerRect.width / 2;
    const offset = btnCenter - containerCenter;

    if (Math.abs(offset) > 20) {
      container.scrollBy({ left: offset, behavior: 'smooth' });
    }
  }, [activeTab]);

  return (
    <nav className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-bottom relative">
      {/* Dynamic edge fade indicators */}
      {canScrollLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-background/95 to-transparent" />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background/95 to-transparent" />
      )}

      <div
        ref={scrollRef}
        className="mx-auto flex min-h-16 items-center gap-1 overflow-x-auto px-2 scrollbar-hide"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            ref={(el) => {
              if (el) btnRefs.current.set(id, el);
            }}
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
