import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importVercel } from '../src/cli/importVercel';

// A stand-in for the Vercel CLI: answers `vercel metrics ...` like the real one, banner and
// trailing noise included, with two days of data.
const FAKE_VERCEL = `#!/usr/bin/env node
const args = process.argv.slice(2);
const day = (n) => new Date(Date.UTC(...(() => { const d = new Date(); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - n]; })())).toISOString();
const group = args.includes('--group-by') ? args[args.indexOf('--group-by') + 1] : null;
const unique = args.includes('-a');
const V = 'vercel_analytics_pageview_count_sum', U = 'vercel_analytics_pageview_count_unique_visitor_id';
let data;
if (unique) data = [{ timestamp: day(2), [U]: 3 }, { timestamp: day(1), [U]: 5 }];
else if (!group) data = [{ timestamp: day(2), [V]: 4 }, { timestamp: day(1), [V]: 9 }];
else if (group === 'browser_name') data = [
  { timestamp: day(2), [V]: 3, browser_name: 'Mobile Safari' }, { timestamp: day(2), [V]: 1, browser_name: 'Safari' },
  { timestamp: day(1), [V]: 9, browser_name: 'Chrome' }];
else if (group === 'request_path') data = [{ timestamp: day(2), [V]: 4, request_path: '/' }, { timestamp: day(1), [V]: 9, request_path: '/blog' }];
else data = [];
console.log('Vercel CLI 56.3.1');
console.log(JSON.stringify({ query: { note: 'braces } in a "string {"' }, data }, null, 2));
console.log('Retrieving project… {not json}');
`;

describe('importVercel', () => {
  let dir: string;
  let path: string | undefined;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'jialytics-cli-'));
    writeFileSync(join(dir, 'vercel'), FAKE_VERCEL);
    chmodSync(join(dir, 'vercel'), 0o755);
    path = process.env.PATH;
    process.env.PATH = `${dir}:${path}`;
  });
  afterAll(() => {
    process.env.PATH = path;
  });

  it('writes per-day history, merging into what the file already has', () => {
    const out = join(dir, 'history.json');
    writeFileSync(out, JSON.stringify({ days: { '2020-01-01': { views: 7, visitors: 2 } } }));
    const result = importVercel({ days: 31, out });
    expect(result).toMatchObject({ pulled: 2, total: 3, views: 7 + 4 + 9 });
    const { days } = JSON.parse(readFileSync(out, 'utf8'));
    const [older, newer] = Object.keys(days).slice(1);
    expect(days['2020-01-01']).toEqual({ views: 7, visitors: 2 });
    expect(days[older]).toEqual({ views: 4, visitors: 3, pages: { '/': 4 }, browsers: { Safari: 4 } });
    expect(days[newer]).toEqual({ views: 9, visitors: 5, pages: { '/blog': 9 }, browsers: { Chrome: 9 } });
  });

  it('refuses an empty window', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(() => importVercel({ days: 0, out: join(dir, 'x.json'), until: today })).toThrow(/nothing to pull/);
  });
});
