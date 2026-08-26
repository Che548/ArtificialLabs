const fs = require('node:fs');

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Output path is required');

const now = Date.now();
const commonPlan = {
  scheduleBasis: 'user',
  confidence: 1,
  provisional: false,
  evidenceRefs: [],
  rationale: 'E2E проверка local-first импорта',
  policyVersion: '2026-08-20-medical-agent-v1',
  catalogVersion: '2026-08-20-v1',
  updatedAt: now,
};

fs.writeFileSync(
  outputPath,
  JSON.stringify({
    schema: 'artificiallabs-health-archive',
    version: 1,
    exportedAt: now,
    profile: null,
    entities: {
      journalEntries: [
        {
          localId: `e2e-import-${now}`,
          entryDate: now,
          symptoms: ['E2E импорт'],
          notes: 'Проверка JSON import',
          updatedAt: now,
        },
      ],
      carePlanItems: [
        {
          ...commonPlan,
          localId: `e2e-plan-current-${now}`,
          catalogKey: 'catalog-1cb59c774d23',
          title: 'Глюкоза',
          category: 'Исследования крови',
          description: 'Кровь, часто натощак',
          status: 'current',
          riskTier: 'low',
          dueAt: now,
          requiresClinician: false,
        },
        {
          ...commonPlan,
          localId: `e2e-plan-upcoming-${now}`,
          catalogKey: 'hysteroscopy',
          title: 'Гистероскопия',
          category: 'Эндоскопические исследования',
          description:
            'Биоматериал заранее сдавать не нужно; камерой исследуется полость матки, возможны биопсия и удаление полипа',
          status: 'upcoming',
          riskTier: 'high',
          dueAt: now + 30 * 86_400_000,
          requiresClinician: true,
          illustrationKey: 'hysteroscope',
        },
      ],
    },
  }),
);
