'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
  Plus, Send, Loader2, MessageSquare, Trash2, PenLine,
} from 'lucide-react';

export default function ChatAssistantPanel() {
  const chatSessions = useAppStore((s) => s.chatSessions);
  const currentChatId = useAppStore((s) => s.currentChatId);
  const chatMessages = useAppStore((s) => s.chatMessages);
  const isSending = useAppStore((s) => s.isSending);
  const loadChatSessions = useAppStore((s) => s.loadChatSessions);
  const createChatSession = useAppStore((s) => s.createChatSession);
  const selectChatSession = useAppStore((s) => s.selectChatSession);
  const deleteChatSession = useAppStore((s) => s.deleteChatSession);
  const sendChatMessage = useAppStore((s) => s.sendChatMessage);

  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChatSessions();
  }, [loadChatSessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isSending]);

  const handleNewChat = async () => {
    await createChatSession();
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isSending) return;
    setInput('');
    setError('');
    try {
      await sendChatMessage(msg);
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

  const currentSession = chatSessions.find((s) => s.id === currentChatId);

  return (
    <>
      {/* Chat area — fills space between top padding and input bar */}
      <div
        ref={scrollRef}
        className="overflow-y-auto px-1"
        style={{ height: 'calc(100vh - 16rem)' }}
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
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-muted'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  <div
                    className={`mt-1 text-[10px] ${
                      msg.role === 'user' ? 'text-emerald-200' : 'text-muted-foreground'
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
            {isSending && (
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
        <div className="mx-4 mt-1 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Закрыть</button>
        </div>
      )}

      {/* Input bar — fixed above bottom nav */}
      <div className="fixed bottom-16 left-0 right-0 z-30 border-t bg-background px-4 py-2">
        <div className="mx-auto flex max-w-lg gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Опишите, что ели, или задайте вопрос..."
            rows={1}
            className="min-h-[44px] max-h-24 resize-none flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sessions dialog */}
      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent className="max-h-[70vh]">
          <DialogHeader>
            <DialogTitle>Разговоры</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto max-h-[50vh]">
            {chatSessions.map((session) => (
              <Card
                key={session.id}
                className={`cursor-pointer transition-all ${
                  session.id === currentChatId
                    ? 'border-emerald-500'
                    : 'hover:border-muted-foreground/30'
                }`}
                onClick={() => {
                  selectChatSession(session.id);
                  setSessionsOpen(false);
                }}
              >
                <CardContent className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{session.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(session.lastActivity).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
                </CardContent>
              </Card>
            ))}
            {chatSessions.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Нет разговоров</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Закрыть</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
