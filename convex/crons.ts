import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'purge accounts after recovery window',
  { hourUTC: 2, minuteUTC: 15 },
  internal.account.purgeExpired,
  {},
);

export default crons;
