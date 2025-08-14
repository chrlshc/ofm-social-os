#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Mustache from 'mustache';
import { createObjectCsvWriter } from 'csv-writer';
import { ApifyDiscoveryProvider } from './apify-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i+1] : def;
}

function score(c, minFollowers=3000) {
  let s = 0;
  if ((c.followers ?? 0) >= minFollowers) s += 2;
  if ((c.caption||'').match(/(collab|agency|manager|growth|ugc)/i)) s += 1;
  if (c.url) s += 1;
  return s;
}

function loadTemplates() {
  // utilise tes templates existants à la racine outreach/
  const tplPath = path.resolve(__dirname, '../../saas-closer-templates.json');
  const raw = fs.readFileSync(tplPath, 'utf8');
  return JSON.parse(raw);
}

function renderMsg(username, lang='fr') {
  const TPL = loadTemplates();
  const raw = TPL.templates?.R1_VALUE_PROP?.[lang] || TPL.templates?.R1_VALUE_PROP?.en;
  return Mustache.render(raw, { username, signup_link: 'https://example.com/beta' });
}

async function runHashtag() {
  const q = arg('q', 'onlyfanscreator');
  const limit = Number(arg('limit', '200'));
  const out = path.resolve(__dirname, arg('out', '../../out/dm_todo.csv'));
  const provider = new ApifyDiscoveryProvider({ token: process.env.APIFY_TOKEN });

  console.log(`🔎 Apify discovery hashtag #${q} (limit ${limit})`);
  const list = await provider.discoverByHashtag(q, limit);

  // dedupe + score
  const byUser = new Map();
  for (const it of list) if (it.username && !byUser.has(it.username)) byUser.set(it.username, it);
  const rows = [];
  for (const [username, it] of byUser) {
    const s = score(it);
    if (s < 2) continue;
    rows.push({
      username,
      platform: 'instagram',
      followers: it.followers ?? '',
      message: renderMsg(username, 'fr'),
      score: s
    });
  }
  rows.sort((a,b)=>b.score-a.score);

  // export CSV
  const writer = createObjectCsvWriter({
    path: out,
    header: [
      { id:'username', title:'username' },
      { id:'platform', title:'platform' },
      { id:'followers', title:'followers' },
      { id:'message', title:'message' }
    ]
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await writer.writeRecords(rows);
  console.log(`✅ CSV prêt: ${out} (${rows.length} leads)`);
}

async function runExport() {
  // Option: partir d'un JSON de dataset déjà exporté
  const inFile = path.resolve(__dirname, arg('in', '../../out/apify_dataset.json'));
  const out = path.resolve(__dirname, arg('out', '../../out/dm_todo.csv'));
  const json = JSON.parse(fs.readFileSync(inFile,'utf8'));
  const byUser = new Map();
  for (const it of json) if (it.ownerUsername && !byUser.has(it.ownerUsername)) byUser.set(it.ownerUsername, it);
  const rows = [];
  for (const [username, it] of byUser) {
    const s = score({ followers: it.ownerFollowersCount, caption: it.caption, url: it.url });
    if (s < 2) continue;
    rows.push({
      username,
      platform: 'instagram',
      followers: it.ownerFollowersCount ?? '',
      message: renderMsg(username, 'fr'),
      score: s
    });
  }
  rows.sort((a,b)=>b.score-a.score);
  const writer = createObjectCsvWriter({
    path: out,
    header: [
      { id:'username', title:'username' },
      { id:'platform', title:'platform' },
      { id:'followers', title:'followers' },
      { id:'message', title:'message' }
    ]
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await writer.writeRecords(rows);
  console.log(`✅ CSV prêt: ${out} (${rows.length} leads)`);
}

const sub = process.argv[2];
if (sub === 'hashtag') runHashtag().catch(e=>{ console.error(e); process.exit(1); });
else if (sub === 'export') runExport().catch(e=>{ console.error(e); process.exit(1); });
else {
  console.log(`Usage:
  APIFY_TOKEN=xxx node src/apify-discover-export.mjs hashtag --q onlyfanscreator --limit 200 --out ../../out/dm_todo.csv
  node src/apify-discover-export.mjs export --in ../../out/apify_dataset.json --out ../../out/dm_todo.csv`);
}