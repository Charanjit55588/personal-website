#!/usr/bin/env node
// Sync GitHub repositories into the "From GitHub" block of projects.html.
//
// Only the content between the AUTO-PROJECTS markers in projects.html and the
// snapshot in data/projects.json are ever written. Everything else on the site
// is left byte-for-byte unchanged (the script checks this before writing).
//
// Usage:
//   node scripts/sync-projects.mjs              # update files
//   node scripts/sync-projects.mjs --dry-run    # print what would change, write nothing
//   node scripts/sync-projects.mjs --summary out.md   # also write a Markdown change summary
//
// Env: GITHUB_TOKEN (optional locally, used in CI to avoid rate limits).
// No dependencies; needs Node 18+.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = resolve(ROOT, 'projects.html');
const CONFIG = resolve(ROOT, 'data/projects.config.json');
const SNAPSHOT = resolve(ROOT, 'data/projects.json');
const START_RE = /<!-- AUTO-PROJECTS:START[^>]*-->/;
const END = '<!-- AUTO-PROJECTS:END -->';
const CARD_INDENT = '        ';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const summaryIdx = args.indexOf('--summary');
const SUMMARY_PATH = summaryIdx >= 0 ? args[summaryIdx + 1] : null;

// ---------- GitHub ----------

async function fetchRepos(username) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'portfolio-project-sync',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const repos = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  // The user repos endpoint only returns public repos for other users, but be explicit.
  return repos.filter(r => !r.private).map(r => ({
    name: r.name,
    description: r.description || '',
    url: r.html_url,
    homepage: r.homepage || '',
    language: r.language || '',
    topics: [...(r.topics || [])].sort(),
    stars: r.stargazers_count,
    created: r.created_at,
    updated: r.updated_at,
    pushed: r.pushed_at,
    fork: r.fork,
    archived: r.archived,
  }));
}

// ---------- Selection ----------

function select(repos, config, now) {
  const s = config.settings || {};
  const hidden = new Set((config.hidden || []).map(n => n.toLowerCase()));
  const pinned = (config.pinned || []).map(n => n.toLowerCase());
  const featuredCfg = new Set((config.featured || []).map(n => n.toLowerCase()));
  const featuredTopics = new Set(s.featuredTopics || []);
  const activeMs = (s.activeDays ?? 60) * 86400000;
  const siteRepo = process.env.GITHUB_REPOSITORY?.split('/')[1]?.toLowerCase() || 'personal-website';

  const shown = [];
  const skipped = [];
  for (const r of repos) {
    const key = r.name.toLowerCase();
    let reason = null;
    if (key === siteRepo) reason = 'the website repo itself';
    else if (hidden.has(key)) reason = 'in hidden list';
    else if (s.excludeForks !== false && r.fork) reason = 'fork';
    else if (s.excludeArchived !== false && r.archived) reason = 'archived';
    if (reason) { skipped.push({ name: r.name, reason }); continue; }

    const featured = featuredCfg.has(key) || r.topics.some(t => featuredTopics.has(t));
    const active = now - Date.parse(r.pushed) <= activeMs;
    const popular = r.stars >= (s.starHighlight ?? 5);
    shown.push({ ...r, featured, active, highlight: featured || active || popular, pinIndex: pinned.indexOf(key) });
  }

  shown.sort((a, b) => {
    const pa = a.pinIndex < 0 ? Infinity : a.pinIndex;
    const pb = b.pinIndex < 0 ? Infinity : b.pinIndex;
    if (pa !== pb) return pa - pb;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.highlight !== b.highlight) return a.highlight ? -1 : 1;
    return Date.parse(b.pushed) - Date.parse(a.pushed) || a.name.localeCompare(b.name);
  });
  skipped.sort((a, b) => a.name.localeCompare(b.name));
  return { shown, skipped };
}

// ---------- Rendering (matches the existing .card markup in projects.html) ----------

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const cleanDescription = d => d.replace(/:[a-z0-9_+-]+:\s*/gi, '').trim();

const prettyName = name => name
  .replace(/[-_]+/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/\b\w/g, c => c.toUpperCase());

const monthYear = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function renderCard(r, custom = {}) {
  const title = custom.title || prettyName(r.name);
  const description = custom.description || cleanDescription(r.description) || 'Source code and notes on GitHub.';
  const demo = custom.demo || r.homepage;
  const tags = custom.tags || [...new Set([r.language, ...r.topics].filter(Boolean))].slice(0, 5);

  let badge;
  if (r.featured) badge = '<span class="badge pass">Featured</span>';
  else if (r.active) badge = '<span class="badge running">Active</span>';
  else badge = '<span class="badge blue">On GitHub</span>';

  const meta = [r.language, `updated ${monthYear(r.pushed)}`, r.stars > 0 ? `★ ${r.stars}` : null]
    .filter(Boolean).join(' · ');

  const links = [`<a class="more" href="${esc(r.url)}" target="_blank" rel="noopener">View repo →</a>`];
  if (demo) links.push(`<a class="more" href="${esc(demo)}" target="_blank" rel="noopener" style="margin-left:16px;">Live demo →</a>`);

  const i = CARD_INDENT;
  return [
    `${i}<div class="card" data-repo="${esc(r.name)}">`,
    `${i}  ${badge}`,
    `${i}  <h3>${esc(title)}</h3>`,
    `${i}  <p><strong>GitHub</strong> — ${esc(meta)}</p>`,
    `${i}  <p>${esc(description)}</p>`,
    tags.length ? `${i}  <div class="tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : null,
    `${i}  ${links.join('')}`,
    `${i}</div>`,
  ].filter(l => l !== null).join('\n');
}

// ---------- Page splice + safety checks ----------

function splice(html, inner) {
  const starts = html.match(new RegExp(START_RE.source, 'g')) || [];
  const ends = html.split(END).length - 1;
  if (starts.length !== 1 || ends !== 1) {
    throw new Error(`projects.html must contain exactly one AUTO-PROJECTS START and END marker (found ${starts.length}/${ends}).`);
  }
  const startMatch = html.match(START_RE);
  const startEnd = startMatch.index + startMatch[0].length;
  const endIdx = html.indexOf(END);
  if (endIdx < startEnd) throw new Error('AUTO-PROJECTS:END appears before START.');

  const before = html.slice(0, startEnd);
  const after = html.slice(endIdx);
  const out = `${before}\n${inner ? inner + '\n' : ''}${after}`;

  // Everything outside the markers must be identical.
  if (!out.startsWith(before) || !out.endsWith(after)) throw new Error('Refusing to write: content outside markers would change.');
  return out;
}

// ---------- Diffing against the previous snapshot ----------

const TRACKED = ['description', 'homepage', 'language', 'topics', 'stars', 'pushed'];

function diffSnapshot(prev, next) {
  const prevMap = new Map((prev?.repos || []).map(r => [r.name, r]));
  const nextNames = new Set(next.map(r => r.name));
  const added = [], updated = [], removed = [];
  for (const r of next) {
    const p = prevMap.get(r.name);
    if (!p) { added.push(r.name); continue; }
    const changed = TRACKED.filter(k => JSON.stringify(p[k]) !== JSON.stringify(r[k]));
    if (changed.length) updated.push(`${r.name} (${changed.join(', ')})`);
  }
  for (const name of prevMap.keys()) if (!nextNames.has(name)) removed.push(name);
  return { added, updated, removed };
}

function simpleDiff(a, b) {
  const al = a.split('\n'), bl = b.split('\n');
  let s = 0;
  while (s < al.length && s < bl.length && al[s] === bl[s]) s++;
  let ea = al.length - 1, eb = bl.length - 1;
  while (ea >= s && eb >= s && al[ea] === bl[eb]) { ea--; eb--; }
  return [
    `@@ line ${s + 1} @@`,
    ...al.slice(s, ea + 1).map(l => `- ${l}`),
    ...bl.slice(s, eb + 1).map(l => `+ ${l}`),
  ].join('\n');
}

// ---------- Main ----------

async function main() {
  const config = JSON.parse(await readFile(CONFIG, 'utf8'));
  const html = await readFile(PAGE, 'utf8');
  let prev = null;
  try { prev = JSON.parse(await readFile(SNAPSHOT, 'utf8')); } catch { /* first run */ }

  const repos = await fetchRepos(config.username);
  const { shown, skipped } = select(repos, config, Date.now());
  const custom = config.custom || {};

  const inner = shown.map(r => renderCard(r, custom[r.name])).join('\n\n');
  const newHtml = splice(html, inner);

  const snapshotRepos = shown.map(({ pinIndex, fork, archived, updated, ...r }) => r);
  const newSnapshot = JSON.stringify({ username: config.username, repos: snapshotRepos }, null, 2) + '\n';
  JSON.parse(newSnapshot); // validate

  const changes = diffSnapshot(prev, snapshotRepos);
  const pageChanged = newHtml !== html;
  const snapChanged = !prev || newSnapshot !== JSON.stringify(prev, null, 2) + '\n';

  const list = (items, empty = '_none_') => items.length ? items.map(i => `- ${i}`).join('\n') : empty;
  const summary = [
    '## GitHub project sync',
    '',
    `**Added:**\n${list(changes.added)}`,
    '',
    `**Updated:**\n${list(changes.updated)}`,
    '',
    `**Removed from site:**\n${list(changes.removed)}`,
    '',
    `**Highlighted:**\n${list(shown.filter(r => r.highlight).map(r =>
      `${r.name} (${[r.featured && 'featured', r.active && 'active', r.stars >= (config.settings?.starHighlight ?? 5) && 'stars'].filter(Boolean).join(', ')})`))}`,
    '',
    `<details><summary>Skipped (${skipped.length})</summary>\n\n${list(skipped.map(s => `${s.name}: ${s.reason}`))}\n\n</details>`,
    '',
  ].join('\n');

  console.log(summary);

  if (!pageChanged && !snapChanged) {
    console.log('No changes. Site is already in sync.');
  } else if (DRY_RUN) {
    console.log('--- DRY RUN: nothing written. projects.html diff ---');
    console.log(pageChanged ? simpleDiff(html, newHtml) : '(projects.html unchanged; only the snapshot would change)');
  } else {
    if (pageChanged) await writeFile(PAGE, newHtml);
    await mkdir(dirname(SNAPSHOT), { recursive: true });
    if (snapChanged) await writeFile(SNAPSHOT, newSnapshot);
    console.log(`Wrote ${[pageChanged && 'projects.html', snapChanged && 'data/projects.json'].filter(Boolean).join(' and ')}.`);
  }

  if (SUMMARY_PATH) await writeFile(SUMMARY_PATH, summary);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
