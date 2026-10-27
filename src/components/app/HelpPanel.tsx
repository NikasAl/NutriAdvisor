'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Heart, Brain, Shield, Settings2, Zap,
  BookOpen, Moon, Droplets, UtensilsCrossed, Activity,
  AlertTriangle, ExternalLink, ChevronDown, ChevronUp,
  Flame, GlassWater, BedDouble, Dumbbell, TrendingUp,
  Camera, MessageSquare, ScanSearch,
} from 'lucide-react';
import PrivacyPolicyPanel from './PrivacyPolicyPanel';

/** Illustration — displays an optimized image from /help/ */
function Illustration({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full rounded-xl overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-auto"
        loading="lazy"
      />
    </div>
  );
}

/** Collapsible section */
function Section({
  icon: Icon,
  title,
  children,
  illustration,
  defaultOpen = false,
  sectionId,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  illustration?: { src: string; alt: string };
  defaultOpen?: boolean;
  sectionId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden help-section-card" data-section={sectionId}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
          <Icon className="h-5 w-5 text-emerald-600" />
        </div>
        <span className="flex-1 font-semibold text-sm">{title}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {illustration && (
            <Illustration
              src={illustration.src}
              alt={illustration.alt}
            />
          )}
          <div className="text-sm leading-relaxed text-foreground/90 space-y-3">
            {children}
          </div>
        </div>
      )}
    </Card>
  );
}

export type HelpSection = 'about' | 'calories' | 'water' | 'sleep' | 'workouts' | 'stats';

export default function HelpPanel({ onBack, initialSection }: { onBack: () => void; initialSection?: HelpSection }) {
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Scroll to specified section on mount
  useEffect(() => {
    if (!initialSection || initialSection === 'about') return;
    const timer = setTimeout(() => {
      const card = document.querySelector(`.help-section-card[data-section="${initialSection}"]`) as HTMLElement;
      if (card) {
        const btn = card.querySelector('button') as HTMLElement;
        if (btn) btn.click();
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [initialSection]);

  if (showPrivacy) {
    return <PrivacyPolicyPanel onBack={() => setShowPrivacy(false)} />;
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold">О приложении</h1>
      </div>

      {/* Hero illustration */}
      <Illustration
        src="/help/hero.png"
        alt="Здоровый образ жизни: питание, сон, вода, активность"
      />

      {/* Section 1: Purpose */}
      <Section
        icon={Heart}
        title="Цель Дневника Здоровья"
        defaultOpen={true}
        illustration={{
          src: '/help/purpose.png',
          alt: 'Мотивация к здоровому образу жизни',
        }}
      >
        <p>
          <strong>Дневник Здоровья</strong> — ваш персональный AI-помощник в поддержании здорового
          образа жизни. Приложение объединяет контроль питания, физической активности, сна
          и гидратации в единый удобный дневник.
        </p>
        <p>
          Главная цель — не просто считать калории, а помочь вам осознанно строить привычки,
          которые ведут к лучшему самочувствию. С учётом ваших индивидуальных целей, медицинских
          показаний и ограничений приложение предоставляет персонализированные рекомендации
          на основе анализа данных нейросетями.
        </p>
        <p>
          Все ваши данные хранятся <strong>локально на устройстве</strong> — приложение не отправляет
          их на собственный сервер и не создаёт профили пользователей.
        </p>
      </Section>

      {/* Section 2: AI Analysis */}
      <Section
        icon={Brain}
        title="Как работает анализ"
        illustration={{
          src: '/help/analysis.png',
          alt: 'Нейросеть анализирует питание',
        }}
      >
        <p>
          Для анализа ваших данных Дневник Здоровья использует современные языковые модели (LLM).
          Вы фотографируете приём пищи или описываете его текстом, а модель анализирует состав,
          рассчитывает калорийность и даёт рекомендации с учётом вашего профиля и целей.
        </p>

        <div className="space-y-2 mt-2">
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Фото еды</strong> — сфотографируйте приём пищи, и модель распознает продукты,
              оценит порции и рассчитает КБЖУ.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Фото продукта из магазина</strong> — в чате сфотографируйте упаковку
              прямо из приложения (значок камеры) или прикрепите фото из галереи и спросите
              «Можно ли мне такое есть?» — модель определит продукт, проанализирует состав,
              КБЖУ и совместимость с вашим профилем, целями и ограничениями.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Анализ продуктов</strong> — специализированный инструмент на странице
              «Продукты» (третий таб): прикрепите фото упаковки — модель сама считает название,
              состав и КБЖУ, даст вердикт «стоит ли это есть» и сохранит анализ в приложении,
              чтобы вы могли вернуться к нему позже. Можно выбрать продукт из каталога
              или ввести состав вручную.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Текстовое описание</strong> — опишите приём пищи словами, и модель рассчитает
              примерную калорийность с учётом порции.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Важно: нейросети могут ошибаться
            </p>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Результаты анализа — это не медицинская рекомендация и не точная истина.
            Относитесь к ним как к мнению знающего друга-энциклопедиста: он хорошо разбирается
            в теме, но может что-то забыть, сказать примерно или даже ошибиться в деталях.
          </p>
        </div>

        <p>
          Чем современнее и мощнее выбранная вами модель, тем точнее и полезнее будет анализ.
          Рекомендуется использовать модели последнего поколения (GPT, Claude, Gemini и т.д.).
        </p>

        <Separator className="my-3" />

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">Конфиденциальность данных</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Приложение не хранит данные на своём сервере. Однако для работы с чатом и анализом
            ваши записи отправляются на сервер выбранного провайдера (OpenAI, Google и т.д.).
            Политика конфиденциальности каждого провайдера может отличаться.
          </p>
          <p className="text-xs text-muted-foreground">
            Для полной конфиденциальности используйте <strong>локально развернутые модели</strong>
             через такие инструменты как{' '}
            <span className="font-medium">Ollama</span> или <span className="font-medium">llama.cpp</span>.
            В этом случае данные вообще не покидают вашу локальную сеть.
          </p>
        </div>
      </Section>

      {/* Section 3: Default Provider + Payment */}
      <Section
        icon={Zap}
        title="Провайдер по умолчанию"
        illustration={{
          src: '/help/provider.png',
          alt: 'Приложение готово к работе сразу после установки',
        }}
      >
        <p>
          Чтобы приложение было функциональным сразу после установки, предустановлен провайдер
          по умолчанию — <strong>NuAdvi Proxy</strong> (kreagenium.ru). Вы можете начать пользоваться
          AI-анализом, чатом и отслеживанием питания без настройки собственного API-ключа.
        </p>
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-1">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Полностью бесплатно
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-500">
            В данный момент нет ограничений на количество запросов. Используйте все функции приложения
            без регистрации и оплаты. Но учитывайте, что сеть может быть загружена.
          </p>
        </div>
        <p>
          При желании вы можете подключить собственный провайдер — OpenAI, OpenRouter,
          Google AI Studio или локальную модель (Ollama, llama.cpp) для полной конфиденциальности.
        </p>
      </Section>

      {/* Section 4: Provider Setup Guide */}
      <Section
        icon={Settings2}
        title="Настройка провайдеров"
        illustration={{
          src: '/help/settings.png',
          alt: 'Настройка подключений к AI-провайдерам',
        }}
      >
        <p>
          Дневник Здоровья позволяет задать любого провайдера нейросетей, который поддерживает протокол OpenAI API. Перейдите в раздел
          «Настройки» → «Провайдеры LLM» для добавления и управления подключениями.
        </p>

        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-1">Типы провайдеров:</h4>
            <ul className="text-xs space-y-1.5 text-muted-foreground">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>OpenAI</strong> — GPT-4o, GPT-4o-mini, o1, o3</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>Google</strong> — Gemini 2.5 Pro, Flash</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>OpenRouter</strong> — агрегатор множества моделей</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>Ollama</strong> — локальные модели на своём компьютере</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>llama.cpp</strong> — локальные модели через HTTP-сервер</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>Custom</strong> — любой совместимый с OpenAI API</span>
              </li>
            </ul>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-1">Как получить API-ключ:</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <strong>OpenAI:</strong> Зарегистрируйтесь на{' '}
                <span className="text-blue-500">platform.openai.com</span>, перейдите в
                API Keys → Create new secret key. Для пользователей из России потребуется
                VPN и иностранная банковская карта.
              </p>
              <p>
                <strong>Google AI Studio:</strong> Перейдите на{' '}
                <span className="text-blue-500">aistudio.google.com</span> — API-ключ
                предоставляется бесплатно с лимитами. Доступно из РФ также с VPN.
              </p>
              <p>
                <strong>OpenRouter:</strong> Зарегистрируйтесь на{' '}
                <span className="text-blue-500">openrouter.ai</span> — работает с VPN,
                поддерживает оплату криптовалютой.
              </p>
              <p>
                <strong>Ollama:</strong> Скачайте с{' '}
                <span className="text-blue-500">ollama.ai</span>, установите и запустите
                модель командой <code className="rounded bg-muted px-1">ollama run gemma4</code>.
                Ключ не нужен — работает полностью локально!
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-1">Локальные модели (без интернета)</h4>
            <p className="text-xs text-muted-foreground">
              Для полной конфиденциальности и бесплатной работы рекомендуем локальные модели.
              Установите <strong>Ollama</strong> или <strong>llama.cpp</strong>, скачайте модель
              (например, <strong>Gemma 4</strong>, <strong>Qwen 3.8</strong>),
              и укажите адрес сервера в настройках провайдера.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Типичный адрес Ollama: <code className="rounded bg-muted px-1">http://localhost:11434/v1</code>
            </p>
          </div>
        </div>
      </Section>

      {/* Section 5: Key Features */}
      <Section
        icon={UtensilsCrossed}
        title="Возможности приложения"
        illustration={{
          src: '/help/features.png',
          alt: 'Основные функции приложения',
        }}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <UtensilsCrossed className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Контроль питания</p>
              <p className="text-xs text-muted-foreground">
                Записывайте приёмы пищи текстом или по фото. AI проанализирует КБЖУ,
                учитывая ваш профиль, цели и ограничения. Поддерживается каталог продуктов
                и блюд с составом ингредиентов.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <Droplets className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Трекинг воды</p>
              <p className="text-xs text-muted-foreground">
                Отслеживайте количество выпитой воды. Настраиваемый объём стакана (100–500 мл),
                цель 2000 мл в день. Данные учитываются в AI-анализе.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <Moon className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Учёт сна</p>
              <p className="text-xs text-muted-foreground">
                Записывайте время засыпания и пробуждения, включая дневной сон.
                Приложение рассчитывает общую продолжительность и передаёт данные
                для анализа в чат.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <Dumbbell className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Тренировки</p>
              <p className="text-xs text-muted-foreground">
                Записывайте тренировки с упражнениями (вес, повторения, подходы).
                Drag & drop для смены порядка упражнений. Каталог упражнений по группам мышц.
                AI анализирует тренировку и даёт рекомендации по объёму и восстановлению.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <Camera className="h-5 w-5 text-violet-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Анализ фото продукта из магазина</p>
              <p className="text-xs text-muted-foreground">
                В чате прикрепите фото упаковки или витрины и спросите «Можно ли мне такое есть?».
                Модель определит продукт, разберёт состав и КБЖУ, сопоставит с вашим профилем,
                целями и ограничениями и даст развёрнутый ответ — стоит ли употреблять
                этот продукт и в каком количестве.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <ScanSearch className="h-5 w-5 text-teal-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Анализ продуктов и блюд</p>
              <p className="text-xs text-muted-foreground">
                Отдельный инструмент на странице «Продукты» (таб «Анализ продуктов»):
                сфотографируйте упаковку или готовое блюдо — модель сама определит, что это,
                считает состав и КБЖУ и даст структурированный вердикт (подходит /
                с осторожностью / не рекомендую), риски и рекомендации. Есть режимы
                «Из каталога» (продукты и блюда с пересчётом на вес порции) и «Свой продукт».
                Все анализы сохраняются в списке с поиском.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <TrendingUp className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Статистика</p>
              <p className="text-xs text-muted-foreground">
                Оценка качества каждого дня по 100-балльной шкале на основе калорий,
                белка, тренировки, воды и сна. ИИ-анализ дня с персональными рекомендациями.
                Сводка за неделю/месяц с мини-графиком качества.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <Activity className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Дневник активности</p>
              <p className="text-xs text-muted-foreground">
                Ведите записи о физической активности, самочувствии и давлении.
                Все данные интегрируются в AI-контекст для персонализированных рекомендаций.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Section 5.5: Product Analysis tool */}
      <Section
        icon={ScanSearch}
        title="Анализ продуктов"
      >
        <p>
          «Анализ продуктов» — специализированный инструмент, который развивает сценарий
          «можно ли купить этот продукт» в отдельную функцию. Основной способ — анализ по фото:
          сфотографируйте упаковку в магазине, и модель сама считает название, состав и КБЖУ.
          Каждый продукт оценивается с точки зрения того, стоит ли его употреблять именно вам —
          с учётом вашего профиля, целей и состояния здоровья. Все выполненные анализы
          сохраняются в приложении вместе с фотографиями, чтобы вы могли вернуться
          к ним позже.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Где находится:</strong> страница «Продукты» → третий таб «Анализ продуктов»
              (отдельная строка под табами «Продукты» и «Блюда»).
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Как запустить:</strong> нажмите кнопку «Новый анализ». Основной способ —
              режим «Фото»: сфотографируйте упаковку прямо из приложения (кнопка
              «Сфотографировать») или выберите одно-два фото из галереи (лицевая сторона,
              этикетка с составом, таблица пищевой ценности) и нажмите «Анализировать».
              Модель сама считает название, состав и КБЖУ с фотографий — набирать текст
              не нужно, название можно не вводить. Переключатель «Продукт (упаковка) /
              Блюдо (готовое)» подскажет модели, что на снимке. Также доступны режимы
              «Из каталога» и «Свой продукт» — название, состав (ингредиенты) и при желании
              пищевая ценность на 100 г.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Анализ по фото:</strong> снимайте этикетку крупным планом при хорошем
              освещении — так модель точнее прочитает состав. Если какая-то часть фото
              нечитаема, модель честно об этом скажет и попросит проверить этикетку.
              Фотографии сохраняются вместе с анализом — их можно посмотреть,
              открыв карточку. Для распознавания фото включите «Поддержка Vision»
              в настройках активного провайдера — без неё приложение предложит
              ввести продукт вручную.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Какие данные используются:</strong> модель получает данные вашего профиля —
              цели, ограничения и заметки о здоровье, медицинские показатели (если вы вели
              их в разделе «Анализы»), а также возраст, вес, рост и уровень активности.
              Эти данные сопоставляются с составом и КБЖУ продукта.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Анализ блюд:</strong> анализировать можно не только продукты, но и блюда
              из вашего каталога. В режиме «Из каталога» переключитесь на «Блюдо», выберите
              блюдо и укажите вес порции — состав порции пересчитается пропорционально
              (как при добавлении блюда в дневник питания). К блюду можно приложить фото
              (камера или галерея) — оно сохранится с анализом и поможет модели точнее
              учесть способ приготовления. В режиме «Фото» можно и просто снять готовое
              блюдо: переключатель «Продукт (упаковка) / Блюдо (готовое)». Такие анализы
              помечаются значком «Блюдо» в списке.
            </p>
          </div>
        </div>

        <Separator className="my-3" />

        <p className="font-medium">Как читать вердикты</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 shrink-0">Подходит</span>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
              продукт совместим с вашими целями и здоровьем — может присутствовать в рационе регулярно.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2.5">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400 shrink-0">С осторожностью</span>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
              допустим, но с ограничениями по порции или частоте, либо содержит спорные компоненты.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 p-2.5">
            <span className="text-sm font-medium text-rose-700 dark:text-rose-400 shrink-0">Не рекомендую</span>
            <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
              противоречит вашим целям, содержит для вас аллергены или явно вредные компоненты.
            </p>
          </div>
        </div>

        <p>
          Нажмите на карточку анализа, чтобы раскрыть полный текст: разбор состава и питательности,
          конкретные риски (ингредиенты, добавки, сахар, соль, аллергены), рекомендации по количеству
          и заменам, а также блок «Почему это важно именно для вас». Свежие анализы отображаются
          вверху списка; удалять анализ можно кнопкой «Удалить» внутри раскрытой карточки.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Поиск:</strong> поле поиска над списком фильтрует анализы по названию продукта,
              краткой сводке и вердикту — без учёта регистра. При смене таба поиск сбрасывается.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Резервная копия:</strong> анализы включаются в экспорт и импорт бэкапа
              вместе с остальными данными приложения.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Медицинский дисклеймер
            </p>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Вердикты анализа продуктов носят информационный характер и не заменяют консультацию
            врача или диетолога. При аллергиях, хронических заболеваниях или во время лечения
            принимайте решения о питании только вместе со специалистом.
          </p>
        </div>
      </Section>

      {/* Section 6: Calories Widget */}
      <Section
        icon={Flame}
        title="Виджет «Калории за сегодня»"
        sectionId="calories"
        illustration={{
          src: '/help/calories.png',
          alt: 'Виджет калорий на главной экране',
        }}
      >
        <p>
          Виджет «Калории за сегодня» — основной инструмент контроля рациона на главной странице.
          Он показывает, сколько калорий вы уже употребили за день и сколько осталось до вашей цели.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Прогресс-бар</strong> — зелёная полоса показывает долю от дневной нормы.
              Когда вы приближаетесь к цели, полоса заполняется. Превышение отображается оранжевым цветом.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>КБЖУ</strong> — под калориями отображается количество белков, жиров и углеводов
              в граммах. Нажмите на виджет, чтобы перейти к разделу «Питание» с подробным журналом.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Как считается цель</strong> — норма калорий рассчитывается по формуле Mifflin-St Jeor
              с учётом вашей активности и цели (похудение, поддержание, набор). Заполните профиль
              в разделе «Профиль» для точного расчёта.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Учёт тренировок</strong> — если за сегодня записана тренировка, калории,
              потраченные на неё, вычитаются из съеденных: нетто = съедено − сожжено.
              Оранжевая строка под числом показывает расшифровку. Прогресс-бар отражает
              нетто-калории относительно цели.
            </p>
          </div>
        </div>

        <p>
          Каждый раз когда вы записываете приём пищи (текстом или по фото через AI-анализ),
          калории и КБЖУ автоматически добавляются к дневному итогу. Чем точнее вы описываете
          порцию, тем точнее подсчёт.
        </p>
      </Section>

      {/* Section 7: Water Widget */}
      <Section
        icon={GlassWater}
        title="Виджет «Вода»"
        sectionId="water"
        illustration={{
          src: '/help/water.png',
          alt: 'Трекинг употребления воды',
        }}
      >
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 space-y-1 mb-3">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
            Почему важно пить достаточно воды?
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-500">
            Вода участвует во всех обменных процессах: регулирует температуру тела, транспортирует
            питательные вещества, поддерживает работу пищеварения и почек. Недостаток воды снижает
            концентрацию, вызывает усталость и может провоцировать переедание, поскольку жажда
            часто маскируется под голод. Рекомендуемая норма — около 2000 мл в день, но потребность
            возрастает при физической активности и в жаркую погоду.
          </p>
        </div>

        <p>
          Виджет «Вода» на главной странице помогает легко отслеживать употребление воды
          в течение дня с помощью счётчика стаканов.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Объём стакана</strong> — нажмите на значок шестерёнки рядом с виджетом,
              чтобы настроить объём одного стакана (от 100 до 500 мл). По умолчанию — 200 мл.
              Укажите объём вашей привычной кружки или стакана.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Как отмечать</strong> — удобнее всего отмечать стакан в приложении сразу после
              того, как в реальности вы допили очередной стакан воды. Нажмите кнопку «+», и счётчик
              увеличится на один стакан. Если случайно добавили лишний — нажмите «−» для отмены.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Дневная цель</strong> — по умолчанию 2000 мл (10 стаканов по 200 мл).
              Прогресс отображается полосой и числом выпитых стаканов. Данные воды учитываются
              AI при анализе вашего рациона и самочувствия.
            </p>
          </div>
        </div>
      </Section>

      {/* Section 8: Sleep Widget */}
      <Section
        icon={BedDouble}
        title="Виджет «Сон»"
        sectionId="sleep"
        illustration={{
          src: '/help/sleep.png',
          alt: 'Отслеживание режима сна',
        }}
      >
        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 p-3 space-y-1 mb-3">
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
            Почему важно высыпаться?
          </p>
          <p className="text-xs text-indigo-600 dark:text-indigo-500">
            Качественный сон — фундамент здоровья. Во сне организм восстанавливается,
            синтезирует гормоны роста и регулирует аппетит (грелин и лептин). Недостаток сна
            повышает уровень кортизола, стимулирует накопление жира и снижает чувствительность
            к инсулину. Исследования показывают, что люди, спящие менее 7 часов, набирают вес
            в среднем на 30% быстрее. Оптимальная продолжительность — 7–9 часов для взрослых.
          </p>
        </div>

        <p>
          Виджет «Сон» на главной странице помогает отслеживать продолжительность сна.
          Записывайте время засыпания и пробуждения, и приложение рассчитает общий период сна.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Как отмечать сон</strong> — перед сном, когда тушите свет и ложитесь спать,
              откройте приложение и запишите время отхода ко сну. Утром, сразу после пробуждения,
              отметьте время пробуждения. Приложение рассчитает продолжительность автоматически.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Дневной сон</strong> — если вы спите днём, добавьте отдельный период через
              кнопку «Добавить». Все периоды суммируются для отображения общего времени сна за день.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Целевой показатель</strong> — ориентир составляет 8 часов (480 минут).
              Прогресс-бар показывает, насколько ваш сон приближается к норме. Данные сна
              передаются в AI-контекст и учитываются при рекомендациях по питанию и режиму.
            </p>
          </div>
        </div>
      </Section>

      {/* Section: Workouts */}
      <Section
        icon={Dumbbell}
        title="Тренировки"
        sectionId="workouts"
      >
        <p>
          Раздел «Тренировки» позволяет вести полноценный журнал тренировок.
          Каждая тренировка привязана к дате, содержит название, длительность,
          сожжённые калории и набор упражнений с указанием веса, повторений и подходов.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-rose-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Каталог упражнений</strong> — предустановленные упражнения по группам мышц
              (грудь, спина, ноги, руки, плечи, пресс). Можно добавлять свои упражнения.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-rose-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Drag & drop</strong> — упражнения в форме редактирования можно перетаскивать
              для смены порядка. На десктопе зажмите мышью, на мобильных — long-press + перетаскивание.
              Порядок сохраняется и при повторном открытии формы.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-rose-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>ИИ-анализ</strong> — AI оценивает объём и интенсивность тренировки,
              даёт рекомендации по восстановлению и прогрессии нагрузки.
            </p>
          </div>
        </div>
      </Section>

      {/* Section: Statistics */}
      <Section
        icon={TrendingUp}
        title="Статистика"
        sectionId="stats"
      >
        <p>
          Раздел «Статистика» — ваш обзор качества здоровья за период. Каждый день
          получает оценку от 0 до 100 баллов на основе пяти факторов.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Факторы оценки</strong> — Калории (0–30), Белок (0–15), Тренировка (0–20),
              Вода (0–15), Сон (0–20). Шкалы заполняются пропорционально фактическому значению
              относительно цели (например, Сон 6.7ч/8ч → 84% заполнения).
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>ИИ-анализ дня</strong> — нажмите кнопку ✨ рядом с оценкой дня, и AI
              сгенерирует развёрнутый анализ с учётом питания, тренировок, воды, сна и давления.
              Анализ сохраняется и доступен при повторном входе на страницу.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <p className="text-sm">
              <strong>Период и навигация</strong> — просмотр за неделю или месяц с пейджингом.
              Мини-график качества показывает цветную полосу оценок за каждый день.
            </p>
          </div>
        </div>
      </Section>

      {/* Section 9: Tips */}
      <Section
        icon={BookOpen}
        title="Советы по использованию"
        illustration={{
          src: '/help/tips.png',
          alt: 'AI-ассистент помогает разобраться',
        }}
      >
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">1.</span>
            <span>Начните с заполнения профиля — это поможет AI давать более точные рекомендации с учётом вашего возраста, веса, целей и ограничений.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">2.</span>
            <span>При фото-анализе старайтесь, чтобы еда была хорошо видна и освещена. Дополнительное текстовое описание повышает точность.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">3.</span>
            <span>Используйте тип приёма пищи (завтрак/обед/ужин/перекус) — это помогает AI учитывать распределение калорий в течение дня.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">4.</span>
            <span>Записывайте тренировки с упражнениями — это поможет AI анализировать не только питание, но и физическую нагрузку, давая рекомендации по восстановлению и прогрессии.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">5.</span>
            <span>Регулярно записывайте воду и сон — чем полнее данные, тем качественнее анализ дня на странице Статистика.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">6.</span>
            <span>В чате можно задать любой вопрос о питании и тренировках, попросить составить меню или план тренировок, разобрать свой рацион за неделю и т.д.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">7.</span>
            <span>Для лучших результатов используйте современные модели. Локальные модели удобны для приватности, облачные — для точности.</span>
          </li>
        </ul>
      </Section>

      {/* Privacy Policy link */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Политика конфиденциальности</p>
                <p className="text-xs text-muted-foreground">Узнайте, как обрабатываются ваши данные</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600"
              onClick={() => setShowPrivacy(true)}
            >
              Открыть →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Version */}
      <p className="text-center text-[10px] text-muted-foreground pt-2">
        Дневник Здоровья v1.0 · Сделано с 💚
      </p>
    </div>
  );
}
