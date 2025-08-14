#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Mustache from 'mustache';
import { createObjectCsvWriter } from 'csv-writer';
import { ApifyDiscoveryProvider } from './apify-provider.mjs';
import { isUSLike, inferTimezoneFromText } from './us-lexicon.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i+1] : def;
}

// Configuration flags
const US_ONLY = ['1','true','yes'].includes((arg('usOnly')||'').toLowerCase());
const TZ_DEFAULT = arg('tzDefault','ET');
const MIN_FOLLOWERS = Number(arg('minFollowers', '3000'));
const MIN_SCORE = Number(arg('minScore', '2'));
const TOP_K = Number(arg('top', '300'));

function score(c, minFollowers=MIN_FOLLOWERS) {
  let s = 0;
  if ((c.followers ?? 0) >= minFollowers) s += 2;
  if ((c.caption||'').match(/(collab|agency|manager|growth|ugc|creator|brand|deals)/i)) s += 1;
  if (c.url) s += 1;
  return s;
}

function guessUS(meta) {
  const pool = [
    meta.caption || '',
    meta.ownerBiography || '',
    meta.bio || ''
  ].join(' • ');
  const isUS = isUSLike(pool);
  const tz = inferTimezoneFromText(pool) || TZ_DEFAULT;
  return { isUS, tz };
}

function loadTemplates() {
  const tplPath = path.resolve(__dirname, '../../saas-closer-templates.json');
  const raw = fs.readFileSync(tplPath, 'utf8');
  return JSON.parse(raw);
}

function renderMsg(username, lang='en') {
  const TPL = loadTemplates();
  const raw = TPL.templates?.R1_VALUE_PROP?.[lang] || TPL.templates?.R1_VALUE_PROP?.en;
  return Mustache.render(raw, { username, signup_link: 'https://example.com/beta' });
}

async function runHashtag() {
  const hashtags = arg('hashtags', 'onlyfansusa,ugcmodel,miamimodel,nycmodel');
  const limit = Number(arg('limit', '150'));
  const out = path.resolve(__dirname, arg('out', '../../out/dm_todo_us.csv'));
  const provider = new ApifyDiscoveryProvider({ token: process.env.APIFY_TOKEN });

  // Parse multiple hashtags
  const listQs = hashtags.split(',').map(h => h.trim()).filter(Boolean);
  
  console.log(`🔎 Apify discovery for US market`);
  console.log(`📌 Hashtags: ${listQs.join(', ')}`);
  console.log(`🎯 Settings: limit=${limit}/hashtag, minFollowers=${MIN_FOLLOWERS}, minScore=${MIN_SCORE}, top=${TOP_K}`);
  if (US_ONLY) console.log(`🇺🇸 US-only filter enabled`);

  // Collect from all hashtags
  let all = [];
  for (const h of listQs) {
    console.log(`  → Fetching #${h}...`);
    try {
      const part = await provider.discoverByHashtag(h, limit);
      all = all.concat(part);
      console.log(`    ✓ Found ${part.length} profiles`);
    } catch (e) {
      console.error(`    ✗ Error with #${h}: ${e.message}`);
    }
  }

  // Dedupe by username (case-insensitive)
  const byUser = new Map();
  for (const it of all) {
    const key = (it.username||'').toLowerCase();
    if (!key) continue;
    if (!byUser.has(key)) byUser.set(key, it);
  }

  // Score, filter US, and prepare rows
  const rows = [];
  let usFiltered = 0;
  
  for (const [usernameKey, it] of byUser) {
    const s = score(it);
    if (s < MIN_SCORE) continue;

    // US filter + timezone guess
    const meta = guessUS({ 
      caption: it.caption, 
      ownerBiography: it.ownerBiography || it.bio 
    });
    
    if (US_ONLY && !meta.isUS) {
      usFiltered++;
      continue;
    }

    rows.push({
      username: it.username,
      platform: 'instagram',
      followers: it.followers ?? '',
      message: renderMsg(it.username, 'en'), // English for US market
      score: s,
      tz: meta.tz
    });
  }

  // Sort by score and take top K
  rows.sort((a,b) => b.score - a.score);
  const top = rows.slice(0, TOP_K);

  // Export CSV with timezone column
  const writer = createObjectCsvWriter({
    path: out,
    header: [
      { id:'username',  title:'username' },
      { id:'platform',  title:'platform' },
      { id:'followers', title:'followers' },
      { id:'message',   title:'message' },
      { id:'tz',        title:'tz' }
    ]
  });
  
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await writer.writeRecords(top);
  
  console.log(`\n📊 Results:`);
  console.log(`  • Total profiles found: ${all.length}`);
  console.log(`  • After dedup: ${byUser.size}`);
  console.log(`  • Score qualified: ${rows.length}`);
  if (US_ONLY) console.log(`  • US-filtered out: ${usFiltered}`);
  console.log(`  • Top K exported: ${top.length}`);
  console.log(`\n✅ CSV ready: ${out}`);
}

async function runExport() {
  const inFile = path.resolve(__dirname, arg('in', '../../out/apify_dataset.json'));
  const out = path.resolve(__dirname, arg('out', '../../out/dm_todo_us.csv'));
  const json = JSON.parse(fs.readFileSync(inFile,'utf8'));
  
  const byUser = new Map();
  for (const it of json) {
    const key = (it.ownerUsername || it.username || '').toLowerCase();
    if (!key) continue;
    if (!byUser.has(key)) byUser.set(key, it);
  }
  
  const rows = [];
  let usFiltered = 0;
  
  for (const [usernameKey, it] of byUser) {
    const s = score({ 
      followers: it.ownerFollowersCount || it.followers, 
      caption: it.caption, 
      url: it.url 
    });
    if (s < MIN_SCORE) continue;

    // US filter + timezone guess
    const meta = guessUS({ 
      caption: it.caption, 
      ownerBiography: it.ownerBiography || it.bio 
    });
    
    if (US_ONLY && !meta.isUS) {
      usFiltered++;
      continue;
    }

    rows.push({
      username: it.ownerUsername || it.username,
      platform: 'instagram',
      followers: it.ownerFollowersCount || it.followers || '',
      message: renderMsg(it.ownerUsername || it.username, 'en'),
      score: s,
      tz: meta.tz
    });
  }
  
  rows.sort((a,b) => b.score - a.score);
  const top = rows.slice(0, TOP_K);
  
  const writer = createObjectCsvWriter({
    path: out,
    header: [
      { id:'username',  title:'username' },
      { id:'platform',  title:'platform' },
      { id:'followers', title:'followers' },
      { id:'message',   title:'message' },
      { id:'tz',        title:'tz' }
    ]
  });
  
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await writer.writeRecords(top);
  
  console.log(`\n📊 Results:`);
  console.log(`  • Total in dataset: ${json.length}`);
  console.log(`  • After dedup: ${byUser.size}`);
  console.log(`  • Score qualified: ${rows.length}`);
  if (US_ONLY) console.log(`  • US-filtered out: ${usFiltered}`);
  console.log(`  • Top K exported: ${top.length}`);
  console.log(`\n✅ CSV ready: ${out}`);
}

const sub = process.argv[2];
if (sub === 'hashtag') runHashtag().catch(e=>{ console.error(e); process.exit(1); });
else if (sub === 'export') runExport().catch(e=>{ console.error(e); process.exit(1); });
else {
  console.log(`Usage:
  APIFY_TOKEN=xxx node src/apify-discover-export.mjs hashtag \\
    --hashtags onlyfansusa,ugcmodel,miamimodel,nycmodel \\
    --limit 150 --minFollowers 4000 --minScore 2 --top 300 \\
    --usOnly true --tzDefault ET
    
  node src/apify-discover-export.mjs export \\
    --in ../../out/apify_dataset.json --out ../../out/dm_todo_us.csv \\
    --minFollowers 4000 --minScore 2 --top 300 --usOnly true`);
}