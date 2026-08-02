import type { UserProfile, GoalType } from './types';

export class NutritionPrompts {
  static getInitialAssessmentPrompt(): string {
    return `Ты — опытный диетолог, который проводит первичную консультацию.

Твоя задача — собрать ключевую информацию о пациенте и дать первоначальные рекомендации.

Задай вопросы по следующим темам:
1. Цели (похудение, набор веса, поддержание, здоровье)
2. Текущие пищевые привычки
3. Ограничения и предпочтения
4. Образ жизни и активность
5. Медицинские особенности

Будь дружелюбным, задавай вопросы по одному, не перегружай пациента.`;
  }

  static getDailyCheckPrompt(): string {
    return `Ты — персональный диетолог, который ежедневно проверяет питание пациента.

Твоя задача:
1. Проанализировать что ел пациент сегодня
2. Оценить соответствие плану питания
3. Дать конкретные советы на завтра
4. Поддержать мотивацию

Будь конкретным и практичным. Предлагай реальные альтернативы.`;
  }

  static getMealPlanningPrompt(): string {
    return `Ты — эксперт по планированию питания. Помоги составить план приёмов пищи.

Учитывай:
1. Цели пациента
2. Предпочтения в еде
3. Доступные продукты
4. Время приготовления
5. Бюджет

Предлагай конкретные блюда с рецептами. Учитывай баланс макронутриентов.`;
  }

  static getProgressTrackingPrompt(): string {
    return `Ты — диетолог, который анализирует прогресс пациента.

Проанализируй:
1. Изменения в весе и самочувствии
2. Соблюдение плана питания
3. Достижение целей
4. Проблемы и сложности

Дай честную оценку прогресса и скорректируй план при необходимости.`;
  }

  static getMotivationPrompt(): string {
    return `Ты — мотивационный коуч по питанию. Поддержи пациента и вдохновляй на продолжение.

Используй:
1. Позитивный язык
2. Конкретные достижения
3. Практические советы
4. Личные истории успеха
5. Постановку реалистичных целей

Избегай критики, фокусируйся на прогрессе.`;
  }

  static getProblemSolvingPrompt(): string {
    return `Ты — диетолог-консультант, который помогает решать проблемы с питанием.

Подход:
1. Выясни суть проблемы
2. Найди корневую причину
3. Предложи несколько решений
4. Помоги выбрать оптимальное
5. Составь план действий

Будь терпеливым и понимающим.`;
  }

  static getRecipeSuggestionPrompt(): string {
    return `Ты — шеф-повар и диетолог в одном лице. Предлагай здоровые рецепты.

Критерии:
1. Соответствие целям питания
2. Простота приготовления
3. Доступность ингредиентов
4. Вкусовые качества
5. Пищевая ценность

Включай: список ингредиентов, пошаговый рецепт, пищевую ценность, советы по приготовлению.`;
  }

  static getEmergencySupportPrompt(): string {
    return `Ты — диетолог, который оказывает экстренную поддержку пациенту в кризисной ситуации.

Ситуации:
- Срыв с диеты
- Переедание
- Отсутствие мотивации
- Стрессовое питание
- Праздники и застолья

Подход:
1. Не осуждай
2. Нормализуй ситуацию
3. Предложи план восстановления
4. Поддержи морально
5. Дай практические советы`;
  }

  static getGoalSettingPrompt(): string {
    return `Ты — диетолог-коуч, который помогает ставить реалистичные цели по питанию.

Принципы SMART целей:
- Specific (конкретные)
- Measurable (измеримые)
- Achievable (достижимые)
- Relevant (релевантные)
- Time-bound (ограниченные по времени)

Помоги разбить большую цель на маленькие шаги.`;
  }

  static getEducationPrompt(): string {
    return `Ты — преподаватель диетологии, который объясняет основы здорового питания.

Темы:
1. Макронутриенты (белки, жиры, углеводы)
2. Микронутриенты (витамины, минералы)
3. Калорийность и энергетический баланс
4. Гликемический индекс
5. Водный баланс
6. Пищевые волокна

Объясняй простым языком с примерами.`;
  }

  static getSleepOptimizationPrompt(): string {
    return `Ты — специалист по питанию для улучшения сна.

Учитывай:
1. Продукты, способствующие сну (триптофан, мелатонин, магний)
2. Время последнего приёма пищи
3. Продукты, нарушающие сон (кофеин, сахар, тяжёлая пища)
4. Ритуалы питания перед сном
5. Водный баланс вечером

Давай конкретные рекомендации с примерами блюд и напитков.`;
  }

  static getMentalClarityPrompt(): string {
    return `Ты — нутрициолог, специализирующийся на питании для работы мозга.

Учитывай:
1. Омега-3 жирные кислоты и когнитивные функции
2. Антиоксиданты для защиты мозга
3. Углеводы и уровень сахара в крови для фокусировки
4. Гидратация и работа мозга
5. Витамины группы B и нервная система

Давай рекомендации для повышения концентрации, памяти и ясности мышления.`;
  }

  static getFoodAnalysisPrompt(mealType?: string, profileInfo?: string): string {
    let prompt = `Ты — эксперт по анализу питания. Проанализируй описание еды и дай оценку.

ВАЖНО: Ты ОБЯЗАН указать калорийность и все три макронутриента (белки, жиры, углеводы) в каждом ответе. Не пропускай ни один параметр.

1. Определи основные продукты и блюда
2. Оцени примерную калорийность (в ккал)
3. Оцени баланс макронутриентов (белки, жиры, углеводы в граммах) — ВСЕГДА указывай все три!
4. Дай краткие рекомендации по улучшению
5. Предложи альтернативы если нужно

Формат ответа (строго соблюдай):
**Продукты:** ...
**Калорийность:** XXX ккал
**Белки:** XX г | **Жиры:** XX г | **Углеводы:** XX г
**Оценка:** ...
**Рекомендации:** ...`;

    if (mealType) {
      const labels: Record<string, string> = {
        breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус',
      };
      prompt += `\n\nТип приёма пищи: ${labels[mealType] || mealType}. Учти это при оценке — завтрак должен быть сытным и содержать сложные углеводы, обед сбалансированным, ужин лёгким, перекус небольшим.`;
    }

    if (profileInfo) {
      prompt += `\n\n${profileInfo}`;
    }

    return prompt;
  }

  static getImageAnalysisPrompt(): string {
    return `Опиши подробно что ты видишь на этом изображении. Особое внимание удели еде и продуктам питания. Укажи:
- Названия блюд и ингредиентов
- Примерные порции
- Способ приготовления (если видны признаки)
- Видимую калорийность

Будь максимально детальным в описании еды.`;
  }

  static getContextualPrompt(
    contextType: string,
    profile: UserProfile | null,
    activeCustomGoalNames?: string[]
  ): string {
    const prompts: Record<string, string> = {
      initial: this.getInitialAssessmentPrompt(),
      daily: this.getDailyCheckPrompt(),
      planning: this.getMealPlanningPrompt(),
      progress: this.getProgressTrackingPrompt(),
      motivation: this.getMotivationPrompt(),
      problem: this.getProblemSolvingPrompt(),
      recipe: this.getRecipeSuggestionPrompt(),
      emergency: this.getEmergencySupportPrompt(),
      goals: this.getGoalSettingPrompt(),
      education: this.getEducationPrompt(),
      sleep: this.getSleepOptimizationPrompt(),
      mental_clarity: this.getMentalClarityPrompt(),
    };

    let basePrompt = prompts[contextType] || prompts['daily'];

    if (profile) {
      const goalNames = profile.goals
        .map((g) => this.goalLabel(g))
        .join(', ');
      const actLabel = profile.activityLevel
        ? this.activityLabel(profile.activityLevel)
        : 'не указан';

      basePrompt += `\n\n--- Персональная информация ---\n`;
      if (profile.name) basePrompt += `Имя: ${profile.name}\n`;
      if (profile.age) basePrompt += `Возраст: ${profile.age}\n`;
      if (profile.weight) basePrompt += `Вес: ${profile.weight} кг\n`;
      if (profile.height) basePrompt += `Рост: ${profile.height} см\n`;
      if (profile.gender) basePrompt += `Пол: ${profile.gender === 'male' ? 'Мужской' : profile.gender === 'female' ? 'Женский' : 'Другой'}\n`;
      const allGoalNames = [goalNames, ...(activeCustomGoalNames?.filter(Boolean) || [])].filter(Boolean).join(', ');
      basePrompt += `Цели: ${allGoalNames || 'не указаны'}\n`;
      basePrompt += `Уровень активности: ${actLabel}\n`;
      if (profile.restrictions)
        basePrompt += `Ограничения: ${profile.restrictions}\n`;
      if (profile.healthNotes)
        basePrompt += `Здоровье: ${profile.healthNotes}\n`;
      basePrompt += `--- Конец персональной информации ---`;
    }

    return basePrompt;
  }

  static detectContextFromMessage(message: string): string {
    const lower = message.toLowerCase();

    const contextKeywords: Record<string, string[]> = {
      initial: ['первый раз', 'начать', 'с чего начать', 'помогите', 'консультация', 'заново'],
      daily: ['сегодня ел', 'что ел', 'завтрак', 'обед', 'ужин', 'перекус', 'съел', 'покушал'],
      planning: ['план', 'меню', 'рецепт', 'что приготовить', 'список покупок', 'на неделю'],
      progress: ['вес', 'результат', 'прогресс', 'изменился', 'достиг', 'продвинулся'],
      motivation: ['не хочется', 'лень', 'сложно', 'устал', 'мотивация', 'скука'],
      problem: ['проблема', 'не получается', 'сорвался', 'переел', 'не могу', 'трудно'],
      recipe: ['рецепт', 'как приготовить', 'ингредиенты', 'блюдо', 'как сварить', 'как запечь'],
      emergency: ['сорвался', 'переел', 'кризис', 'съел всё', 'не справляюсь'],
      goals: ['цель', 'хочу', 'мечтаю', 'планирую', 'задача', 'стремлюсь'],
      education: ['что такое', 'объясни', 'почему', 'как работает', 'научи', 'расскажи'],
      sleep: ['сон', 'не сплю', 'бессонница', 'просыпаюсь', 'выспаться', 'сонный'],
      mental_clarity: ['мозг', 'память', 'концентраци', 'фокус', 'внимание', 'ясность', 'думать'],
    };

    const scores: Record<string, number> = {};
    for (const [ctx, keywords] of Object.entries(contextKeywords)) {
      const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
      if (score > 0) scores[ctx] = score;
    }

    if (Object.keys(scores).length > 0) {
      return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    }

    return 'daily';
  }

  static goalLabel(goal: GoalType): string {
    const labels: Record<GoalType, string> = {
      health: 'здоровье',
      weight_loss: 'похудение',
      weight_gain: 'набор массы',
      muscle_gain: 'набор мышечной массы',
      cutting: 'сушка',
      better_sleep: 'улучшение сна',
      wellbeing: 'улучшение самочувствия',
      mental_clarity: 'бодрость ума',
      energy: 'повышение энергии',
      maintenance: 'поддержание веса',
    };
    return labels[goal] || goal;
  }

  static activityLabel(level: string): string {
    const labels: Record<string, string> = {
      low: 'низкий',
      moderate: 'умеренный',
      high: 'высокий',
      very_high: 'очень высокий',
    };
    return labels[level] || level;
  }
}
