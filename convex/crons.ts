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

export default crons;
