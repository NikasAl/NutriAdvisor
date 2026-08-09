'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus, Send, Loader2, Trash2, PenLine, History, PanelLeftClose, PanelLeft,
  Check, X, Pencil, Square,
} from 'lucide-react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import type { ChatSession } from '@/lib/types';

type NutritionPeriod = 'today' | 'week' | 'month';

/** Group sessions by exact date */
function groupSessionsByDate(sessions: ChatSession[]): { label: string; date: string; sessions: ChatSession[] }[] {
  const groupsMap = new Map<string, ChatSession[]>();

  const today = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  for (const session of sessions) {
    const d = new Date(session.lastActivity);
    const dateStr = d.toISOString().split('T')[0];
    if (!groupsMap.has(dateStr)) groupsMap.set(dateStr, []);
    groupsMap.get(dateStr)!.push(session);
  }

  const groups: { label: string; date: string; sessions: ChatSession[] }[] = [];
  const sortedDates = Array.from(groupsMap.keys()).sort().reverse();

  for (const date of sortedDates) {
    let label: string;
    if (date === today) {
      label = 'Сегодня';
    } else if (date === yesterdayDate) {
      label = 'Вчера';
    } else {
      const d = new Date(date + 'T12:00:00');
      label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
    groups.push({ label, date, sessions: groupsMap.get(date)! });
  }

  return groups;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterdayDate) return 'Вчера';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export default function ChatAssistantPanel() {
  const chatSessions = useAppStore((s) => s.chatSessions);
  const currentChatId = useAppStore((s) => s.currentChatId);
  const chatMessages = useAppStore((s) => s.chatMessages);
  const isSending = useAppStore((s) => s.isSending);
  const loadChatSessions = useAppStore((s) => s.loadChatSessions);
  const createChatSession = useAppStore((s) => s.createChatSession);
  const selectChatSession = useAppStore((s) => s.selectChatSession);
  const deleteChatSession = useAppStore((s) => s.deleteChatSession);
  const renameChatSession = useAppStore((s) => s.renameChatSession);
  const resendFromMessage = useAppStore((s) => s.resendFromMessage);
  const sendChatMessage = useAppStore((s) => s.sendChatMessage);
  const stopStreaming = useAppStore((s) => s.stopStreaming);

  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [nutritionPeriod, setNutritionPeriod] = useState<NutritionPeriod>('today');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Editing state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Renaming state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadChatSessions();
  }, [loadChatSessions]);

  // Scroll to bottom on new messages and during streaming chunks
  const streamingContent = useAppStore((s) => s.streamingContent);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, streamingContent]);

  // Auto-focus edit input
  useEffect(() => {
    if (editingMsgId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.selectionStart = editInputRef.current.value.length;
    }
  }, [editingMsgId]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleNewChat = async () => {
    await createChatSession();
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleSelectSession = async (id: string) => {
    await selectChatSession(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isSending) return;
    setInput('');
    setError('');
    try {
      await sendChatMessage(msg, nutritionPeriod);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startEditMessage = (msgId: string, currentContent: string) => {
    setEditingMsgId(msgId);
    setEditingText(currentContent);
  };

  const cancelEdit = () => {
    setEditingMsgId(null);
    setEditingText('');
  };

  const submitEdit = async () => {
    const text = editingText.trim();
    if (!text || !editingMsgId) { cancelEdit(); return; }
    setEditingMsgId(null);
    setEditingText('');
    setError('');
    try {
      await resendFromMessage(editingMsgId, text, nutritionPeriod);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    }
  };

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameText(currentTitle);
  };

  const submitRename = async () => {
    if (!renamingId || !renameText.trim()) { setRenamingId(null); return; }
    await renameChatSession(renamingId, renameText.trim());
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameText('');
  };

  const sessionGroups = useMemo(() => groupSessionsByDate(chatSessions), [chatSessions]);
  const currentSession = chatSessions.find((s) => s.id === currentChatId);

  // Find next user message index after edited message (for context when editing)
  const editingMsgIndex = editingMsgId ? chatMessages.findIndex((m) => m.id === editingMsgId) : -1;
  const isLastUserMsg = editingMsgIndex >= 0 && !chatMessages.slice(editingMsgIndex + 1).some((m) => m.role === 'user');

  return (
    <div className="flex h-full gap-0">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col border-r border-border bg-background md:relative md:translate-x-0 md:shrink-0 md:z-0 transition-transform duration-200`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold truncate">Разговоры</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleNewChat}
              title="Новый разговор"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 md:hidden"
              onClick={() => setSidebarOpen(false)}
              title="Закрыть"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {sessionGroups.length > 0 ? (
            sessionGroups.map((group) => (
              <div key={group.date}>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                    {group.label}
                  </span>
                </div>
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group flex items-center gap-1 px-3 py-2 cursor-pointer transition-colors ${
                      session.id === currentChatId
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-l-2 border-emerald-500'
                        : 'hover:bg-muted border-l-2 border-transparent'
                    }`}
                    onClick={() => {
                      if (renamingId !== session.id) handleSelectSession(session.id);
                    }}
                    onDoubleClick={() => startRename(session.id, session.title)}
                  >
                    {renamingId === session.id ? (
                      <div className="flex-1 flex items-center gap-1">
                        <Input
                          ref={renameInputRef}
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename();
                            if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={submitRename}
                          className="h-7 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs truncate ${
                            session.id === currentChatId
                              ? 'font-medium text-emerald-700 dark:text-emerald-400'
                              : 'text-foreground'
                          }`}>
                            {session.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(session.lastActivity).toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="rounded p-1 hover:bg-muted text-muted-foreground"
                            onClick={(e) => { e.stopPropagation(); startRename(session.id, session.title); }}
                            title="Переименовать"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="rounded p-1 hover:bg-destructive/10 text-destructive"
                                onClick={(e) => e.stopPropagation()}
                                title="Удалить"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить разговор?</AlertDialogTitle>
                                <AlertDialogDescription>Все сообщения будут удалены.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteChatSession(session.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <PenLine className="h-6 w-6 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Нет разговоров</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5 text-xs"
                onClick={handleNewChat}
              >
                <Plus className="h-3.5 w-3.5" />
                Новый разговор
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between mb-1 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSidebarOpen(true)}
                title="Показать панель диалогов"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Контекст:</span>
            </div>
            <div className="flex gap-1">
              {([
                { value: 'today' as const, label: 'Сегодня' },
                { value: 'week' as const, label: 'Неделя' },
                { value: 'month' as const, label: 'Месяц' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNutritionPeriod(opt.value)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    nutritionPeriod === opt.value
                      ? 'bg-emerald-600 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {currentSession && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[40%]">
              {currentSession.title}
            </span>
          )}
        </div>

        {/* Chat messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-1"
          style={{ minHeight: 0 }}
        >
          {!currentChatId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="rounded-full bg-emerald-100 p-4 dark:bg-emerald-900/30">
                <PenLine className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-base font-semibold">AI Помощник по питанию</h3>
              <p className="max-w-xs text-sm text-muted-foreground">
                Создайте новый разговор, чтобы получить персонализированные рекомендации по питанию,
                анализу продуктов и планированию рациона.
              </p>
              <Button onClick={handleNewChat} className="gap-2">
                <Plus className="h-4 w-4" /> Начать разговор
              </Button>
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Задайте вопрос о питании или расскажите, что вы ели сегодня
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' && editingMsgId === msg.id ? (
                    /* Editing mode */
                    <div className="w-[85%] space-y-2 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 p-2.5">
                      <Textarea
                        ref={editInputRef}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="min-h-[44px] max-h-24 resize-none text-sm"
                        rows={2}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {isLastUserMsg ? 'Изменить и отправить заново' : 'Изменить — диалог будет продолжен с этого места'}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={cancelEdit}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700"
                            onClick={submitEdit}
                            disabled={isSending || !editingText.trim()}
                          >
                            {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm group/msg relative ${
                        msg.role === 'user'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap leading-relaxed pr-4">{msg.content}</div>
                      ) : (
                        <MarkdownRenderer content={msg.content} className="text-foreground" />
                      )}
                      <div className="flex items-center justify-between">
                        <div
                          className={`text-[10px] ${
                            msg.role === 'user' ? 'text-emerald-200' : 'text-muted-foreground'
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        {msg.role === 'user' && (
                          <button
                            onClick={() => startEditMessage(msg.id!, msg.content)}
                            className="rounded p-0.5 hover:bg-white/10 transition-opacity text-emerald-200/60 hover:text-emerald-200 md:opacity-0 md:group-hover/msg:opacity-100"
                            title="Редактировать"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isSending && streamingContent && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl bg-muted px-3.5 py-2.5 text-sm relative">
                    <MarkdownRenderer content={streamingContent} className="text-foreground" />
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] text-muted-foreground">Генерация...</span>
                    </div>
                  </div>
                </div>
              )}
              {isSending && !streamingContent && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    <span className="text-sm text-muted-foreground">Думаю...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-0 mt-1 rounded-lg bg-destructive/10 p-2 text-xs text-destructive shrink-0">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">Закрыть</button>
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 border-t bg-background px-0 pt-2 pb-2">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Опишите, что ели, или задайте вопрос..."
              rows={1}
              className="min-h-[44px] max-h-24 resize-none flex-1"
            />
            {isSending ? (
              <Button
                onClick={stopStreaming}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full bg-destructive hover:bg-destructive/90 text-white"
                title="Остановить генерацию"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
