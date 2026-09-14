export const TODAY_ARTICLE_LIMIT = 40;
export const TODAY_MARKDOWN_LIMIT = 20_000;
export type TodayCoverPreset = 'nutrition' | 'care-plan';
export type TodayCardKind = 'article' | 'care-plan';
export type TodayContent = {
  id: string;
  cardTitle: string;
  cardKind: TodayCardKind;
  coverPreset: TodayCoverPreset;
  sortOrder: number;
  title: string;
  intro: string;
  sections: ReadonlyArray<{ title: string; text: string }>;
};

export function defaultArticleMarkdown(article: TodayContent) {
  return [
    article.intro,
    ...article.sections.map(
      (section) => `## ${section.title}\n\n${section.text}`,
    ),
  ].join('\n\n');
}

export function todayCardTitle(
  article: { cardTitle: string; cardKind: TodayCardKind },
  checkupCount: number,
) {
  return article.cardKind === 'care-plan'
    ? `${article.cardTitle.replace(/\n/g, ' ')}\n${checkupCount ? `Пунктов: ${checkupCount}` : 'пока пуст'}`
    : article.cardTitle;
}

export const defaultTodayArticles: readonly TodayContent[] = [
  {
    id: 'nutrition',
    coverPreset: 'nutrition',
    cardKind: 'article',
    sortOrder: 0,
    cardTitle: 'Заполнить\nпитание\nза сегодня',
    title: 'Питание в дневнике',
    intro:
      'Короткая запись о питании помогает сохранить контекст дня и вернуться к нему позже.',
    sections: [
      {
        title: 'Начните с простого',
        text: 'Отметьте в дневнике то, что считаете важным: как проходили приёмы пищи, менялся ли аппетит, какие ощущения вы заметили. Не нужно превращать каждую запись в подробный отчёт.',
      },
      {
        title: 'Записывайте наблюдения',
        text: 'Описывайте свой опыт без оценок «хорошо» или «плохо». Если хотите обсудить питание на приёме, сохранённые записи помогут вспомнить конкретные вопросы.',
      },
      {
        title: 'Возвращайтесь к записям',
        text: 'Открывайте дневник за нужную дату, чтобы посмотреть отметки. Записи описывают ваши наблюдения и сами по себе не устанавливают причину изменений самочувствия.',
      },
    ],
  },
  {
    id: 'care-plan',
    coverPreset: 'care-plan',
    cardKind: 'care-plan',
    sortOrder: 1,
    cardTitle: 'План\nнаблюдения',
    title: 'Как устроен план наблюдения',
    intro:
      'План в Сфере собирает рекомендации и помогает ориентироваться в их сроках и результатах.',
    sections: [
      {
        title: 'Посмотрите подробности',
        text: 'В разделе «Анализы» откройте интересующую карточку. В ней можно посмотреть рекомендуемый срок, пояснение и сведения о рекомендации.',
      },
      {
        title: 'Сохраните результат',
        text: 'Когда у вас появится результат, прикрепите к соответствующей карточке фото или файл. Проверьте выбранное вложение перед сохранением.',
      },
      {
        title: 'Уточняйте план',
        text: 'Рекомендация приложения не заменяет медицинское назначение. Необходимость исследования, подготовку к нему и сроки обсуждайте с врачом. В карточке можно уточнить срок или отказаться от рекомендации.',
      },
    ],
  },
];
