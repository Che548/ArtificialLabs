export const ANALYSIS_CATALOG_VERSION = '2026-08-20-v1' as const;

export type AnalysisCatalogRiskFlag =
  'invasive' | 'radiation' | 'contrast' | 'genetic' | 'procedure';

export type AnalysisCatalogEntry = {
  key: string;
  category: string;
  title: string;
  specimen: string;
  schedulingGuidance: string;
  purpose: string;
  riskTier: 'low' | 'clinician' | 'high';
  requiresClinician: boolean;
  riskFlags: AnalysisCatalogRiskFlag[];
  constraints: string[];
  illustrationKey?: string;
};

type GeneratedAnalysisCatalogEntry = Omit<AnalysisCatalogEntry, 'constraints'>;

// Curated from the user-supplied catalogue. It is reference data, not a
// schedule and never overrides confirmed clinician or user dates.
const generatedAnalysisCatalog: GeneratedAnalysisCatalogEntry[] = [
  {
    key: 'blood-count',
    category: 'Исследования крови',
    title: 'Общий анализ крови',
    specimen: 'Венозную или капиллярную кровь',
    schedulingGuidance:
      'По симптомам, при беременности, перед отдельными вмешательствами или по назначению. Результат отражает состояние на дату забора',
    purpose:
      'Выявить анемию, воспалительные изменения и нарушения клеточного состава крови',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['procedure'],
    illustrationKey: 'blood-tubes',
  },
  {
    key: 'catalog-13b9fcd436cb',
    category: 'Исследования крови',
    title: 'Лейкоцитарная формула и СОЭ',
    specimen: 'Кровь, обычно одновременно с общим анализом',
    schedulingGuidance:
      'Вместе с ОАК или для контроля назначенного лечения; универсального срока актуальности нет',
    purpose:
      'Дополнительно оценить воспалительный, инфекционный или гематологический процесс',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-e6c8fa40c266',
    category: 'Исследования крови',
    title: 'Ретикулоциты и мазок периферической крови',
    specimen: 'Кровь',
    schedulingGuidance: 'При анемии или изменениях ОАК; повтор — по назначению',
    purpose:
      'Уточнить причину анемии, морфологию клеток и реакцию костного мозга',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-4b025828eed3',
    category: 'Исследования крови',
    title: 'Обмен железа',
    specimen:
      'Кровь: ферритин, железо, трансферрин, ОЖСС, насыщение трансферрина',
    schedulingGuidance:
      'При обильных менструациях, беременности, слабости, выпадении волос или анемии. Контроль после лечения — по плану врача',
    purpose: 'Обнаружить и оценить дефицит железа',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-64a9002d6f10',
    category: 'Исследования крови',
    title: 'Витамин B12 и фолиевая кислота',
    specimen: 'Кровь',
    schedulingGuidance:
      'При анемии, неврологических симптомах, ограничительном питании, беременности или планировании',
    purpose: 'Выявить дефициты, влияющие на кроветворение и нервную систему',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-26af859e7153',
    category: 'Исследования крови',
    title: 'Витамин D и минеральный обмен',
    specimen: 'Кровь: 25(OH)D, кальций, фосфор, магний, иногда паратгормон',
    schedulingGuidance:
      'По показаниям или для контроля терапии; не задавать обязательный ежегодный срок всем пользователям',
    purpose: 'Оценить отдельные нарушения костного и минерального обмена',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-1cb59c774d23',
    category: 'Исследования крови',
    title: 'Глюкоза',
    specimen: 'Кровь, часто натощак',
    schedulingGuidance:
      'По профилактическому плану, при беременности, симптомах или факторах риска. Актуальна на момент забора',
    purpose: 'Выявить нарушения углеводного обмена',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-78b42c5b47cc',
    category: 'Исследования крови',
    title: 'Гликированный гемоглобин HbA1c',
    specimen: 'Кровь',
    schedulingGuidance:
      'По плану скрининга или контроля диабета; отражает среднюю глюкозу примерно за 2–3 месяца',
    purpose: 'Оценить длительный контроль сахара',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-fe07e7b21de2',
    category: 'Исследования крови',
    title: 'Инсулин и С-пептид',
    specimen: 'Кровь; подготовка зависит от диагностической задачи',
    schedulingGuidance:
      'Только по назначению; не использовать как универсальный скрининг «инсулинорезистентности»',
    purpose: 'Уточнить выработку инсулина и причины нарушений глюкозы',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-d5b6346c7146',
    category: 'Исследования крови',
    title: 'Функция почек и электролиты',
    specimen: 'Кровь: креатинин, расчётная СКФ, мочевина, натрий, калий, хлор',
    schedulingGuidance:
      'При заболеваниях почек, гипертонии, беременности, приёме влияющих препаратов или перед контрастом',
    purpose: 'Оценить фильтрацию почек и водно-солевой баланс',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['contrast'],
  },
  {
    key: 'catalog-444756632f31',
    category: 'Исследования крови',
    title: 'Печёночные показатели',
    specimen: 'Кровь: АЛТ, АСТ, билирубин, ГГТ, щелочная фосфатаза, альбумин',
    schedulingGuidance:
      'При симптомах, беременности, заболевании печени или контроле лекарств',
    purpose: 'Оценить повреждение печени, холестаз и её синтетическую функцию',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-3cf168dd7dc5',
    category: 'Исследования крови',
    title: 'Липидный профиль',
    specimen:
      'Кровь: общий холестерин, ЛПНП, ЛПВП, триглицериды; иногда ApoB и липопротеин(а)',
    schedulingGuidance:
      'По возрасту и сердечно-сосудистому риску; повтор после изменения терапии — по плану врача',
    purpose: 'Оценить риск атеросклероза и эффективность лечения',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-c40284b762fb',
    category: 'Исследования крови',
    title: 'Коагулограмма',
    specimen: 'Кровь: протромбиновое время, МНО, АЧТВ, фибриноген',
    schedulingGuidance:
      'Перед отдельными вмешательствами, при кровотечении, тромбозе, беременности или приёме антикоагулянтов',
    purpose: 'Оценить отдельные звенья свёртывания крови',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['procedure'],
  },
  {
    key: 'catalog-4fdc2e6f6285',
    category: 'Исследования крови',
    title: 'D-димер',
    specimen: 'Кровь',
    schedulingGuidance:
      'Только при клиническом подозрении на тромбоз; актуальность быстро меняется вместе с состоянием',
    purpose: 'Помочь исключить тромбоз в подходящем диагностическом алгоритме',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-18469f83cee5',
    category: 'Исследования крови',
    title: 'Расширенное исследование тромбофилии',
    specimen:
      'Кровь: антитромбин III, протеины C/S, волчаночный антикоагулянт, антифосфолипидные антитела',
    schedulingGuidance:
      'По показаниям; часть показателей нельзя корректно оценивать при остром тромбозе, беременности или на фоне антикоагулянтов',
    purpose: 'Уточнить приобретённые и наследственные факторы тромбоза',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-54b64609059d',
    category: 'Исследования крови',
    title: 'Тиреоидный профиль',
    specimen: 'Кровь: ТТГ, свободный Т4, реже Т3 и антитела',
    schedulingGuidance:
      'При симптомах, беременности, планировании или заболевании щитовидной железы',
    purpose:
      'Оценить функцию щитовидной железы и возможный аутоиммунный процесс',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-96b04b09731a',
    category: 'Исследования крови',
    title: 'Репродуктивные гормоны',
    specimen:
      'Кровь: ФСГ, ЛГ, эстрадиол, прогестерон, пролактин, тестостерон, ГСПГ, ДГЭА-S и другие',
    schedulingGuidance:
      'Фаза цикла зависит от показателя и задачи. Не назначать единой панелью без цели; точное окно задаёт врач',
    purpose:
      'Исследовать причины нарушений цикла, овуляции, гиперандрогении и бесплодия',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-c0d3e389d095',
    category: 'Исследования крови',
    title: 'Антимюллеров гормон',
    specimen: 'Кровь',
    schedulingGuidance:
      'Обычно допустим любой день цикла; интерпретация только вместе с возрастом, анамнезом и УЗИ',
    purpose: 'Косвенно оценить овариальный резерв, но не «общую фертильность»',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-b9e79ec65a03',
    category: 'Исследования крови',
    title: 'ХГЧ в крови',
    specimen: 'Кровь',
    schedulingGuidance:
      'При задержке или подозрении на беременность; повтор в динамике — только в назначенный срок',
    purpose:
      'Подтвердить беременность и при необходимости оценить изменение ХГЧ',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-01ae5a8abd45',
    category: 'Исследования крови',
    title: 'Маркеры воспаления и ревматологические тесты',
    specimen:
      'Кровь: СРБ, ревматоидный фактор, ANA, anti-dsDNA, anti-CCP, ANCA, C3/C4',
    schedulingGuidance:
      'По симптомам и назначению; не использовать как массовый бессимптомный скрининг',
    purpose: 'Помочь диагностировать и контролировать аутоиммунные заболевания',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-bca9d9ca5805',
    category: 'Исследования крови',
    title: 'Аллергологические исследования',
    specimen:
      'Кровь: общий и специфические IgE, компонентные аллергены, триптаза',
    schedulingGuidance:
      'После оценки симптомов; повтор только при изменении клинической задачи',
    purpose: 'Оценить вероятную сенсибилизацию к аллергенам',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-1deec2835b19',
    category: 'Исследования крови',
    title: 'Серология инфекций',
    specimen: 'Кровь на антитела или антигены',
    schedulingGuidance:
      'С учётом даты контакта и диагностического окна; ранний отрицательный тест может потребовать повторения',
    purpose:
      'Выявить инфекцию, иммунный ответ или иммунитет — в зависимости от теста',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-982a0926ab46',
    category: 'Исследования крови',
    title: 'Онкомаркеры',
    specimen: 'Кровь: CA-125, CA 15-3, CA 19-9, РЭА, АФП и другие',
    schedulingGuidance:
      'Только по показаниям или для контроля установленного заболевания; не ставить ежегодный дедлайн здоровым пользователям',
    purpose:
      'Дополнить диагностику или наблюдать известное заболевание; не использовать как самостоятельный скрининг рака',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-f4d17410048e',
    category: 'Исследования мочи',
    title: 'Общий анализ мочи',
    specimen: 'Свежую среднюю порцию мочи',
    schedulingGuidance:
      'По симптомам, при беременности или по назначению; результат отражает состояние на момент сбора',
    purpose:
      'Выявить признаки инфекции, крови, белка, глюкозы и заболеваний мочевой системы',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-7394eeabb42d',
    category: 'Исследования мочи',
    title: 'Микроскопия осадка',
    specimen: 'Порцию мочи, обычно из того же образца',
    schedulingGuidance: 'Вместе с общим анализом или при его отклонениях',
    purpose: 'Уточнить клетки, цилиндры, кристаллы и микроорганизмы',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-605c65f73a54',
    category: 'Исследования мочи',
    title: 'Анализ по Нечипоренко',
    specimen: 'Среднюю порцию мочи',
    schedulingGuidance:
      'После неоднозначного общего анализа или по назначению; не нужен как регулярный скрининг',
    purpose: 'Количественно оценить эритроциты, лейкоциты и цилиндры',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-87db864b6c5c',
    category: 'Исследования мочи',
    title: 'Анализ по Зимницкому',
    specimen: 'Несколько порций мочи, собранных по временным интервалам',
    schedulingGuidance: 'В назначенные врачом сутки',
    purpose: 'Оценить способность почек концентрировать и разводить мочу',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-eb26ba76bc0a',
    category: 'Исследования мочи',
    title: 'Суточная моча',
    specimen: 'Всю мочу за установленный 24-часовой период',
    schedulingGuidance: 'В конкретные сутки по инструкции лаборатории',
    purpose:
      'Измерить суточное выделение белка, гормонов, электролитов и других веществ',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-27032cca95cd',
    category: 'Исследования мочи',
    title: 'Альбумин/креатинин мочи',
    specimen: 'Разовую порцию мочи',
    schedulingGuidance:
      'При диабете, гипертонии, заболевании почек или беременности — по индивидуальному графику',
    purpose: 'Обнаружить раннюю потерю альбумина и поражение почек',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-73b35fb729c9',
    category: 'Исследования мочи',
    title: 'Белок в моче',
    specimen: 'Разовую или суточную мочу',
    schedulingGuidance:
      'При отёках, заболеваниях почек и по акушерскому плану во время беременности',
    purpose: 'Выявить и количественно оценить потерю белка',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-f0e7a68f8f44',
    category: 'Исследования мочи',
    title: 'Посев мочи',
    specimen: 'Среднюю порцию, собранную стерильно',
    schedulingGuidance:
      'При симптомах — желательно до антибиотика; повтор зависит от результата и клиники',
    purpose: 'Найти бактерии и определить чувствительность к антибиотикам',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-a559a3e0de3c',
    category: 'Исследования мочи',
    title: 'ПЦР мочи на инфекции',
    specimen: 'Первую порцию или другой образец по инструкции теста',
    schedulingGuidance:
      'После риска заражения или при симптомах; окно зависит от инфекции',
    purpose: 'Обнаружить генетический материал возбудителя',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-e18d4e3bf88e',
    category: 'Исследования мочи',
    title: 'Тест на беременность в моче',
    specimen: 'Свежую мочу',
    schedulingGuidance:
      'Обычно с первого дня задержки или по инструкции; при сохраняющейся задержке отрицательный тест повторяют',
    purpose: 'Определить наличие ХГЧ и вероятную беременность',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-8b3ea74ad9e0',
    category: 'Исследования мочи',
    title: 'Глюкоза и кетоны в моче',
    specimen: 'Разовую порцию мочи',
    schedulingGuidance:
      'При симптомах, диабете, беременности или остром заболевании; актуальность краткосрочная',
    purpose: 'Выявить глюкозурию или кетоз',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-6b6850b09a4c',
    category: 'Исследования мочи',
    title: 'Клиренс креатинина',
    specimen: 'Суточную мочу и кровь на креатинин',
    schedulingGuidance: 'Сбор за строго определённые 24 часа',
    purpose: 'Рассчитать фильтрационную функцию почек в отдельных ситуациях',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-06bf6dc35dc6',
    category: 'Исследования мочи',
    title: 'Метанефрины или свободный кортизол',
    specimen: 'Суточную мочу либо другой образец по протоколу',
    schedulingGuidance:
      'В назначенные сутки с соблюдением ограничений лаборатории',
    purpose: 'Диагностировать отдельные заболевания надпочечников',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-21af42b1aadf',
    category: 'Исследования мочи',
    title: 'Цитология мочи',
    specimen: 'Свежие порции мочи по инструкции',
    schedulingGuidance: 'При крови в моче или по плану уролога',
    purpose: 'Найти атипичные клетки мочевыводящих путей',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-3dbdddc1d103',
    category: 'Исследования мочи',
    title: 'Анализ мочевого камня',
    specimen: 'Сам камень или его фрагмент',
    schedulingGuidance: 'После выхода или удаления камня',
    purpose:
      'Определить состав и подобрать профилактику повторного образования',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-ae6947610130',
    category: 'Исследования кала и пищеварения',
    title: 'Копрограмма',
    specimen: 'Небольшую порцию свежего кала',
    schedulingGuidance:
      'При симптомах и по назначению; фиксированного срока повторения нет',
    purpose: 'Ориентировочно оценить пищеварение и признаки воспаления',
    riskTier: 'low',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-9887eb6b4c67',
    category: 'Исследования кала и пищеварения',
    title: 'Иммунохимический тест на скрытую кровь FIT',
    specimen: 'Образец кала, собранный набором',
    schedulingGuidance:
      'По применимому возрастному протоколу скрининга; положительный результат требует дальнейшего обследования',
    purpose: 'Обнаружить скрытую кровь и определить необходимость колоноскопии',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-c4df4aa1c807',
    category: 'Исследования кала и пищеварения',
    title: 'Фекальный кальпротектин',
    specimen: 'Образец кала',
    schedulingGuidance:
      'При хронической диарее, боли или контроле воспалительного заболевания; повтор — по динамике',
    purpose:
      'Оценить вероятность кишечного воспаления и активность заболевания',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-e05cf446a690',
    category: 'Исследования кала и пищеварения',
    title: 'Панкреатическая эластаза',
    specimen: 'Образец оформленного или полуоформленного кала',
    schedulingGuidance:
      'При подозрении на недостаточность поджелудочной железы',
    purpose: 'Оценить выработку пищеварительных ферментов',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-b811778cc975',
    category: 'Исследования кала и пищеварения',
    title: 'Посев кала',
    specimen: 'Свежий образец в стерильном контейнере',
    schedulingGuidance: 'Во время диареи, желательно до антибиотиков',
    purpose: 'Найти отдельные бактериальные возбудители кишечной инфекции',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-22d3a7aed835',
    category: 'Исследования кала и пищеварения',
    title: 'ПЦР-панель кишечных инфекций',
    specimen: 'Свежий образец кала',
    schedulingGuidance: 'В период острых симптомов, до или в начале лечения',
    purpose: 'Быстро обнаружить генетический материал нескольких возбудителей',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-71cef05d9343',
    category: 'Исследования кала и пищеварения',
    title: 'Антиген Helicobacter pylori',
    specimen: 'Образец кала',
    schedulingGuidance:
      'Для первичной диагностики или контроля лечения; сроки отмены лекарств задаёт протокол',
    purpose: 'Обнаружить активную инфекцию H. pylori',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-6024fd8d435e',
    category: 'Исследования кала и пищеварения',
    title: 'Анализ на паразитов и яйца гельминтов',
    specimen: 'Один или несколько образцов кала',
    schedulingGuidance:
      'После риска заражения или при симптомах; иногда нужны повторные пробы',
    purpose: 'Выявить паразитов или их яйца',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-df574a32523c',
    category: 'Исследования кала и пищеварения',
    title: 'Жиры в кале',
    specimen: 'Разовый или суточный образец по инструкции',
    schedulingGuidance:
      'При признаках нарушения всасывания; возможна специальная подготовка',
    purpose: 'Подтвердить нарушение переваривания или всасывания жиров',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-f3d306adface',
    category: 'Исследования кала и пищеварения',
    title: 'Исследование микробиоты',
    specimen: 'Образец кала',
    schedulingGuidance:
      'Только для конкретной клинической или исследовательской задачи',
    purpose:
      'Описать состав обнаруженной микробиоты; не ставить диагноз только по коммерческому профилю',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-9ea5f17887a7',
    category: 'Исследования кала и пищеварения',
    title: '«Анализ на дисбактериоз»',
    specimen: 'Образец кала',
    schedulingGuidance: 'Не назначать как обязательный регулярный анализ',
    purpose:
      'Хранить загруженный результат, но маркировать ограниченную клиническую применимость',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-f1e56efb6fca',
    category: 'Мазки и другие биоматериалы',
    title: 'Влагалищный мазок на микроскопию',
    specimen: 'Отделяемое влагалища',
    schedulingGuidance:
      'При выделениях, запахе, зуде или дискомфорте; желательно до местного лечения',
    purpose: 'Оценить воспаление, клетки и микроорганизмы',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-a9f704debc22',
    category: 'Мазки и другие биоматериалы',
    title: 'Влагалищный или цервикальный материал для ПЦР',
    specimen:
      'Мазок из влагалища или шейки матки; иногда самостоятельный вагинальный образец',
    schedulingGuidance:
      'После риска заражения, при симптомах, беременности или по программе скрининга',
    purpose: 'Выявить ДНК или РНК конкретных возбудителей',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-a621df72dca7',
    category: 'Мазки и другие биоматериалы',
    title: 'Цервикальный материал для HPV-теста',
    specimen: 'Клетки шейки матки либо валидированный вагинальный образец',
    schedulingGuidance:
      'По возрасту и локальному протоколу; дальнейший срок зависит от результата',
    purpose: 'Выявить типы HPV высокого онкогенного риска',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-1a8be7998e9a',
    category: 'Мазки и другие биоматериалы',
    title: 'Бактериологический посев отделяемого',
    specimen: 'Мазок из влагалища, шейки матки, уретры, раны или другой зоны',
    schedulingGuidance:
      'При симптомах — желательно до антибиотиков и местных антисептиков',
    purpose: 'Вырастить бактерии или грибы и определить чувствительность',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-67c68b8f0d8d',
    category: 'Мазки и другие биоматериалы',
    title: 'Мазок из носа или носоглотки',
    specimen: 'Материал со слизистой',
    schedulingGuidance:
      'Во время симптомов, после контакта или по эпидемиологическому назначению',
    purpose: 'Выявить респираторную инфекцию или носительство',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-40c8bcc27387',
    category: 'Мазки и другие биоматериалы',
    title: 'Мазок из ротоглотки',
    specimen: 'Материал с миндалин и задней стенки глотки',
    schedulingGuidance: 'Во время симптомов, желательно до антибиотика',
    purpose: 'Обнаружить возбудителя фарингита или другой инфекции',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-9f598070705f',
    category: 'Мазки и другие биоматериалы',
    title: 'Мазок с кожи, раны или конъюнктивы',
    specimen: 'Отделяемое поражённого участка',
    schedulingGuidance:
      'При активных симптомах, по возможности до местного лечения',
    purpose: 'Найти возбудителя и подобрать лечение',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-f89e1a231095',
    category: 'Мазки и другие биоматериалы',
    title: 'Слюна',
    specimen: 'Слюну в специальный контейнер',
    schedulingGuidance:
      'Время и подготовка зависят от гормонального, генетического, инфекционного или токсикологического теста',
    purpose: 'Получить неинвазивный материал для конкретного исследования',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-c43a5e136906',
    category: 'Мазки и другие биоматериалы',
    title: 'Кортизол в слюне',
    specimen: 'Один или несколько образцов слюны',
    schedulingGuidance: 'Строго в часы, заданные протоколом',
    purpose:
      'Оценить суточный ритм кортизола при отдельных эндокринных задачах',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-bced290a0c5c',
    category: 'Мазки и другие биоматериалы',
    title: 'Мокрота',
    specimen: 'Откашлянную мокроту или материал, полученный при процедуре',
    schedulingGuidance: 'Во время симптомов, желательно до антибиотиков',
    purpose: 'Исследовать бактерии, грибы, микобактерии и атипичные клетки',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['procedure'],
  },
  {
    key: 'catalog-8120d052b92d',
    category: 'Мазки и другие биоматериалы',
    title: 'Цервикальная слизь',
    specimen: 'Слизь из канала шейки матки',
    schedulingGuidance: 'В фазу цикла, указанную репродуктологом',
    purpose:
      'Оценить отдельные параметры овуляторного и репродуктивного процесса',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-00a976cb27da',
    category: 'Мазки и другие биоматериалы',
    title: 'Амниотическая жидкость',
    specimen: 'Материал, полученный при амниоцентезе',
    schedulingGuidance:
      'Только в установленное акушером окно беременности и по показаниям',
    purpose:
      'Провести генетическое, инфекционное или другое исследование плода',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-59a772ee594d',
    category: 'Мазки и другие биоматериалы',
    title: 'Грудное молоко',
    specimen: 'Образец молока',
    schedulingGuidance:
      'При симптомах мастита или другой конкретной задаче; профилактически обычно не требуется',
    purpose: 'Определить возможного возбудителя',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-87a5c55346d4',
    category: 'Мазки и другие биоматериалы',
    title: 'Специализированные жидкости',
    specimen:
      'Ликвор, плевральную, асцитическую, синовиальную или другую жидкость, полученную при пункции',
    schedulingGuidance: 'Только по клиническим показаниям',
    purpose:
      'Установить причину воспаления, инфекции, кровотечения или накопления жидкости',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-e60de5aa4594',
    category: 'Диагностика инфекций',
    title: 'Бактериологический посев',
    specimen: 'Биоматериал из предполагаемого очага инфекции',
    schedulingGuidance: 'Во время симптомов и, если безопасно, до антибиотиков',
    purpose:
      'Вырастить микроорганизм и подтвердить его возможную роль в инфекции',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-ad50588be6c1',
    category: 'Диагностика инфекций',
    title: 'Чувствительность к антибиотикам',
    specimen: 'Культуру микроорганизма после положительного посева',
    schedulingGuidance: 'Выполняется после роста культуры',
    purpose: 'Подобрать препарат, к которому микроорганизм чувствителен',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-cb25d0d5d62a',
    category: 'Диагностика инфекций',
    title: 'ПЦР на отдельный возбудитель',
    specimen: 'Материал, соответствующий пути заражения и очагу',
    schedulingGuidance:
      'После контакта или при симптомах; окно зависит от возбудителя',
    purpose: 'Обнаружить генетический материал конкретного микроорганизма',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-e3d32f4772b5',
    category: 'Диагностика инфекций',
    title: 'Мультиплексная ПЦР-панель',
    specimen: 'Мазок, кровь, кал, мокроту или другой материал',
    schedulingGuidance:
      'В период симптомов, когда результат способен изменить тактику',
    purpose: 'Одновременно проверить несколько возможных возбудителей',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-724cbb5744e1',
    category: 'Диагностика инфекций',
    title: 'Антигенный экспресс-тест',
    specimen: 'Мазок, кровь, кал или мочу — в зависимости от теста',
    schedulingGuidance:
      'Обычно в период активной инфекции; точное окно задаёт производитель',
    purpose: 'Быстро обнаружить компонент возбудителя',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-0608ded477e2',
    category: 'Диагностика инфекций',
    title: 'Серологическое исследование',
    specimen: 'Кровь на антитела или антигены',
    schedulingGuidance:
      'С учётом периода окна; ранний отрицательный результат иногда требует повторения',
    purpose: 'Определить текущую или перенесённую инфекцию либо иммунный ответ',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-0aeb3e73fdc0',
    category: 'Диагностика инфекций',
    title: 'Микроскопия',
    specimen: 'Мазок, отделяемое, мокроту, кровь или другой материал',
    schedulingGuidance: 'При активных симптомах, желательно до лечения',
    purpose: 'Быстро увидеть клетки, бактерии, грибы или паразитов',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-0f8e5be64dff',
    category: 'Диагностика инфекций',
    title: 'Исследование на грибковую инфекцию',
    specimen: 'Соскоб, мазок, ноготь, волосы, кожу или другой материал',
    schedulingGuidance: 'По возможности до противогрибкового лечения',
    purpose: 'Подтвердить грибковую природу поражения и уточнить возбудителя',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-3f18ec8fe5ae',
    category: 'Диагностика инфекций',
    title: 'Исследование на паразитов',
    specimen: 'Кал, кровь, соскоб или другой материал',
    schedulingGuidance:
      'После риска заражения или при симптомах; иногда нужны повторные образцы',
    purpose: 'Обнаружить паразита, антиген, антитела или генетический материал',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-2191266e7026',
    category: 'Диагностика инфекций',
    title: 'Посев крови на стерильность',
    specimen: 'Несколько образцов крови по протоколу',
    schedulingGuidance:
      'Срочно при подозрении на инфекцию крови, желательно до антибиотиков',
    purpose: 'Выявить бактериемию или грибковую инфекцию крови',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-b3581db2f1a1',
    category: 'Диагностика инфекций',
    title: 'Хламидиоз и гонорея',
    specimen:
      'Вагинальный/цервикальный мазок или первую порцию мочи; дополнительные зоны — по типу контакта',
    schedulingGuidance:
      'По возрасту, беременности и риску; контроль после лечения — по протоколу инфекции',
    purpose: 'Выявить часто бессимптомные ИППП и предотвратить осложнения',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-09d82f84428c',
    category: 'Диагностика инфекций',
    title: 'ВИЧ',
    specimen: 'Кровь; иногда валидированный экспресс-образец',
    schedulingGuidance:
      'После риска с учётом диагностического окна; при беременности — по акушерскому протоколу',
    purpose: 'Выявить инфекцию и своевременно начать лечение',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-c9239e673b52',
    category: 'Диагностика инфекций',
    title: 'Сифилис',
    specimen: 'Кровь; иногда другой материал',
    schedulingGuidance:
      'После риска, при симптомах, беременности или повышенном риске; возможен повтор после периода окна',
    purpose: 'Выявить инфекцию и предотвратить осложнения и передачу ребёнку',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-2c8adf9a789e',
    category: 'Диагностика инфекций',
    title: 'Вирусные гепатиты',
    specimen: 'Кровь на антигены, антитела и при необходимости ПЦР',
    schedulingGuidance:
      'По возрасту, риску, беременности и перед отдельными видами лечения',
    purpose: 'Определить инфекцию, перенесённый контакт или иммунитет',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-4794468618f9',
    category: 'Диагностика инфекций',
    title: 'Генитальный герпес',
    specimen:
      'ПЦР содержимого свежего элемента; серология — только для отдельных задач',
    schedulingGuidance: 'ПЦР лучше брать при свежих высыпаниях',
    purpose: 'Подтвердить HSV при симптомах и определить дальнейшую тактику',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-8aa9a4a32699',
    category: 'Диагностика инфекций',
    title: 'Скрининг госпитальной колонизации',
    specimen: 'Мазок из носа, прямой кишки, кожи или другой зоны',
    schedulingGuidance:
      'Перед госпитализацией, вмешательством или во время вспышки — по правилам учреждения',
    purpose: 'Выявить носительство устойчивых микроорганизмов',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['procedure'],
  },
  {
    key: 'catalog-2c169a5163eb',
    category: 'Генетические исследования',
    title: 'Известная семейная мутация',
    specimen:
      'Кровь или буккальный мазок; желательно данные родственника с найденным вариантом',
    schedulingGuidance: 'Однократно после консультации; повтор обычно не нужен',
    purpose: 'Проверить наличие конкретного наследственного варианта в семье',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-f8786c545056',
    category: 'Генетические исследования',
    title: 'Секвенирование отдельного гена',
    specimen: 'Кровь или буккальный мазок',
    schedulingGuidance:
      'При характерных симптомах или семейном анамнезе; результат постоянный, интерпретация обновляется',
    purpose: 'Диагностировать заболевание, связанное с определённым геном',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-ec903e216fcc',
    category: 'Генетические исследования',
    title: 'Панель генов',
    specimen: 'Кровь или буккальный мазок',
    schedulingGuidance:
      'Когда один синдром может быть связан с несколькими генами',
    purpose: 'Одновременно проверить группу релевантных генов',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-33766f2cf3d1',
    category: 'Генетические исследования',
    title: 'Наследственный риск рака',
    specimen:
      'Кровь или буккальный мазок; например, BRCA1/2 и другие гены по показаниям',
    schedulingGuidance:
      'При личном или семейном анамнезе, желательно до решений о профилактике или лечении',
    purpose: 'Персонализировать наблюдение и профилактические решения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-a2a43ddbe41d',
    category: 'Генетические исследования',
    title: 'Скрининг носительства',
    specimen: 'Кровь или буккальный мазок',
    schedulingGuidance:
      'Предпочтительно до беременности; обычно не повторяется при достаточном ранее выполненном тесте',
    purpose:
      'Оценить риск передачи ребёнку рецессивного или X-сцепленного заболевания',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-d22600757303',
    category: 'Генетические исследования',
    title: 'Исследование партнёра',
    specimen: 'Кровь или буккальный мазок партнёра',
    schedulingGuidance:
      'После выявления носительства у первого партнёра, желательно до беременности или как можно раньше',
    purpose: 'Рассчитать риск заболевания у ребёнка',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-20900762de7a',
    category: 'Генетические исследования',
    title: 'Кариотипирование',
    specimen:
      'Кровь; в пренатальной диагностике — клетки хориона или амниотической жидкости',
    schedulingGuidance:
      'При бесплодии, повторных потерях беременности, врождённых особенностях или после скрининга',
    purpose: 'Обнаружить крупные изменения числа и структуры хромосом',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'genetic'],
  },
  {
    key: 'catalog-58b62ae4162e',
    category: 'Генетические исследования',
    title: 'Хромосомный микроматричный анализ',
    specimen: 'Кровь или диагностический материал плода/ткани',
    schedulingGuidance: 'По показаниям после консультации генетика',
    purpose: 'Найти небольшие хромосомные потери и дупликации',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-027563f3eca2',
    category: 'Генетические исследования',
    title: 'FISH',
    specimen: 'Кровь, клетки плода, костный мозг или ткань',
    schedulingGuidance: 'Для конкретного диагностического вопроса',
    purpose: 'Быстро проверить заданную хромосомную перестройку',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-9dac38b87616',
    category: 'Генетические исследования',
    title: 'Экзом или геном',
    specimen: 'Кровь, буккальный мазок или образцы семьи',
    schedulingGuidance: 'При сложной неясной клинической картине',
    purpose: 'Найти редкие генетические причины, не охваченные узкой панелью',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-4cccc9e4910d',
    category: 'Генетические исследования',
    title: 'Неинвазивный пренатальный тест',
    specimen: 'Кровь беременной с внеклеточной ДНК плаценты',
    schedulingGuidance:
      'Начиная со срока, разрешённого конкретным тестом и акушерским протоколом',
    purpose:
      'Оценить вероятность частых хромосомных аномалий; это скрининг, не диагноз',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'genetic'],
  },
  {
    key: 'catalog-f7503e43e595',
    category: 'Генетические исследования',
    title: 'Инвазивная пренатальная диагностика',
    specimen: 'Ворсины хориона или амниотическую жидкость',
    schedulingGuidance:
      'Только в установленное акушером окно и после консультации',
    purpose: 'Диагностически проверить заболевание плода',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'genetic'],
  },
  {
    key: 'catalog-d0961d0bc38e',
    category: 'Генетические исследования',
    title: 'Предимплантационное генетическое тестирование',
    specimen: 'Несколько клеток эмбриона в программе ЭКО',
    schedulingGuidance: 'На этапе культивирования эмбрионов',
    purpose:
      'Оценить отдельные хромосомные или наследственные нарушения до переноса',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-17c13d8d0003',
    category: 'Генетические исследования',
    title: 'Фармакогенетика',
    specimen: 'Кровь или буккальный мазок',
    schedulingGuidance:
      'Однократно, желательно до назначения соответствующего препарата',
    purpose:
      'Подобрать дозировку или препарат с учётом генетических особенностей',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['genetic'],
  },
  {
    key: 'catalog-17cb4754dfef',
    category: 'Генетические исследования',
    title: 'Соматические мутации опухоли',
    specimen: 'Опухолевую ткань; иногда кровь для жидкостной биопсии',
    schedulingGuidance:
      'После установления опухоли, перед выбором лечения или при прогрессировании',
    purpose: 'Найти мишени для терапии и уточнить характеристики опухоли',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'genetic'],
  },
  {
    key: 'catalog-c23656307739',
    category: 'Цитология и биопсия',
    title: 'Пап-тест',
    specimen: 'Клетки шейки матки, взятые щёточкой',
    schedulingGuidance:
      'По возрастному и локальному протоколу; не назначать ежегодно без специальных показаний',
    purpose:
      'Обнаружить предраковые и злокачественные изменения клеток шейки матки',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-448ccbbdb98a',
    category: 'Цитология и биопсия',
    title: 'Жидкостная цитология шейки матки',
    specimen: 'Клетки шейки матки в транспортном растворе',
    schedulingGuidance:
      'В рамках скринингового маршрута; повтор зависит от возраста, HPV и предыдущей истории',
    purpose:
      'Выявить клеточные изменения и при необходимости выполнить HPV-тест из того же материала',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-bac7e2b71042',
    category: 'Цитология и биопсия',
    title: 'Цитология влагалища',
    specimen: 'Клетки влагалища',
    schedulingGuidance: 'Только по показаниям',
    purpose: 'Найти атипичные клетки влагалища',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-9986375538d3',
    category: 'Цитология и биопсия',
    title: 'Цитология мочи',
    specimen: 'Клетки из свежей мочи',
    schedulingGuidance: 'При крови в моче или по плану уролога',
    purpose: 'Выявить атипичные клетки мочевыводящих путей',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-6c2993aed53f',
    category: 'Цитология и биопсия',
    title: 'Цитология мокроты',
    specimen: 'Мокроту, иногда несколько утренних образцов',
    schedulingGuidance: 'Только по клиническим показаниям',
    purpose: 'Найти атипичные или воспалительные клетки',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-3752eb6a9898',
    category: 'Цитология и биопсия',
    title: 'Цитология пунктата',
    specimen: 'Клеточный материал из узла, кисты или другого образования',
    schedulingGuidance: 'После обнаружения образования',
    purpose: 'Оценить клеточный состав и необходимость дальнейшей диагностики',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-c3289beb8268',
    category: 'Цитология и биопсия',
    title: 'Тонкоигольная аспирационная биопсия',
    specimen: 'Клетки из образования, полученные тонкой иглой',
    schedulingGuidance: 'После выявления подозрительного образования',
    purpose: 'Получить материал с минимальной травматичностью',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-d4a4f6d171bb',
    category: 'Цитология и биопсия',
    title: 'Core-биопсия',
    specimen: 'Столбики ткани, полученные специальной иглой',
    schedulingGuidance: 'При подозрительном образовании',
    purpose: 'Сохранить структуру ткани и получить морфологическое заключение',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-2c68829c1726',
    category: 'Цитология и биопсия',
    title: 'Трепанобиопсия',
    specimen: 'Столбик костной или другой плотной ткани, часто костный мозг',
    schedulingGuidance: 'По назначению профильного специалиста',
    purpose: 'Диагностировать заболевания костного мозга и других тканей',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-93071cecfafd',
    category: 'Цитология и биопсия',
    title: 'Биопсия шейки матки',
    specimen: 'Небольшой участок ткани шейки матки',
    schedulingGuidance:
      'После подозрительного скрининга или кольпоскопии; срок определяет риск изменений',
    purpose:
      'Подтвердить и определить степень предракового или опухолевого изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-a0cfa4c9a7a9',
    category: 'Цитология и биопсия',
    title: 'Биопсия эндометрия',
    specimen: 'Фрагмент слизистой полости матки',
    schedulingGuidance:
      'При аномальном кровотечении или изменениях эндометрия; день цикла зависит от задачи',
    purpose:
      'Выявить гиперплазию, воспаление, предраковые или опухолевые изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-24a1a1aa0990',
    category: 'Цитология и биопсия',
    title: 'Биопсия молочной железы',
    specimen: 'Клетки или столбики ткани образования',
    schedulingGuidance:
      'После подозрительного осмотра или визуализации; выполнить в срок врача',
    purpose: 'Установить природу образования и его характеристики',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-526e4b5816fa',
    category: 'Цитология и биопсия',
    title: 'Биопсия щитовидной железы',
    specimen: 'Клетки узла под контролем УЗИ',
    schedulingGuidance: 'По размеру и ультразвуковым признакам узла',
    purpose: 'Отличить доброкачественное образование от подозрительного',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-16f38c063ebf',
    category: 'Цитология и биопсия',
    title: 'Эндоскопическая биопсия',
    specimen: 'Фрагмент слизистой во время эндоскопии',
    schedulingGuidance: 'Во время назначенной процедуры',
    purpose: 'Подтвердить воспалительное, предраковое или опухолевое изменение',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-accd3289988f',
    category: 'Цитология и биопсия',
    title: 'Гистологическое исследование',
    specimen: 'Зафиксированный фрагмент ткани после биопсии или операции',
    schedulingGuidance:
      'После получения материала; заключение остаётся постоянной частью истории',
    purpose: 'Определить тип и структуру заболевания на уровне ткани',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-ffd9aad93ac7',
    category: 'Цитология и биопсия',
    title: 'Иммуногистохимия',
    specimen: 'Срезы ткани из парафинового блока',
    schedulingGuidance:
      'После гистологии, если нужно уточнение диагноза или выбор терапии',
    purpose: 'Определить белковые маркеры клеток',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-6b578116a34d',
    category: 'Цитология и биопсия',
    title: 'Молекулярное исследование ткани',
    specimen: 'Тканевой блок, стёкла или выделенную ДНК/РНК',
    schedulingGuidance:
      'После морфологического диагноза или перед выбором терапии',
    purpose: 'Найти терапевтически значимые мутации и перестройки',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-87a66199d0de',
    category: 'Цитология и биопсия',
    title: 'Пересмотр стёкол и блоков',
    specimen: 'Готовые стёкла, парафиновые блоки и предыдущее заключение',
    schedulingGuidance:
      'Перед сложным лечением, при сомнительном заключении или смене клиники',
    purpose: 'Получить второе морфологическое мнение без повторной биопсии',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive'],
  },
  {
    key: 'catalog-828895ff82db',
    category: 'Ультразвуковые исследования',
    title: 'УЗИ органов брюшной полости',
    specimen:
      'Биоматериал сдавать не нужно; исследуются печень, желчный пузырь, поджелудочная железа и селезёнка',
    schedulingGuidance:
      'По симптомам или назначению; заключение отражает состояние на дату исследования',
    purpose:
      'Выявить камни, кисты, воспалительные и структурные изменения органов',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-186b248cfceb',
    category: 'Ультразвуковые исследования',
    title: 'УЗИ почек и мочевого пузыря',
    specimen:
      'Биоматериал сдавать не нужно; исследуются почки, мочевой пузырь и при необходимости остаточная моча',
    schedulingGuidance:
      'По симптомам, изменениям анализов или назначению; универсального срока актуальности нет',
    purpose:
      'Найти камни, расширение мочевых путей и причины нарушения мочеиспускания',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'pelvic-ultrasound',
    category: 'Ультразвуковые исследования',
    title: 'УЗИ органов малого таза',
    specimen:
      'Биоматериал сдавать не нужно; исследуются матка, эндометрий, яичники и окружающие структуры',
    schedulingGuidance:
      'Плановую дату иногда привязывают к фазе цикла; при боли или кровотечении проводят независимо от дня цикла',
    purpose:
      'Оценить матку и яичники, выявить миомы, кисты, полипы и другие изменения',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
    illustrationKey: 'ultrasound',
  },
  {
    key: 'catalog-311f1426b057',
    category: 'Ультразвуковые исследования',
    title: 'Трансвагинальное УЗИ',
    specimen:
      'Биоматериал сдавать не нужно; органы малого таза исследуются вагинальным датчиком',
    schedulingGuidance:
      'День цикла выбирают по клинической задаче; при острых симптомах исследование не откладывают',
    purpose:
      'Получить более детальное изображение матки, эндометрия и яичников',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-d4fa1cd57628',
    category: 'Ультразвуковые исследования',
    title: 'Фолликулометрия',
    specimen:
      'Биоматериал сдавать не нужно; серийно исследуются фолликулы и эндометрий',
    schedulingGuidance:
      'Несколько исследований в течение одного цикла; даты рассчитываются по длине цикла и назначению врача',
    purpose:
      'Оценить рост фолликула, предполагаемую овуляцию и ответ на стимуляцию',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-bd05c0ecbc18',
    category: 'Ультразвуковые исследования',
    title: 'УЗИ при беременности',
    specimen:
      'Биоматериал сдавать не нужно; исследуются беременность, плод, плацента и околоплодные воды',
    schedulingGuidance:
      'В сроки акушерских скринингов или внепланово по симптомам и рискам; точные окна задаёт применимый протокол',
    purpose:
      'Подтвердить и датировать беременность, оценить развитие плода и выявить осложнения',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-b4f5151d48c4',
    category: 'Ультразвуковые исследования',
    title: 'УЗИ молочных желёз',
    specimen:
      'Биоматериал сдавать не нужно; исследуются ткани молочных желёз и лимфоузлы',
    schedulingGuidance:
      'При жалобах — независимо от дня цикла; плановая дата и повтор зависят от задачи. Не заменяет показанную маммографию',
    purpose: 'Оценить уплотнения, кисты, воспалительные и другие изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-7f44e4167833',
    category: 'Ультразвуковые исследования',
    title: 'УЗИ щитовидной железы',
    specimen:
      'Биоматериал сдавать не нужно; исследуются структура железы, узлы и лимфоузлы',
    schedulingGuidance:
      'При симптомах, изменениях гормонов или для контроля узлов; частота зависит от результата',
    purpose: 'Выявить и наблюдать структурные изменения щитовидной железы',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-fc31c6b1434a',
    category: 'Ультразвуковые исследования',
    title: 'УЗИ сосудов и дуплексное сканирование',
    specimen: 'Биоматериал сдавать не нужно; исследуются сосуды и кровоток',
    schedulingGuidance:
      'По симптомам, факторам риска или назначению; повтор зависит от найденного изменения',
    purpose:
      'Выявить тромбоз, нарушение кровотока, сужения и венозную недостаточность',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-ed981f6c367b',
    category: 'Рентгенологические исследования',
    title: 'Рентгенография грудной клетки',
    specimen:
      'Биоматериал сдавать не нужно; исследуются лёгкие, плевра и костные структуры грудной клетки',
    schedulingGuidance:
      'По симптомам или медицинским показаниям; не повторять без необходимости. О возможной беременности сообщить заранее',
    purpose:
      'Диагностировать пневмонию, травмы, плевральный выпот и другие изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-c805ba94eb78',
    category: 'Рентгенологические исследования',
    title: 'Флюорография',
    specimen: 'Биоматериал сдавать не нужно; исследуются органы грудной клетки',
    schedulingGuidance:
      'Периодичность зависит от страны, возраста, профессии и риска; не должна автоматически дублировать недавний рентген или КТ',
    purpose: 'Профилактически выявлять туберкулёз и отдельные изменения лёгких',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-4539bbc66b7d',
    category: 'Рентгенологические исследования',
    title: 'Рентген костей, суставов и позвоночника',
    specimen: 'Биоматериал сдавать не нужно; исследуется выбранная область',
    schedulingGuidance:
      'После травмы, при боли или по назначению; повтор — для контроля лечения или динамики',
    purpose: 'Выявить переломы, вывихи, деформации и дегенеративные изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-86cc78a4dc11',
    category: 'Рентгенологические исследования',
    title: 'Стоматологическая рентгенография',
    specimen:
      'Биоматериал сдавать не нужно; исследуются зубы, корни и окружающая костная ткань',
    schedulingGuidance:
      'Перед лечением, во время него или для контроля; частота зависит от стоматологической задачи',
    purpose:
      'Найти скрытый кариес, воспаление, повреждение и проконтролировать лечение',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-e4a44bf98127',
    category: 'Рентгенологические исследования',
    title: 'Панорамный снимок зубов',
    specimen: 'Биоматериал сдавать не нужно; исследуются зубные ряды и челюсти',
    schedulingGuidance:
      'По назначению стоматолога или ортодонта; универсального срока действия нет',
    purpose:
      'Спланировать стоматологическое, хирургическое или ортодонтическое лечение',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-4bcb40484eae',
    category: 'Рентгенологические исследования',
    title: 'Маммография',
    specimen: 'Биоматериал сдавать не нужно; исследуются обе молочные железы',
    schedulingGuidance:
      'Скрининговый интервал зависит от возраста, страны и риска; при симптомах проводится вне графика',
    purpose:
      'Рано выявить рак молочной железы и оценить подозрительные изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-2874e294ef4f',
    category: 'Рентгенологические исследования',
    title: 'Рентгеновская денситометрия',
    specimen:
      'Биоматериал сдавать не нужно; измеряется минеральная плотность костей',
    schedulingGuidance:
      'По возрасту и риску остеопороза; повтор зависит от исходного результата и лечения',
    purpose: 'Диагностировать остеопороз и оценить риск переломов',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-5dc05d64d50f',
    category: 'Рентгенологические исследования',
    title: 'Гистеросальпингография',
    specimen:
      'Биоматериал сдавать не нужно; с контрастом исследуются полость матки и проходимость труб',
    schedulingGuidance:
      'Обычно после менструации и до предполагаемой овуляции, после исключения беременности и активной инфекции; точную дату назначает врач',
    purpose:
      'Оценить проходимость маточных труб и отдельные изменения полости матки',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation', 'contrast'],
  },
  {
    key: 'catalog-4f5431cd6457',
    category: 'Компьютерная томография',
    title: 'КТ головы и головного мозга',
    specimen:
      'Биоматериал сдавать не нужно; исследуется голова, иногда с внутривенным контрастом',
    schedulingGuidance:
      'При травме, острых симптомах или по назначению; результат отражает состояние на дату исследования',
    purpose:
      'Быстро выявить кровоизлияние, травму и другие структурные изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation', 'contrast'],
  },
  {
    key: 'catalog-1265228102ff',
    category: 'Компьютерная томография',
    title: 'КТ пазух и височных костей',
    specimen:
      'Биоматериал сдавать не нужно; исследуются пазухи либо структуры уха',
    schedulingGuidance: 'По симптомам и назначению специалиста',
    purpose:
      'Детально оценить костные структуры, воспаление, травмы и область перед операцией',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-c35312731fdb',
    category: 'Компьютерная томография',
    title: 'КТ грудной клетки',
    specimen:
      'Биоматериал сдавать не нужно; исследуются лёгкие, плевра и средостение',
    schedulingGuidance:
      'По показаниям; повтор определяется заболеванием и динамикой, а не фиксированным сроком',
    purpose:
      'Выявить воспаление, опухоли, травмы и другие изменения грудной клетки',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-dcdeb113b575',
    category: 'Компьютерная томография',
    title: 'Низкодозная КТ лёгких',
    specimen:
      'Биоматериал сдавать не нужно; исследуются лёгкие с уменьшенной лучевой нагрузкой',
    schedulingGuidance:
      'Только для людей, соответствующих критериям программы скрининга по возрасту и риску курения',
    purpose: 'Рано выявить рак лёгкого в группе высокого риска',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation'],
  },
  {
    key: 'catalog-8f06a033745a',
    category: 'Компьютерная томография',
    title: 'КТ брюшной полости и малого таза',
    specimen:
      'Биоматериал сдавать не нужно; исследуются органы живота и таза, иногда с контрастом',
    schedulingGuidance:
      'По симптомам или назначению; при контрасте могут потребоваться сведения о функции почек. О возможной беременности сообщить заранее',
    purpose:
      'Найти воспаление, травму, камни, кровотечение и объёмные образования',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation', 'contrast'],
  },
  {
    key: 'catalog-60eba25279c9',
    category: 'Компьютерная томография',
    title: 'КТ позвоночника, суставов и конечностей',
    specimen: 'Биоматериал сдавать не нужно; исследуется выбранная область',
    schedulingGuidance:
      'После травмы, перед операцией или когда других методов недостаточно',
    purpose: 'Детально оценить сложные переломы и костные структуры',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation', 'procedure'],
  },
  {
    key: 'catalog-b278e74ec5fa',
    category: 'Компьютерная томография',
    title: 'КТ-ангиография',
    specimen:
      'Биоматериал сдавать не нужно; сосуды исследуются после введения йодсодержащего контраста',
    schedulingGuidance:
      'При подозрении на тромбоз, аневризму, кровотечение или сужение сосудов',
    purpose: 'Быстро оценить строение и проходимость сосудов',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation', 'contrast'],
  },
  {
    key: 'catalog-15ab97c73ce0',
    category: 'Компьютерная томография',
    title: 'КТ-коронарография',
    specimen:
      'Биоматериал сдавать не нужно; с контрастом исследуются коронарные артерии',
    schedulingGuidance:
      'По назначению кардиолога с учётом симптомов и сердечно-сосудистого риска',
    purpose: 'Выявить атеросклеротические бляшки и сужения коронарных артерий',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation', 'contrast'],
  },
  {
    key: 'catalog-8704e5e185d3',
    category: 'Компьютерная томография',
    title: 'КТ-урография',
    specimen:
      'Биоматериал сдавать не нужно; с контрастом исследуются почки, мочеточники и мочевой пузырь',
    schedulingGuidance:
      'При крови в моче, подозрении на обструкцию или по назначению уролога',
    purpose:
      'Оценить мочевые пути, камни, опухоли и причины нарушения оттока мочи',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['radiation', 'contrast'],
  },
  {
    key: 'catalog-bc83a4e22878',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ головного мозга',
    specimen:
      'Биоматериал сдавать не нужно; исследуется головной мозг, иногда с контрастом',
    schedulingGuidance:
      'По неврологическим симптомам или для контроля известного заболевания',
    purpose:
      'Выявить опухолевые, воспалительные, сосудистые и демиелинизирующие изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['contrast'],
  },
  {
    key: 'catalog-9d35f9f4c31c',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ гипофиза',
    specimen:
      'Биоматериал сдавать не нужно; исследуются гипофиз и окружающие структуры, часто с контрастом',
    schedulingGuidance:
      'При гормональных отклонениях или для наблюдения известного образования',
    purpose: 'Найти структурную причину нарушений гормонов гипофиза',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['contrast'],
  },
  {
    key: 'catalog-83eede389e91',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ позвоночника и спинного мозга',
    specimen:
      'Биоматериал сдавать не нужно; исследуется выбранный отдел позвоночника и нервные структуры',
    schedulingGuidance:
      'При стойких симптомах, неврологическом дефиците или для контроля лечения',
    purpose:
      'Выявить грыжи, сдавление нервов, воспаление и опухолевые изменения',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-833586d1eb2b',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ суставов и мягких тканей',
    specimen:
      'Биоматериал сдавать не нужно; исследуется сустав, мышцы, связки или другая область',
    schedulingGuidance:
      'После травмы, при сохраняющейся боли или перед операцией',
    purpose: 'Детально оценить мягкие ткани и внутрисуставные структуры',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['procedure'],
  },
  {
    key: 'catalog-564decbb6cd3',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ брюшной полости и МР-холангиография',
    specimen:
      'Биоматериал сдавать не нужно; исследуются органы живота, желчные и панкреатические протоки',
    schedulingGuidance:
      'По назначению; при контрасте учитываются беременность и функция почек',
    purpose: 'Уточнить изменения органов, камни и сужения протоков',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['contrast'],
  },
  {
    key: 'catalog-2c7c92d85ab1',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ малого таза',
    specimen:
      'Биоматериал сдавать не нужно; исследуются матка, шейка, яичники и окружающие ткани',
    schedulingGuidance:
      'По назначению; в отдельных задачах дату привязывают к фазе цикла',
    purpose:
      'Уточнить эндометриоз, опухоли, врождённые особенности и сложные изменения таза',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-e909b059a219',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ молочных желёз',
    specimen:
      'Биоматериал сдавать не нужно; обычно обе железы исследуются с контрастом',
    schedulingGuidance:
      'При высоком риске или для уточнения находок; плановая дата иногда зависит от цикла. Не заменяет остальные показанные методы',
    purpose:
      'Уточнить неоднозначные находки и оценить распространённость процесса',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['contrast'],
  },
  {
    key: 'catalog-c26076c531ac',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ сердца',
    specimen:
      'Биоматериал сдавать не нужно; исследуются строение, функция и ткань сердца',
    schedulingGuidance:
      'По назначению кардиолога; повтор зависит от заболевания и лечения',
    purpose:
      'Оценить кардиомиопатии, воспаление, рубцовые и врождённые изменения',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-0895ed0e04d8',
    category: 'Магнитно-резонансная томография',
    title: 'МР-ангиография и МР-венография',
    specimen:
      'Биоматериал сдавать не нужно; исследуются артерии или вены выбранной области',
    schedulingGuidance: 'По сосудистым или неврологическим показаниям',
    purpose: 'Выявить сужения, аневризмы, мальформации и венозный тромбоз',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-d5e0e85f8d0b',
    category: 'Магнитно-резонансная томография',
    title: 'МРТ плода',
    specimen:
      'Биоматериал сдавать не нужно; исследуются органы и структуры плода',
    schedulingGuidance:
      'Только по показаниям после УЗИ; срок определяет акушерская задача',
    purpose:
      'Уточнить сложные или неоднозначные изменения, обнаруженные на УЗИ',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-3bf516550c7f',
    category: 'Эндоскопические исследования',
    title: 'Гастроскопия',
    specimen:
      'Биоматериал сдавать не нужно; камерой исследуются пищевод, желудок и двенадцатиперстная кишка, при необходимости берётся биопсия',
    schedulingGuidance:
      'При симптомах, тревожных признаках или для контроля; повтор зависит от результата',
    purpose:
      'Выявить воспаление, язвы, источник кровотечения и новообразования',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-94f74aaa367f',
    category: 'Эндоскопические исследования',
    title: 'Колоноскопия',
    specimen:
      'Биоматериал сдавать не нужно; камерой исследуется толстая кишка, возможны удаление полипа и биопсия',
    schedulingGuidance:
      'При симптомах или по применимой программе скрининга; следующая дата зависит от результата, риска и гистологии',
    purpose: 'Выявить полипы, рак, воспаление и источник кровотечения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-6998e80d1ca2',
    category: 'Эндоскопические исследования',
    title: 'Ректороманоскопия и аноскопия',
    specimen:
      'Биоматериал сдавать не нужно; исследуются прямая кишка и нижний отдел толстой кишки',
    schedulingGuidance:
      'При боли, кровотечении, изменении стула или по назначению',
    purpose:
      'Диагностировать геморрой, воспаление, полипы и другие локальные изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-fd61544b638b',
    category: 'Эндоскопические исследования',
    title: 'Капсульная эндоскопия',
    specimen:
      'Биоматериал сдавать не нужно; тонкая кишка исследуется проглатываемой камерой',
    schedulingGuidance:
      'По назначению гастроэнтеролога после оценки риска задержки капсулы',
    purpose: 'Найти скрытое кровотечение и изменения тонкой кишки',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-5a421858485e',
    category: 'Эндоскопические исследования',
    title: 'Бронхоскопия',
    specimen:
      'Биоматериал заранее сдавать не нужно; камерой исследуются трахея и бронхи, возможны смывы и биопсия',
    schedulingGuidance: 'Только по клиническим показаниям',
    purpose:
      'Найти опухоль, источник кровотечения, инородное тело или причину изменений лёгких',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-2e1284602bf7',
    category: 'Эндоскопические исследования',
    title: 'Ларингоскопия и назофарингоскопия',
    specimen:
      'Биоматериал сдавать не нужно; исследуются гортань, голосовые связки и носоглотка',
    schedulingGuidance:
      'При стойкой осиплости, нарушении глотания, боли или других ЛОР-симптомах',
    purpose: 'Оценить слизистые, воспалительные и объёмные изменения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['procedure'],
  },
  {
    key: 'catalog-23a4dbe6221c',
    category: 'Эндоскопические исследования',
    title: 'Цистоскопия',
    specimen:
      'Биоматериал сдавать не нужно; исследуются уретра и внутренняя поверхность мочевого пузыря, возможна биопсия',
    schedulingGuidance:
      'При крови в моче, повторных симптомах или подозрительных результатах других исследований',
    purpose: 'Выявить камни, опухоли, воспаление и источник кровотечения',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'hysteroscopy',
    category: 'Эндоскопические исследования',
    title: 'Гистероскопия',
    specimen:
      'Биоматериал заранее сдавать не нужно; камерой исследуется полость матки, возможны биопсия и удаление полипа',
    schedulingGuidance:
      'Планово — обычно вне менструального кровотечения; дата зависит от цикла и задачи, беременность исключается',
    purpose:
      'Выяснить причины аномального кровотечения, бесплодия и изменений эндометрия',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
    illustrationKey: 'hysteroscope',
  },
  {
    key: 'catalog-c7a78daa0c93',
    category: 'Эндоскопические исследования',
    title: 'Кольпоскопия',
    specimen:
      'Биоматериал сдавать не нужно; под увеличением исследуются шейка матки и влагалище, возможна биопсия',
    schedulingGuidance:
      'После отклонений HPV-теста, цитологии или осмотра; обычно вне активного менструального кровотечения',
    purpose: 'Найти участки шейки матки, требующие наблюдения или биопсии',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['invasive', 'procedure'],
  },
  {
    key: 'catalog-91205603eaac',
    category: 'Функциональная диагностика',
    title: 'ЭКГ покоя',
    specimen:
      'Биоматериал сдавать не нужно; записывается электрическая активность сердца',
    schedulingGuidance:
      'При симптомах, перед отдельными вмешательствами или по плану; результат описывает период записи',
    purpose:
      'Оценить ритм, проводимость и признаки нагрузки или повреждения сердца',
    riskTier: 'high',
    requiresClinician: true,
    riskFlags: ['procedure'],
  },
  {
    key: 'catalog-8701b1823da8',
    category: 'Функциональная диагностика',
    title: 'Холтеровское мониторирование ЭКГ',
    specimen:
      'Биоматериал сдавать не нужно; ЭКГ непрерывно записывается в обычной жизни',
    schedulingGuidance:
      'В течение назначенного периода, обычно суток или дольше; полезно зафиксировать привычные симптомы',
    purpose:
      'Выявить эпизодические аритмии и связать симптомы с сердечным ритмом',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-ef802247461a',
    category: 'Функциональная диагностика',
    title: 'Суточное мониторирование давления',
    specimen:
      'Биоматериал сдавать не нужно; давление автоматически измеряется днём и ночью',
    schedulingGuidance:
      'Обычно в течение суток; повтор зависит от диагноза и изменения лечения',
    purpose:
      'Подтвердить гипертонию, оценить ночное давление и эффективность терапии',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-6c94ab7e00eb',
    category: 'Функциональная диагностика',
    title: 'Эхокардиография',
    specimen:
      'Биоматериал сдавать не нужно; ультразвуком исследуются сердце и клапаны',
    schedulingGuidance:
      'По симптомам, шумам, изменениям ЭКГ или для наблюдения заболевания',
    purpose:
      'Выявить клапанные нарушения, сердечную недостаточность и структурные изменения',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-3e98de215256',
    category: 'Функциональная диагностика',
    title: 'Нагрузочная проба или стресс-эхокардиография',
    specimen:
      'Биоматериал сдавать не нужно; сердце оценивается при физической или лекарственной нагрузке',
    schedulingGuidance:
      'По назначению кардиолога после проверки противопоказаний',
    purpose:
      'Выявить скрытую ишемию, нагрузочные аритмии и оценить переносимость нагрузки',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-54e5fc5f3256',
    category: 'Функциональная диагностика',
    title: 'Спирометрия с функциональными пробами',
    specimen:
      'Биоматериал сдавать не нужно; измеряются объёмы и скорость дыхания, иногда до и после препарата',
    schedulingGuidance:
      'При кашле, одышке, астме или для контроля; ограничения лекарств задаёт врач',
    purpose:
      'Выявить нарушение проходимости дыхательных путей и его обратимость',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-d4629a9f36ed',
    category: 'Функциональная диагностика',
    title: 'Пульсоксиметрия',
    specimen:
      'Биоматериал сдавать не нужно; измеряются насыщение крови кислородом и пульс',
    schedulingGuidance:
      'Во время симптомов или мониторинга; показатель актуален только в момент измерения',
    purpose: 'Ориентировочно оценить оксигенацию и выявить её снижение',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-6250fb2d02bc',
    category: 'Функциональная диагностика',
    title: 'Полисомнография',
    specimen:
      'Биоматериал сдавать не нужно; во сне записываются дыхание, кислород, ЭЭГ, движения и ритм сердца',
    schedulingGuidance:
      'Обычно в течение одной ночи; повтор — при изменении симптомов или для оценки лечения',
    purpose: 'Диагностировать апноэ и другие нарушения сна',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-defbc202fa22',
    category: 'Функциональная диагностика',
    title: 'Электроэнцефалография',
    specimen:
      'Биоматериал сдавать не нужно; записывается электрическая активность мозга',
    schedulingGuidance:
      'По назначению невролога; запись проводится в бодрствовании, во сне или длительно',
    purpose:
      'Оценить эпилептическую активность и отдельные нарушения работы мозга',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-168d3fcf2c10',
    category: 'Функциональная диагностика',
    title: 'Электронейромиография',
    specimen:
      'Биоматериал сдавать не нужно; исследуются нервная проводимость и электрическая активность мышц',
    schedulingGuidance:
      'При онемении, слабости, боли или подозрении на повреждение нервов',
    purpose: 'Определить уровень и характер поражения нервов и мышц',
    riskTier: 'clinician',
    requiresClinician: true,
    riskFlags: [],
  },
  {
    key: 'catalog-15d8697cafda',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Домашний тест на беременность',
    specimen: 'Порцию мочи',
    schedulingGuidance:
      'С даты ожидаемой менструации или по инструкции; при задержке и отрицательном результате тест повторяют либо сдают ХГЧ в крови',
    purpose:
      'Предварительно обнаружить ХГЧ и подтвердить вероятную беременность',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-ebdffc4f76ed',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Тест на овуляцию',
    specimen: 'Порцию мочи',
    schedulingGuidance:
      'Несколько дней около предполагаемой овуляции; начало рассчитывается по длине цикла',
    purpose:
      'Выявить подъём ЛГ, который обычно предшествует овуляции, но не подтверждает её факт',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-87d91ec33528',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Тест-полоски для мочи',
    specimen: 'Свежую порцию мочи',
    schedulingGuidance:
      'При симптомах или по плану самоконтроля; результат считывается строго в интервале инструкции',
    purpose:
      'Ориентировочно выявить лейкоциты, нитриты, кровь, белок, глюкозу или кетоны',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-6cfd0fa79c62',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Домашний глюкометр',
    specimen: 'Каплю капиллярной крови',
    schedulingGuidance:
      'Натощак, после еды или по индивидуальному плану; значение актуально в момент измерения',
    purpose:
      'Контролировать глюкозу при диабете, беременности или риске нарушения обмена',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-27f1049e48b6',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Домашнее измерение кетонов',
    specimen: 'Мочу или каплю крови — в зависимости от устройства',
    schedulingGuidance:
      'Во время болезни, выраженной гипергликемии или по индивидуальному плану',
    purpose: 'Рано выявить опасное повышение кетонов, прежде всего при диабете',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-b3bd6401e00a',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Домашнее измерение давления',
    specimen:
      'Биоматериал сдавать не нужно; тонометром измеряются давление и пульс',
    schedulingGuidance:
      'По графику врача, обычно сериями утром и вечером; каждое значение актуально в момент измерения',
    purpose:
      'Наблюдать гипертонию, оценивать лечение и контролировать давление при беременности',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-e4eacb1f6dd5',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Экспресс-тесты на респираторные инфекции',
    specimen: 'Мазок из носа или носоглотки по инструкции набора',
    schedulingGuidance:
      'В период симптомов и диагностическое окно производителя; отрицательный результат не всегда исключает инфекцию',
    purpose: 'Быстро обнаружить антигены отдельных вирусов или бактерий',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-faa56b1253a6',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Экспресс-тест на ВИЧ',
    specimen: 'Каплю крови или образец ротовой жидкости — по типу набора',
    schedulingGuidance:
      'После возможного контакта с учётом окна теста; ранний отрицательный результат может потребовать повторения',
    purpose:
      'Выполнить предварительный скрининг; положительный результат подтвердить лабораторно',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-7d09c0bdcc7f',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Домашний тест вагинального pH',
    specimen: 'Образец вагинального отделяемого',
    schedulingGuidance:
      'При симптомах, вне менструации и с учётом ограничений инструкции',
    purpose:
      'Ориентировочно оценить изменение кислотности; тест не определяет точную причину симптомов',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
  {
    key: 'catalog-bacf48a61aec',
    category: 'Экспресс-тесты и домашняя диагностика',
    title: 'Самостоятельный забор на HPV или ИППП',
    specimen:
      'Вагинальный мазок, мочу или другой материал валидированного набора, отправляемый в лабораторию',
    schedulingGuidance:
      'По возрасту, риску, симптомам и программе скрининга; повтор зависит от теста и результата',
    purpose:
      'Повысить доступность лабораторного тестирования без визита для забора материала',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
  },
];

function curateRisk(
  entry: GeneratedAnalysisCatalogEntry,
): AnalysisCatalogEntry {
  const category = entry.category.toLocaleLowerCase('ru-RU');
  const searchable =
    `${entry.title} ${entry.schedulingGuidance}`.toLocaleLowerCase('ru-RU');
  const flags: AnalysisCatalogRiskFlag[] = [];
  const genetic = category.includes('генетичес');
  const radiation =
    category.includes('рентгенологичес') ||
    category.includes('компьютерная томография');
  const invasive =
    category.includes('цитология и биопсия') ||
    category.includes('эндоскопичес') ||
    entry.title === 'Амниотическая жидкость' ||
    entry.title === 'Специализированные жидкости';
  const procedure = category.includes('эндоскопичес');
  const contrast =
    (radiation || category.includes('магнитно-резонанс')) &&
    searchable.includes('контраст');
  if (invasive) flags.push('invasive');
  if (radiation) flags.push('radiation');
  if (contrast) flags.push('contrast');
  if (genetic) flags.push('genetic');
  if (procedure) flags.push('procedure');
  return {
    ...entry,
    constraints: [
      ...(flags.length
        ? ['Не переводить в текущий план без подтверждения профильного врача']
        : []),
      ...(entry.requiresClinician
        ? ['Необходимость и срок обсуждаются с врачом']
        : []),
    ],
    riskFlags: flags,
    riskTier: flags.length
      ? 'high'
      : entry.requiresClinician
        ? 'clinician'
        : 'low',
  };
}

export const analysisCatalog: AnalysisCatalogEntry[] =
  generatedAnalysisCatalog.map(curateRisk);

export const analysisCatalogByKey = new Map(
  analysisCatalog.map((entry) => [entry.key, entry]),
);
