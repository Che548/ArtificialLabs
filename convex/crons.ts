import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'purge accounts after recovery window',
  { hourUTC: 2, minuteUTC: 15 },
  internal.account.purgeExpired,
  {},
);

crons.hourly(
  'purge expired AI agent continuations',
  { minuteUTC: 7 },
  internal.agent.purgeExpiredRuns,
  {},
);

crons.hourly(
  'review due synced AI agent plans',
  { minuteUTC: 17 },
  internal.agentPlan.reviewDueSynced,
  {},
);

crons.interval(
  'aggregate telemetry watchdog',
  { minutes: 5 },
  internal.telemetry.watchdog,
  {},
);

crons.hourly(
  'purge expired service checks',
  { minuteUTC: 47 },
  internal.monitoringData.cleanupExpired,
  {},
);

crons.hourly(
  'purge expired telemetry',
  { minuteUTC: 37 },
  internal.telemetry.cleanupExpired,
  {},
);

crons.hourly(
  'purge expired SMS rate limits',
  { minuteUTC: 27 },
  internal.smsAuth.cleanupAttempts,
  {},
);

crons.hourly(
  'purge expired SMS delivery hints',
  { minuteUTC: 43 },
  internal.smsAuth.cleanupDeliveryHints,
  {},
);

crons.hourly(
  'purge unverified phone accounts',
  { minuteUTC: 57 },
  internal.smsAuth.cleanupUnverifiedAccounts,
  {},
);

crons.interval(
  'check admin services',
  { minutes: 5 },
  internal.monitoring.checkServices,
  {},
);

export default crons;
