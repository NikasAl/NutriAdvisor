'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Shield, Database, Cloud, Lock, Eye } from 'lucide-react';

export default function PrivacyPolicyPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold">Политика конфиденциальности</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4 text-sm leading-relaxed text-foreground/90">
          <p className="text-xs text-muted-foreground">
            Последнее обновление: август 2026 г.
          </p>

          <Separator />

          {/* 1. Overview */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">1. Общие положения</h2>
            </div>
            <p>
              NutriAdvisor (далее — «Приложение») является клиентским приложением для контроля
              питания, активности и сна с использованием искусственного интеллекта.
              Приложение разработано с приоритетом конфиденциальности пользователя.
            </p>
            <p>
              Настоящая Политика описывает, какие данные собираются, как они используются
              и как обеспечивается их защита.
            </p>
          </section>

          {/* 2. Local Data Storage */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold">2. Локальное хранение данных</h2>
            </div>
            <p>
              Все персональные данные пользователя (профиль, записи о питании, воде, сне,
              дневник активности, история чатов) хранятся <strong>исключительно на устройстве
              пользователя</strong> в локальной базе данных (IndexedDB через Dexie.js).
            </p>
            <p>
              Приложение <strong>не отправляет</strong> эти данные на собственные серверы разработчика
              и <strong>не создаёт</strong> учётные записи или профили пользователей на стороне сервера.
            </p>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                ✓ Приложение не имеет собственного сервера хранения данных
              </p>
            </div>
          </section>

          {/* 3. AI Provider Data */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-purple-500" />
              <h2 className="text-sm font-semibold">3. Передача данных провайдерам AI</h2>
            </div>
            <p>
              Для работы функций анализа и чата Приложение отправляет пользовательские данные
              (описания приёмов пищи, фотографии, профиль, записи дневника) на серверы
              выбранного пользователем провайдера нейросетей (OpenAI, Google, OpenRouter и др.).
            </p>
            <p>
              <strong>Разработчик NutriAdvisor не контролирует</strong> обработку данных на серверах
              третьих провайдеров. Передача данных происходит по инициативе и с согласия
              пользователя при использовании функций анализа.
            </p>
            <p>
              Каждый провайдер имеет собственную политику конфиденциальности. Рекомендуем
              ознакомиться с ними перед использованием.
            </p>
          </section>

          {/* 4. Default Provider */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold">4. Провайдер по умолчанию (kreagenium.ru)</h2>
            </div>
            <p>
              Приложение поставляется с предустановленным провайдером kreagenium.ru для
              обеспечения немедленной функциональности. При использовании этого провайдера
              данные отправляются на серверы kreagenium.ru в соответствии с их политикой
              конфиденциальности.
            </p>
            <p>
              Пользователь может в любой момент отключить провайдер по умолчанию и настроить
              собственный провайдер, включая полностью локальные решения.
            </p>
          </section>

          {/* 5. Local AI */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">5. Полная конфиденциальность</h2>
            </div>
            <p>
              Для обеспечения полной конфиденциальности рекомендуется использовать локально
              развёрнутые модели нейросетей через инструменты:
            </p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500">•</span>
                <span><strong>Ollama</strong> (ollama.ai) — простой инструмент для запуска локальных LLM</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500">•</span>
                <span><strong>llama.cpp</strong> — эффективный запуск LLM на CPU/GPU</span>
              </li>
            </ul>
            <p>
              При использовании локальных моделей данные <strong>не покидают устройство пользователя</strong>
              и не передаются по сети. Это обеспечивает максимальный уровень конфиденциальности.
            </p>
          </section>

          {/* 6. Payments */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold">6. Платежи</h2>
            </div>
            <p>
              В настоящее время Приложение <strong>полностью бесплатно</strong> и не требует
              оплаты. Серверные модели предоставляются без ограничений.
            </p>
            <p>
              В случае введения платных функций в будущем, все платёжные операции будут
              осуществляться через сторонние сервисы (ЮMoney и др.) в соответствии
              с их политиками конфиденциальности. Приложение не будет хранить
              и не обрабатывать данные банковских карт или платёжных систем.
            </p>
          </section>

          {/* 7. Data Control */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-teal-500" />
              <h2 className="text-sm font-semibold">7. Управление данными</h2>
            </div>
            <p>
              Пользователь имеет полный контроль над своими данными:
            </p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500">•</span>
                <span>Экспорт всех данных в JSON-файл (Настройки → Экспорт данных)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500">•</span>
                <span>Импорт данных из резервной копии</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500">•</span>
                <span>Удаление отдельных записей или полная очистка данных</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500">•</span>
                <span>Очистка данных браузера (Settings → Clear site data) полностью удаляет все данные приложения</span>
              </li>
            </ul>
          </section>

          {/* 8. Analytics */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">8. Аналитика и телеметрия</h2>
            </div>
            <p>
              Приложение <strong>не собирает</strong> телеметрические данные, не использует системы
              аналитики (Google Analytics, Яндекс.Метрика и т.д.) и не отслеживает
              поведение пользователя.
            </p>
          </section>

          {/* 9. Children */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">9. Дети</h2>
            <p>
              Приложение не предназначено для детей младше 13 лет. Разработчик не собирает
              сознательно данные лиц младше 13 лет.
            </p>
          </section>

          {/* 10. Changes */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">10. Изменения политики</h2>
            <p>
              Разработчик оставляет за собой право обновлять настоящую Политику. Актуальная
              версия всегда доступна в разделе «О приложении» → «Политика конфиденциальности».
            </p>
          </section>

          {/* 11. Contact */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">11. Связь с разработчиком</h2>
            <p>
              По вопросам, связанным с конфиденциальностью и обработкой данных,
              обращайтесь через раздел «Профиль» в приложении или на GitHub-странице проекта.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
