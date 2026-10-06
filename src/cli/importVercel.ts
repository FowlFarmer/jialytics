import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DIMENSIONS, type Dimension, type History } from '../core/types';

export const HELP = `jialytics: so you don't have to pay $22 just to see all-time analytics

Usage
  npx jialytics import-vercel [options]

  Pulls Vercel Web Analytics into a per-day history file, merged into whatever the file
  already has (pulled days replace the same days; every other day is kept). Pass the file to
  createJialytics({ history }) and the dashboard shows those days too.

  Run it in a directory linked to your Vercel project (\`vercel link\`), with the Vercel CLI
  logged in. Hobby keeps 31 days, Pro 12 months: run it before they expire.

Options
  --days <n>         Days back from today to pull (default 31, the Hobby limit)
  --until <date>     Stop before this UTC date, YYYY-MM-DD: set it to the day your tracker went
                     live so imported and tracked days never overlap (default: today)
  --out <file>       History file (default jialytics-history.json)
  --project <name>   Vercel project, if this directory isn't linked
  --help             Show this
`;

const METRIC = 'vercel.analytics_pageview.count';
const VIEWS = 'vercel_analytics_pageview_count_sum';
const VISITORS = 'vercel_analytics_pageview_count_unique_visitor_id';
// Vercel's dimension for each breakdown. It has no city or UTM source.
const VERCEL_DIMENSIONS: Partial<Record<Dimension, string>> = {
  pages: 'request_path',
  referrers: 'referrer_hostname',
  countries: 'country',
  devices: 'device_type',
  browsers: 'browser_name',
  os: 'os_name',
};
// Vercel's names -> the tracker's, so the same browser or OS lands in one row.
const RENAME: Partial<Record<Dimension, Record<string, string>>> = {
  browsers: {
    'Mobile Safari': 'Safari',
    'Chrome Mobile': 'Chrome',
    'Chrome Mobile iOS': 'Chrome',
    'Microsoft Edge': 'Edge',
    'Firefox Mobile': 'Firefox',
    'Firefox Mobile iOS': 'Firefox',
    'Samsung Browser': 'Samsung Internet',
  },
  os: { Mac: 'macOS', 'GNU/Linux': 'Linux', Ubuntu: 'Linux', 'Chrome OS': 'ChromeOS' },
};
const DAY_MS = 24 * 60 * 60 * 1000;

function query(since: string, until: string, project: string | undefined, extra: string[]) {
  const args = ['metrics', METRIC, '--prod', '-s', since, '-u', until, '-g', '1d', '-F', 'json', ...extra];
  if (project) args.push('-p', project);
  const result = spawnSync('vercel', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.error) throw new Error(`couldn't run the Vercel CLI (npm i -g vercel): ${result.error.message}`);
  const text = `${result.stdout}${result.stderr}`;
  const start = text.indexOf('{');
  if (start < 0) throw new Error(text.trim() || 'no output from the Vercel CLI');
  // The CLI can print more after the JSON; read just the first object.
  let depth = 0;
  let end = start;
  let inString = false;
  for (; end < text.length; end += 1) {
    const char = text[end];
    if (inString) {
      if (char === '\\') end += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) break;
  }
  const data = JSON.parse(text.slice(start, end + 1));
  if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
  return data.data as Record<string, any>[];
}

export function importVercel(options: { days: number; until?: string; out: string; project?: string }) {
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const until = Math.min(today, options.until ? Date.parse(options.until) : today);
  const since = today - options.days * DAY_MS;
  if (Number.isNaN(until)) throw new Error(`--until must be YYYY-MM-DD, got ${options.until}`);
  if (since >= until) throw new Error('nothing to pull: the window starts on or after --until');
  const [s, u] = [new Date(since).toISOString(), new Date(until).toISOString()];

  const pulled: History['days'] = {};
  const dayOf = (row: Record<string, any>) => (pulled[String(row.timestamp).slice(0, 10)] ??= { views: 0, visitors: 0 });
  for (const row of query(s, u, options.project, [])) dayOf(row).views = row[VIEWS] ?? 0;
  for (const row of query(s, u, options.project, ['-a', 'unique/visitor_id'])) dayOf(row).visitors = row[VISITORS] ?? 0;
  for (const dimension of DIMENSIONS) {
    const vercel = VERCEL_DIMENSIONS[dimension];
    if (!vercel) continue;
    for (const row of query(s, u, options.project, ['--group-by', vercel, '-l', '50'])) {
      const raw = row[vercel];
      if (raw === null || raw === undefined || raw === '' || !row[VIEWS]) continue;
      const key = RENAME[dimension]?.[String(raw)] ?? String(raw);
      const counts = (dayOf(row)[dimension] ??= {});
      counts[key] = (counts[key] ?? 0) + row[VIEWS];
    }
  }
  for (const day of Object.keys(pulled)) if (!pulled[day].views) delete pulled[day];

  const existing: History['days'] = existsSync(options.out) ? JSON.parse(readFileSync(options.out, 'utf8')).days ?? {} : {};
  const days = Object.fromEntries(Object.entries({ ...existing, ...pulled }).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(options.out, `${JSON.stringify({ source: 'Vercel Web Analytics, via npx jialytics import-vercel', days }, null, 1)}\n`);
  const views = Object.values(days).reduce((sum, day) => sum + day.views, 0);
  return { pulled: Object.keys(pulled).length, total: Object.keys(days).length, views, from: s.slice(0, 10), until: u.slice(0, 10) };
}
