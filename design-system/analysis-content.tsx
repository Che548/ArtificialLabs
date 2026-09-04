import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './components';
import { colors, motion, radii, shadows, spacing } from './tokens';

export type AnalysisPersonalBlockVariant =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type AnalysisPersonalBlockState = 'ready' | 'insufficient';

export type AnalysisReferenceBlockVariant =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

type PersonalBlockProps = {
  variant?: AnalysisPersonalBlockVariant;
  state?: AnalysisPersonalBlockState;
  onPress?: () => void;
};

type ReferenceBlockProps = {
  variant?: AnalysisReferenceBlockVariant;
  onPress?: () => void;
};

const emptyDescriptions: Record<AnalysisPersonalBlockVariant, string> = {
  1: 'Добавьте два результата одного показателя — после этого появится персональная динамика.',
  2: 'Для сравнения нужен как минимум один предыдущий результат этого анализа.',
  3: 'Когда появятся результаты, здесь будет выделен показатель, которому стоит уделить внимание.',
  4: 'Добавьте результаты, чтобы увидеть, какие показатели стабильны, а какие изменились.',
  5: 'Следующий шаг появится после добавления результатов и даты последнего обследования.',
  6: 'Сводка формируется, когда в истории есть несколько показателей из одного обследования.',
  7: 'Новое изменение появится после повторной сдачи одного и того же показателя.',
  8: 'Для истории наблюдения нужны результаты одного показателя за разные даты.',
  9: 'Вопросы для обсуждения формируются только на основе добавленных результатов.',
  10: 'Добавьте результаты анализов — здесь появится короткий персональный вывод.',
};

const referenceArticles = [
  {
    title: 'Как подготовиться к анализу крови',
    category: 'Подготовка',
    duration: '4 мин',
  },
  {
    title: 'Что показывает ферритин',
    category: 'Показатели',
    duration: '6 мин',
  },
  {
    title: 'Какие анализы зависят от дня цикла',
    category: 'Цикл',
    duration: '5 мин',
  },
  {
    title: 'Сколько актуальны результаты обследований',
    category: 'Сроки',
    duration: '3 мин',
  },
] as const;

function Kicker({ children }: { children: string }) {
  return (
    <AppText
      role="caption"
      weight="semibold"
      color={colors.brand.primary}
      style={styles.kicker}
    >
      {children}
    </AppText>
  );
}

function HeaderLine({
  label = 'ПЕРСОНАЛЬНО ДЛЯ ВАС',
  meta,
}: {
  label?: string;
  meta?: string;
}) {
  return (
    <View style={styles.headerLine}>
      <Kicker>{label}</Kicker>
      {meta ? (
        <AppText role="caption" color={colors.text.secondary}>
          {meta}
        </AppText>
      ) : null}
    </View>
  );
}

function TextAction({
  label,
  onPress,
  quiet = false,
}: {
  label: string;
  onPress?: () => void;
  quiet?: boolean;
}) {
  return (
    <Pressable
      cssInterop={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        quiet && styles.textActionQuiet,
        pressed && styles.pressed,
      ]}
    >
      <AppText
        role="label"
        weight="medium"
        color={quiet ? colors.text.primary : colors.brand.primary}
      >
        {label}
      </AppText>
      <AppText
        role="body"
        color={quiet ? colors.text.primary : colors.brand.primary}
      >
        →
      </AppText>
    </Pressable>
  );
}

function EmptyCopy({
  variant,
  onPress,
  compact = false,
}: {
  variant: AnalysisPersonalBlockVariant;
  onPress?: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.emptyCopy, compact && styles.emptyCopyCompact]}>
      <AppText role="heading" weight="semibold">
        Недостаточно данных
      </AppText>
      <AppText
        role={compact ? 'caption' : 'label'}
        color={colors.text.secondary}
      >
        {emptyDescriptions[variant]}
      </AppText>
      <TextAction label="Добавить результаты" onPress={onPress} />
    </View>
  );
}

function ProgressRequirement() {
  return (
    <View style={styles.requirement}>
      <View style={styles.requirementTrack}>
        <View style={styles.requirementFill} />
      </View>
      <View style={styles.requirementLabels}>
        <AppText role="caption" color={colors.text.secondary}>
          Добавлено 0
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          Нужно 2 результата
        </AppText>
      </View>
    </View>
  );
}

function ValuePair({ empty = false }: { empty?: boolean }) {
  return (
    <View style={styles.valuePair}>
      <View style={styles.valueCell}>
        <AppText role="caption" color={colors.text.secondary}>
          12 мая
        </AppText>
        <AppText
          numeric
          role="title"
          weight="medium"
          color={empty ? colors.state.disabled : colors.text.primary}
        >
          {empty ? '—' : '38'}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          нг/мл
        </AppText>
      </View>
      <View style={styles.valuePairArrow}>
        <AppText role="body" color={colors.text.secondary}>
          →
        </AppText>
      </View>
      <View style={[styles.valueCell, styles.valueCellCurrent]}>
        <AppText role="caption" color={colors.text.secondary}>
          8 августа
        </AppText>
        <AppText
          numeric
          role="title"
          weight="medium"
          color={empty ? colors.state.disabled : colors.brand.primary}
        >
          {empty ? '—' : '24'}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          нг/мл
        </AppText>
      </View>
    </View>
  );
}

function MetricRow({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricRowCopy}>
        <AppText role="label" weight="medium">
          {label}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {note}
        </AppText>
      </View>
      <AppText
        numeric
        role="heading"
        weight="medium"
        color={accent ? colors.brand.primary : colors.text.primary}
      >
        {value}
      </AppText>
    </View>
  );
}

function StatusPill({ children }: { children: string }) {
  return (
    <View style={styles.statusPill}>
      <View style={styles.statusDot} />
      <AppText role="caption" weight="medium" color={colors.brand.burgundy}>
        {children}
      </AppText>
    </View>
  );
}

export function AnalysisPersonalBlock({
  variant = 1,
  state = 'ready',
  onPress,
}: PersonalBlockProps) {
  const empty = state === 'insufficient';

  if (variant === 1) {
    return (
      <View style={styles.surface}>
        <HeaderLine meta={empty ? 'Данных пока нет' : 'Обновлено сегодня'} />
        {empty ? (
          <>
            <EmptyCopy variant={variant} onPress={onPress} />
            <ProgressRequirement />
          </>
        ) : (
          <>
            <View style={styles.copyBlock}>
              <AppText role="heading" weight="semibold">
                Ферритин снижается
              </AppText>
              <AppText role="label" color={colors.text.secondary}>
                За три месяца показатель снизился на 14 нг/мл. Значение всё ещё
                находится в референсном диапазоне.
              </AppText>
            </View>
            <ValuePair />
            <TextAction label="Посмотреть динамику" onPress={onPress} />
          </>
        )}
      </View>
    );
  }

  if (variant === 2) {
    return (
      <View style={styles.flatSection}>
        <HeaderLine label="СРАВНЕНИЕ РЕЗУЛЬТАТОВ" />
        {empty ? (
          <>
            <EmptyCopy variant={variant} onPress={onPress} />
            <ValuePair empty />
          </>
        ) : (
          <>
            <View style={styles.copyBlock}>
              <AppText role="title" weight="semibold">
                38 → 24 нг/мл
              </AppText>
              <AppText role="label" color={colors.text.secondary}>
                Ферритин изменился между двумя последними обследованиями.
              </AppText>
            </View>
            <ValuePair />
            <TextAction label="Открыть оба результата" onPress={onPress} />
          </>
        )}
      </View>
    );
  }

  if (variant === 3) {
    return (
      <View style={styles.attentionSurface}>
        <HeaderLine
          label="НА ЧТО ОБРАТИТЬ ВНИМАНИЕ"
          meta={empty ? undefined : '1 изменение'}
        />
        {empty ? (
          <>
            <EmptyCopy variant={variant} onPress={onPress} />
            <ProgressRequirement />
          </>
        ) : (
          <>
            <StatusPill>Динамика требует наблюдения</StatusPill>
            <View style={styles.copyBlock}>
              <AppText role="title" weight="semibold">
                Ферритин стал ниже
              </AppText>
              <AppText role="label" color={colors.text.secondary}>
                Само значение не выходит за пределы референса. Важнее проверить,
                сохранится ли снижение при следующем обследовании.
              </AppText>
            </View>
            <TextAction label="Почему это важно" onPress={onPress} />
          </>
        )}
      </View>
    );
  }

  if (variant === 4) {
    return (
      <View style={styles.surface}>
        <HeaderLine
          label="СВОДКА ПОКАЗАТЕЛЕЙ"
          meta={empty ? undefined : '3 показателя'}
        />
        {empty ? (
          <EmptyCopy variant={variant} onPress={onPress} />
        ) : (
          <>
            <View style={styles.copyBlock}>
              <AppText role="heading" weight="semibold">
                Большинство показателей стабильны
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                По сравнению с предыдущим анализом
              </AppText>
            </View>
            <View style={styles.rowsGroup}>
              <MetricRow
                label="Ферритин"
                value="24"
                note="снизился с 38"
                accent
              />
              <MetricRow
                label="Гемоглобин"
                value="132"
                note="без заметных изменений"
              />
              <MetricRow
                label="Гематокрит"
                value="40%"
                note="без заметных изменений"
              />
            </View>
          </>
        )}
      </View>
    );
  }

  if (variant === 5) {
    return (
      <View style={styles.nextStepSurface}>
        <HeaderLine
          label="СЛЕДУЮЩИЙ ШАГ"
          meta={empty ? undefined : 'До 8 ноября'}
        />
        {empty ? (
          <EmptyCopy variant={variant} onPress={onPress} />
        ) : (
          <>
            <View style={styles.nextStepDate}>
              <AppText
                numeric
                weight="medium"
                color={colors.brand.primary}
                style={styles.bigDate}
              >
                3
              </AppText>
              <View>
                <AppText role="label" weight="medium">
                  месяца
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  до повторного контроля
                </AppText>
              </View>
            </View>
            <View style={styles.copyBlock}>
              <AppText role="heading" weight="semibold">
                Сравнить ферритин повторно
              </AppText>
              <AppText role="label" color={colors.text.secondary}>
                Повторный результат покажет, было ли снижение разовым или
                продолжается.
              </AppText>
            </View>
            <TextAction label="Добавить в план" onPress={onPress} />
          </>
        )}
      </View>
    );
  }

  if (variant === 6) {
    return (
      <View style={styles.flatSection}>
        <HeaderLine label="КРАТКИЙ ОБЗОР" />
        {empty ? (
          <EmptyCopy variant={variant} onPress={onPress} />
        ) : (
          <>
            <AppText role="heading" weight="semibold">
              Последний анализ крови
            </AppText>
            <View style={styles.overviewGrid}>
              <View style={styles.overviewItem}>
                <AppText
                  numeric
                  role="title"
                  weight="medium"
                  color={colors.brand.primary}
                >
                  1
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  показатель изменился
                </AppText>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewItem}>
                <AppText numeric role="title" weight="medium">
                  2
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  остаются стабильными
                </AppText>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewItem}>
                <AppText numeric role="title" weight="medium">
                  0
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  вышли за референс
                </AppText>
              </View>
            </View>
            <TextAction label="Разобрать результат" onPress={onPress} />
          </>
        )}
      </View>
    );
  }

  if (variant === 7) {
    return (
      <View style={styles.surface}>
        <HeaderLine
          label="НОВОЕ ИЗМЕНЕНИЕ"
          meta={empty ? undefined : '8 августа'}
        />
        {empty ? (
          <EmptyCopy variant={variant} onPress={onPress} />
        ) : (
          <View style={styles.largeValueLayout}>
            <View style={styles.largeValueColumn}>
              <AppText
                numeric
                weight="medium"
                color={colors.brand.primary}
                style={styles.largeValue}
              >
                24
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                нг/мл · ферритин
              </AppText>
            </View>
            <View style={styles.largeValueCopy}>
              <AppText role="heading" weight="semibold">
                На 14 ниже прошлого результата
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                Сравнение с анализом от 12 мая
              </AppText>
              <TextAction label="Подробнее" onPress={onPress} />
            </View>
          </View>
        )}
      </View>
    );
  }

  if (variant === 8) {
    const history = [
      ['12 февраля', '42 нг/мл'],
      ['12 мая', '38 нг/мл'],
      ['8 августа', '24 нг/мл'],
    ];
    return (
      <View style={styles.surface}>
        <HeaderLine
          label="ИСТОРИЯ НАБЛЮДЕНИЯ"
          meta={empty ? undefined : '6 месяцев'}
        />
        {empty ? (
          <EmptyCopy variant={variant} onPress={onPress} />
        ) : (
          <>
            <View style={styles.copyBlock}>
              <AppText role="heading" weight="semibold">
                Ферритин
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                Три результата в одной шкале
              </AppText>
            </View>
            <View style={styles.timeline}>
              {history.map(([date, value], index) => (
                <View key={date} style={styles.timelineRow}>
                  <View style={styles.timelineAxis}>
                    <View
                      style={[
                        styles.timelineDot,
                        index === history.length - 1 &&
                          styles.timelineDotCurrent,
                      ]}
                    />
                    {index < history.length - 1 ? (
                      <View style={styles.timelineLine} />
                    ) : null}
                  </View>
                  <AppText role="label" style={styles.timelineDate}>
                    {date}
                  </AppText>
                  <AppText
                    numeric
                    role="label"
                    weight="medium"
                    color={
                      index === history.length - 1
                        ? colors.brand.primary
                        : colors.text.primary
                    }
                  >
                    {value}
                  </AppText>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    );
  }

  if (variant === 9) {
    return (
      <View style={styles.questionSurface}>
        <HeaderLine label="ДЛЯ ОБСУЖДЕНИЯ С ВРАЧОМ" />
        {empty ? (
          <EmptyCopy variant={variant} onPress={onPress} />
        ) : (
          <>
            <AppText role="title" weight="medium">
              «Стоит ли повторить ферритин раньше, если показатель продолжает
              снижаться?»
            </AppText>
            <AppText role="label" color={colors.text.secondary}>
              Вопрос сформирован на основе двух последних результатов. Это не
              медицинская рекомендация.
            </AppText>
            <TextAction label="Открыть результаты" onPress={onPress} quiet />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.minimalPersonal}>
      <HeaderLine meta={empty ? 'Данных пока нет' : 'Последние 3 месяца'} />
      <View style={styles.minimalRule} />
      {empty ? (
        <EmptyCopy variant={variant} onPress={onPress} />
      ) : (
        <>
          <AppText role="title" weight="semibold">
            Один показатель изменился заметнее остальных
          </AppText>
          <AppText role="label" color={colors.text.secondary}>
            Ферритин снизился с 38 до 24 нг/мл. Остальные показатели последнего
            анализа крови остаются стабильными.
          </AppText>
          <TextAction label="Посмотреть анализ" onPress={onPress} />
        </>
      )}
    </View>
  );
}

function ArticleRow({
  article,
  index,
  onPress,
  showIndex = true,
}: {
  article: (typeof referenceArticles)[number];
  index: number;
  onPress?: () => void;
  showIndex?: boolean;
}) {
  return (
    <Pressable
      cssInterop={false}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      onPress={onPress}
      style={({ pressed }) => [styles.articleRow, pressed && styles.pressed]}
    >
      {showIndex ? (
        <AppText
          numeric
          role="caption"
          color={colors.text.secondary}
          style={styles.articleIndex}
        >
          0{index + 1}
        </AppText>
      ) : null}
      <View style={styles.articleCopy}>
        <AppText role="label" weight="medium">
          {article.title}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {article.category} · {article.duration}
        </AppText>
      </View>
      <AppText role="body" color={colors.brand.primary}>
        ›
      </AppText>
    </Pressable>
  );
}

function ArticleList({
  indexes,
  onPress,
  showIndex = true,
}: {
  indexes: number[];
  onPress?: () => void;
  showIndex?: boolean;
}) {
  return (
    <View style={styles.articleList}>
      {indexes.map((index) => (
        <ArticleRow
          key={referenceArticles[index].title}
          article={referenceArticles[index]}
          index={index}
          onPress={onPress}
          showIndex={showIndex}
        />
      ))}
    </View>
  );
}

export function AnalysisReferenceBlock({
  variant = 1,
  onPress,
}: ReferenceBlockProps) {
  if (variant === 1) {
    return (
      <View style={styles.referenceSurface}>
        <HeaderLine label="РЕКОМЕНДОВАНО ПЕРЕД СДАЧЕЙ" meta="4 мин" />
        <View style={styles.featuredArticle}>
          <View style={styles.featuredArticleCopy}>
            <AppText role="title" weight="semibold">
              Как подготовиться к анализу крови
            </AppText>
            <AppText role="label" color={colors.text.secondary}>
              Натощак, вода, нагрузки и лекарства — короткая памятка без лишних
              медицинских терминов.
            </AppText>
          </View>
          <View style={styles.prepWindow}>
            <AppText
              numeric
              weight="medium"
              color={colors.brand.primary}
              style={styles.prepWindowValue}
            >
              8–12
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              часов без еды
            </AppText>
          </View>
        </View>
        <TextAction label="Открыть памятку" onPress={onPress} />
      </View>
    );
  }

  if (variant === 2) {
    return (
      <View style={styles.referenceFlat}>
        <HeaderLine label="СПРАВОЧНЫЕ МАТЕРИАЛЫ" meta="4 материала" />
        <AppText role="heading" weight="semibold">
          Разобраться в анализах
        </AppText>
        <ArticleList indexes={[0, 1, 2, 3]} onPress={onPress} />
      </View>
    );
  }

  if (variant === 3) {
    const steps = [
      'За 8–12 часов не есть',
      'Можно пить чистую воду',
      'Не тренироваться накануне',
      'Уточнить приём лекарств у врача',
    ];
    return (
      <View style={styles.preparationSurface}>
        <HeaderLine label="ПАМЯТКА" meta="Перед анализом крови" />
        <AppText role="heading" weight="semibold">
          Подготовка накануне
        </AppText>
        <View style={styles.checklist}>
          {steps.map((step, index) => (
            <View key={step} style={styles.checkRow}>
              <View style={styles.checkNumber}>
                <AppText
                  numeric
                  role="caption"
                  weight="medium"
                  color={colors.brand.primary}
                >
                  {index + 1}
                </AppText>
              </View>
              <AppText role="label" style={styles.checkText}>
                {step}
              </AppText>
            </View>
          ))}
        </View>
        <TextAction label="Полная инструкция" onPress={onPress} />
      </View>
    );
  }

  if (variant === 4) {
    const terms = [
      [
        'Референс',
        'Диапазон значений, с которым лаборатория сравнивает результат.',
      ],
      ['Динамика', 'Изменение одного показателя между несколькими датами.'],
      [
        'Актуальность',
        'Период, в течение которого результат подходит для конкретной цели.',
      ],
    ];
    return (
      <View style={styles.referenceSurface}>
        <HeaderLine label="СЛОВАРЬ" meta="Простыми словами" />
        <AppText role="heading" weight="semibold">
          Термины в результатах
        </AppText>
        <View style={styles.termList}>
          {terms.map(([term, definition]) => (
            <View key={term} style={styles.termRow}>
              <AppText role="label" weight="semibold" style={styles.termTitle}>
                {term}
              </AppText>
              <AppText
                role="caption"
                color={colors.text.secondary}
                style={styles.termDefinition}
              >
                {definition}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (variant === 5) {
    const questions = [
      'Можно ли пить воду перед анализом?',
      'Почему референсы отличаются в разных лабораториях?',
      'Какие показатели зависят от дня цикла?',
    ];
    return (
      <View style={styles.referenceSurface}>
        <HeaderLine label="ЧАСТЫЕ ВОПРОСЫ" />
        <AppText role="heading" weight="semibold">
          Перед обследованием
        </AppText>
        <View style={styles.questionList}>
          {questions.map((question) => (
            <Pressable
              cssInterop={false}
              key={question}
              accessibilityRole="button"
              accessibilityLabel={question}
              onPress={onPress}
              style={({ pressed }) => [
                styles.questionRow,
                pressed && styles.pressed,
              ]}
            >
              <AppText role="label" weight="medium" style={styles.questionText}>
                {question}
              </AppText>
              <AppText role="body" color={colors.brand.primary}>
                +
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (variant === 6) {
    const path = [
      ['01', 'Подготовиться', 'Что делать накануне и утром'],
      ['02', 'Сдать анализ', 'Как выбрать подходящее время'],
      ['03', 'Прочитать результат', 'На что смотреть в первую очередь'],
    ];
    return (
      <View style={styles.referenceFlat}>
        <HeaderLine label="МАРШРУТ" meta="15 минут" />
        <AppText role="title" weight="semibold">
          От подготовки до результата
        </AppText>
        <View style={styles.pathList}>
          {path.map(([number, title, description], index) => (
            <View key={number} style={styles.pathRow}>
              <View style={styles.pathAxis}>
                <AppText
                  numeric
                  role="caption"
                  weight="medium"
                  color={colors.brand.primary}
                >
                  {number}
                </AppText>
                {index < path.length - 1 ? (
                  <View style={styles.pathLine} />
                ) : null}
              </View>
              <View style={styles.pathCopy}>
                <AppText role="label" weight="semibold">
                  {title}
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  {description}
                </AppText>
              </View>
            </View>
          ))}
        </View>
        <TextAction label="Начать с подготовки" onPress={onPress} />
      </View>
    );
  }

  if (variant === 7) {
    return (
      <View style={styles.referenceSurface}>
        <HeaderLine label="ПО ТЕМАМ" />
        <View style={styles.topicRow}>
          {['Подготовка', 'Показатели', 'Цикл', 'Сроки'].map((topic, index) => (
            <View
              key={topic}
              style={[styles.topicPill, index === 0 && styles.topicPillActive]}
            >
              <AppText
                role="caption"
                weight="medium"
                color={
                  index === 0 ? colors.brand.primary : colors.text.secondary
                }
              >
                {topic}
              </AppText>
            </View>
          ))}
        </View>
        <ArticleList indexes={[0, 3]} onPress={onPress} showIndex={false} />
      </View>
    );
  }

  if (variant === 8) {
    return (
      <View style={styles.contextSurface}>
        <HeaderLine label="К БЛИЖАЙШЕМУ АНАЛИЗУ" meta="До 14 августа" />
        <View style={styles.contextHeading}>
          <View style={styles.contextDate}>
            <AppText
              numeric
              role="title"
              weight="medium"
              color={colors.brand.primary}
            >
              14
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              августа
            </AppText>
          </View>
          <View style={styles.contextCopy}>
            <AppText role="heading" weight="semibold">
              Исследования крови
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              Материалы, которые пригодятся перед сдачей
            </AppText>
          </View>
        </View>
        <ArticleList indexes={[0, 1]} onPress={onPress} showIndex={false} />
      </View>
    );
  }

  if (variant === 9) {
    return (
      <View style={styles.referenceFlat}>
        <HeaderLine label="ПОДБОРКА" meta="3 материала" />
        <AppText role="heading" weight="semibold">
          Разобраться за 15 минут
        </AppText>
        <AppText role="label" color={colors.text.secondary}>
          Короткий маршрут: подготовка, значение показателей и срок актуальности
          результата.
        </AppText>
        <View style={styles.collectionList}>
          {referenceArticles.slice(0, 3).map((article, index) => (
            <View key={article.title} style={styles.collectionRow}>
              <AppText
                numeric
                role="title"
                weight="medium"
                color={colors.brand.primary}
              >
                {index + 1}
              </AppText>
              <View style={styles.collectionCopy}>
                <AppText role="label" weight="medium">
                  {article.title}
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  {article.duration}
                </AppText>
              </View>
            </View>
          ))}
        </View>
        <TextAction label="Открыть подборку" onPress={onPress} />
      </View>
    );
  }

  return (
    <View style={styles.referenceMinimal}>
      <HeaderLine label="СПРАВОЧНИК" meta="12 материалов" />
      <View style={styles.minimalRule} />
      <AppText role="title" weight="semibold">
        Анализы без сложных слов
      </AppText>
      <AppText role="label" color={colors.text.secondary}>
        Подготовка, показатели, сроки и частые вопросы — в одном месте.
      </AppText>
      <View style={styles.referenceCounters}>
        {[
          ['4', 'подготовка'],
          ['5', 'показатели'],
          ['3', 'сроки и цикл'],
        ].map(([value, label]) => (
          <View key={label} style={styles.referenceCounter}>
            <AppText numeric role="heading" weight="medium">
              {value}
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              {label}
            </AppText>
          </View>
        ))}
      </View>
      <TextAction label="Открыть справочник" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: motion.pressedOpacity,
    transform: [{ scale: 0.994 }],
  },
  kicker: {
    letterSpacing: 0.72,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  textAction: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  textActionQuiet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,33,35,0.12)',
    paddingTop: spacing.sm,
  },
  copyBlock: {
    gap: spacing.xs,
  },
  surface: {
    width: 370,
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.surface.raised,
    gap: spacing.md,
    ...shadows.card,
  },
  flatSection: {
    width: 370,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  attentionSurface: {
    width: 370,
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: '#FFF3F7',
    gap: spacing.md,
  },
  nextStepSurface: {
    width: 370,
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.surface.raised,
    gap: spacing.md,
    ...shadows.card,
  },
  questionSurface: {
    width: 370,
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: '#F8F5F6',
    gap: spacing.md,
  },
  minimalPersonal: {
    width: 370,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  minimalRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D9D3D5',
  },
  emptyCopy: {
    gap: spacing.xs,
  },
  emptyCopyCompact: {
    gap: spacing.xxs,
  },
  requirement: {
    gap: spacing.xs,
  },
  requirementTrack: {
    height: 4,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: '#ECE7E9',
  },
  requirementFill: {
    width: 10,
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#D8D0D3',
  },
  requirementLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  valuePair: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  valueCell: {
    flex: 1,
    minHeight: 94,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: '#F6F3F4',
    justifyContent: 'center',
  },
  valueCellCurrent: {
    backgroundColor: '#FFF1F6',
  },
  valuePairArrow: {
    width: 24,
    alignItems: 'center',
  },
  statusPill: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(130,53,55,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.burgundy,
  },
  rowsGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  metricRow: {
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metricRowCopy: {
    flex: 1,
    gap: 2,
  },
  nextStepDate: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  bigDate: {
    fontSize: 54,
    lineHeight: 54,
    letterSpacing: -1.8,
  },
  overviewGrid: {
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#D9D3D5',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  overviewItem: {
    flex: 1,
    gap: spacing.xs,
  },
  overviewDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.sm,
    backgroundColor: '#D9D3D5',
  },
  largeValueLayout: {
    minHeight: 146,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  largeValueColumn: {
    width: 116,
  },
  largeValue: {
    fontSize: 58,
    lineHeight: 60,
    letterSpacing: -2,
  },
  largeValueCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  timeline: {
    gap: 0,
  },
  timelineRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  timelineAxis: {
    width: 16,
    alignItems: 'center',
  },
  timelineDot: {
    width: 8,
    height: 8,
    marginTop: 5,
    borderRadius: 4,
    backgroundColor: '#C9C1C4',
  },
  timelineDotCurrent: {
    backgroundColor: colors.brand.primary,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#D9D3D5',
  },
  timelineDate: {
    flex: 1,
  },
  articleRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  articleIndex: {
    width: 28,
  },
  articleCopy: {
    flex: 1,
    gap: 3,
  },
  articleList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  referenceSurface: {
    width: 370,
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.surface.raised,
    gap: spacing.md,
    ...shadows.card,
  },
  referenceFlat: {
    width: 370,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  referenceMinimal: {
    width: 370,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  featuredArticle: {
    minHeight: 154,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  featuredArticleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  prepWindow: {
    width: 96,
    minHeight: 96,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: '#FFF1F6',
    justifyContent: 'center',
  },
  prepWindowValue: {
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: -0.8,
  },
  preparationSurface: {
    width: 370,
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: '#FFF3F7',
    gap: spacing.md,
  },
  checklist: {
    gap: spacing.xs,
  },
  checkRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    flex: 1,
  },
  termList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  termRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
    flexDirection: 'row',
    gap: spacing.md,
  },
  termTitle: {
    width: 102,
  },
  termDefinition: {
    flex: 1,
  },
  questionList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  questionRow: {
    minHeight: 66,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  questionText: {
    flex: 1,
  },
  pathList: {
    gap: 0,
  },
  pathRow: {
    minHeight: 66,
    flexDirection: 'row',
    gap: spacing.md,
  },
  pathAxis: {
    width: 28,
    alignItems: 'center',
  },
  pathLine: {
    flex: 1,
    width: 1,
    marginTop: spacing.xs,
    backgroundColor: '#D9D3D5',
  },
  pathCopy: {
    flex: 1,
    gap: 2,
  },
  topicRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  topicPill: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: '#F1EDEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicPillActive: {
    backgroundColor: '#FFF1F6',
  },
  contextSurface: {
    width: 370,
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.surface.raised,
    gap: spacing.md,
    ...shadows.card,
  },
  contextHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  contextDate: {
    width: 78,
    minHeight: 78,
    borderRadius: radii.md,
    backgroundColor: '#FFF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  collectionList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D9D3D5',
  },
  collectionRow: {
    minHeight: 66,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D9D3D5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  collectionCopy: {
    flex: 1,
    gap: 2,
  },
  referenceCounters: {
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#D9D3D5',
    flexDirection: 'row',
    gap: spacing.md,
  },
  referenceCounter: {
    flex: 1,
    gap: spacing.xxs,
  },
});
