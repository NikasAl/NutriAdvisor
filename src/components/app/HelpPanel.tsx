'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Heart, Brain, Shield, Settings2, Zap,
  BookOpen, Moon, Droplets, UtensilsCrossed, Activity,
  AlertTriangle, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import PrivacyPolicyPanel from './PrivacyPolicyPanel';

/**
 * Illustration placeholder — shows prompt text for future image generation.
 * Replace the <div> content with <img src="/help/xxx.png" /> when ready.
 */
function Illustration({
  prompt,
  alt,
  className = '',
}: {
  prompt: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/20 flex items-center justify-center ${className}`}
    >
      {/* Placeholder — replace with <img> when illustrations are ready */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
        <div className="text-4xl mb-2 opacity-60">🖼️</div>
        <p className="text-[10px] text-muted-foreground leading-tight max-w-[200px] italic">
          {alt}
        </p>
      </div>
      {/* Hidden prompt for developer reference */}
      <span className="sr-only">{prompt}</span>
      {/* Uncomment when image ready:
      <img src={src} alt={alt} className="w-full h-full object-cover" />
      */}
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
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  illustration?: { prompt: string; alt: string };
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
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
              prompt={illustration.prompt}
              alt={illustration.alt}
              className="h-40"
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

export default function HelpPanel({ onBack }: { onBack: () => void }) {
  const [showPrivacy, setShowPrivacy] = useState(false);

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
        prompt="Flat illustration of a healthy lifestyle concept: a person standing on a balance beam between wholesome food (fruits, vegetables, grains), a glowing moon symbolizing good sleep, a water droplet, and a dumbbell representing activity. Warm green and teal color palette, minimalist vector style, no text."
        alt="Здоровый образ жизни: питание, сон, вода, активность"
        className="h-48"
      />

      {/* Section 1: Purpose */}
      <Section
        icon={Heart}
        title="Цель NutriAdvisor"
        defaultOpen={true}
        illustration={{
          prompt: "Warm motivational illustration: a sunrise over a green landscape with silhouettes of people jogging, preparing healthy food in a kitchen, sleeping peacefully in a cozy bed. Soft watercolor style, green and gold tones, uplifting mood, no text.",
          alt: 'Мотивация к здоровому образу жизни',
        }}
      >
        <p>
          <strong>NutriAdvisor</strong> — ваш персональный AI-помощник в поддержании здорового
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
          prompt: "Illustration of AI food analysis: a smartphone screen showing a bowl of salad, with animated data lines flowing from the phone to a glowing brain icon, which outputs nutritional data (calories, proteins, fats, carbs) as floating holographic labels. Modern flat design, emerald and teal palette, no text.",
          alt: 'Нейросеть анализирует питание',
        }}
      >
        <p>
          Для анализа ваших данных NutriAdvisor использует современные языковые модели (LLM).
          Вы фотографируете приём пищи или описываете его текстом, а модель анализирует состав,
          рассчитывает калорийность и даёт рекомендации с учётом вашего профиля и целей.
        </p>

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
          Рекомендуется использовать модели последнего поколения (GPT-4o, Claude 3.5, Gemini 2.5,
          Llama 3.1 и т.д.).
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
            В этом случае данные вообще не покидают ваше устройство.
          </p>
        </div>
      </Section>

      {/* Section 3: Default Provider + Payment */}
      <Section
        icon={Zap}
        title="Провайдер по умолчанию"
        illustration={{
          prompt: "Illustration of a smartphone with a glowing green checkmark, indicating ready-to-use service. A small gift box icon floats nearby, symbolizing free access. Clean minimalist style, emerald green accent color, white background, no text.",
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
            Никаких ограничений на количество запросов. Используйте все функции приложения
            без регистрации и оплаты.
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
          prompt: "Illustration of settings gear icon connected to cloud icons representing different AI providers (OpenAI, Google, Anthropic, local server). Connection lines show data flow. Clean isometric style, blue and green palette, no text.",
          alt: 'Настройка подключений к AI-провайдерам',
        }}
      >
        <p>
          NutriAdvisor поддерживает различные провайдеры нейросетей. Перейдите в раздел
          «Настройки» → «Провайдеры LLM» для добавления и управления подключениями.
        </p>

        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-1">Поддерживаемые типы провайдеров:</h4>
            <ul className="text-xs space-y-1.5 text-muted-foreground">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>OpenAI</strong> — GPT-4o, GPT-4o-mini, o1, o3</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span><strong>Google (DashScope)</strong> — Gemini 2.5 Pro, Flash</span>
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
                предоставляется бесплатно с лимитами. Доступно из РФ без VPN.
              </p>
              <p>
                <strong>OpenRouter:</strong> Зарегистрируйтесь на{' '}
                <span className="text-blue-500">openrouter.ai</span> — работает с VPN,
                поддерживает оплату криптовалютой.
              </p>
              <p>
                <strong>Ollama:</strong> Скачайте с{' '}
                <span className="text-blue-500">ollama.ai</span>, установите и запустите
                модель командой <code className="rounded bg-muted px-1">ollama run gemma3</code>.
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
              (например, <strong>Gemma 3</strong>, <strong>Llama 3.1</strong>, <strong>Qwen 2.5</strong>),
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
          prompt: "Flat illustration showing 4 app features as cards: 1) A fork and knife with a camera icon (food tracking), 2) A water droplet with + and - buttons (hydration), 3) A moon and bed icon (sleep tracking), 4) A running figure with a heart rate icon (activity diary). Modern, clean, rounded corners, green and teal color scheme, no text.",
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

      {/* Section 6: Tips */}
      <Section
        icon={BookOpen}
        title="Советы по использованию"
        illustration={{
          prompt: "Illustration of a person holding a smartphone with a friendly AI assistant on screen giving a thumbs up. Soft pastel colors, encouraging and warm atmosphere, flat illustration style, no text.",
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
            <span>Регулярно записывайте воду и сон — чем полнее данные, тем качественнее анализ.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">5.</span>
            <span>В чате можно задать любой вопрос о питании, попросить составить меню, разобрать свой рацион за неделю и т.д.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-emerald-500">6.</span>
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
        NutriAdvisor v1.0 · Сделано с 💚
      </p>
    </div>
  );
}
