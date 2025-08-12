// node >= 18
import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((v,i,arr)=>{
  if(!v.startsWith('--')) return [];
  const key = v.slice(2);
  const val = (arr[i+1] && !arr[i+1].startsWith('--')) ? arr[i+1] : true;
  return [key, val];
}).filter(Boolean));

const TARGET = (args.target ?? '@target').toLowerCase();
const MODEL  = (args.model_name ?? 'model').toLowerCase();
const CITY   = (args.city ?? '{city}').toLowerCase();
const NICHE  = (args.niche ?? '{niche}').toLowerCase();
const N      = Math.max(1, parseInt(args.n ?? '40', 10));
const OUTDIR = args.outdir ?? 'dm-pack';

// ---------- helpers ----------
const rand = (a,b)=> a + Math.floor(Math.random()*(b-a+1));
const uniq = a => Array.from(new Set(a));
const hasEmoji = s => /\p{Extended_Pictographic}/u.test(s);

// simple levenshtein (suffisant ici) – pas de dépendance externe
// (si tu préfères: `npm i js-levenshtein`)
function lev(a,b){
  if(a===b) return 0;
  const al=a.length, bl=b.length;
  if(al===0||bl===0) return al+bl;
  const v = Array(bl+1).fill(0).map((_,i)=>i);
  for(let i=1;i<=al;i++){
    let prev=v[0]++, tmp;
    for(let j=1;j<=bl;j++){
      tmp=v[j];
      v[j]=Math.min(
        v[j]+1,
        v[j-1]+1,
        prev + (a[i-1]===b[j-1]?0:1)
      );
      prev=tmp;
    }
  }
  return v[bl];
}
function dedupeByLevenshtein(lines, minDist=3){
  const res=[];
  for(const m of lines){
    if(res.every(x => lev(x, m) > minDist)) res.push(m);
  }
  return res;
}

// compliance & lint
const FORBIDDEN = /(sex|sexual|services|rates|price|http|https|onlyfans|@)/i; // pas de @, pas de liens
function validText(s){
  return (
    typeof s==='string' &&
    s.length>0 && s.length<=120 &&
    !FORBIDDEN.test(s) &&
    !hasEmoji(s)
  );
}

// ---------- générateur deterministic (variations légères) ----------
const introA = [
  'hey youre amazing',
  'hey youre great',
  'hey youre dope',
  'just found youre page',
  'found youre page today',
  'just saw youre page',
  'love your page',
  'your page looks clean',
  'your vibe is clean',
];

const bridge = [
  'i just found youre page',
  'just found your page',
  'found your page today',
  'just saw your page',
];

const money = [
  'i can help you earn more',
  'tiny way to make more $',
  'get more from ig',
  'make more from the same posts',
  'more paid fans, same vibe',
];

function synth(model, city, niche){
  const pick = (arr)=>arr[rand(0,arr.length-1)];
  // assemble segments en gardant tout en minuscules, sans emoji
  const variants = [
    `${pick(introA)}, ${pick(bridge)} ( ${pick(money)} )`,
    `${pick(introA)} ( ${pick(money)} )`,
    `${pick(bridge)} — ${pick(money)}`,
    `hey its ${model} — ${pick(bridge)} ( ${pick(money)} )`,
    `${pick(introA)} — ${pick(money)} in ${city}`,
    `${pick(introA)} — ${pick(money)} for ${niche}`,
  ];
  return variants;
}

function expandDesired(n, model, city, niche){
  const bag = new Set();
  while(bag.size < n*3 && bag.size < 500){
    for(const line of synth(model, city, niche)){
      let s = line
        .replace(/\s+/g,' ').trim()
        .toLowerCase();
      // nettoyage ponctuation simple
      s = s.replace(/\s*-\s*/g,' — ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')');
      bag.add(s);
    }
  }
  return Array.from(bag);
}

// ---------- pipeline principal ----------
async function main(){
  await mkdir(OUTDIR, { recursive: true });

  // 1) générer beaucoup, puis filtrer
  let candidates = expandDesired(N, MODEL, CITY, NICHE);

  // filtrage longueur/forbidden/emoji
  candidates = candidates.filter(validText);

  // déduplication fuzzy (levenshtein > 3)
  candidates = dedupeByLevenshtein(candidates, 3);

  // garder N éléments max
  const lines = candidates.slice(0, N);

  // si pas assez, complète avec des variantes sûres
  while(lines.length < N){
    const fallback = `hey youre amazing (i can help you earn more)`;
    if(lines.every(x => lev(x,fallback) > 3)) lines.push(fallback);
    else break;
  }

  // 2) fichiers de sortie
  const linesJson = lines.map(text => ({
    text,
    placeholders: ['{model_name}','{city}','{niche}'],
  }));

  const cliLines = lines.map(text =>
    `npm run dm -- --user ${TARGET} --message "${text.replace(/"/g,'\\"')}"`
  ).join('\n');

  const rotation = `# rotation
- cadence: 1–2 msg/min par compte, en petits bursts, puis pause
- premier ping: texte seul (pas de lien/media)
- personnalise 1 micro-signal quand dispo (ville/niche)
- follow-up unique à j+2 si silence, puis stop`;

  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'dm-line',
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', maxLength: 120 },
      placeholders: {
        type: 'array',
        items: { type: 'string', enum: ['{model_name}','{city}','{niche}'] },
        uniqueItems: true
      }
    },
    required: ['text','placeholders']
  };
  // (si tu veux une vraie validation JSON Schema: npm i ajv puis valider ici)

  // 3) "sanity check" local minimal (sans dépendances)
  const bad = linesJson.filter(o => !validText(o.text));
  if(bad.length){
    throw new Error(`Lint failed on ${bad.length} messages`);
  }

  // 4) écrire les fichiers
  await writeFile(`${OUTDIR}/lines.json`, JSON.stringify(linesJson, null, 2));
  await writeFile(`${OUTDIR}/cli.txt`, cliLines+'\n');
  await writeFile(`${OUTDIR}/rotation.md`, rotation+'\n');
  await writeFile(`${OUTDIR}/lint.jsonschema`, JSON.stringify(schema, null, 2));

  // 5) aperçu
  console.log(`\n📦 one-run OK → ${basename(OUTDIR)}`);
  console.log(`- ${OUTDIR}/lines.json`);
  console.log(`- ${OUTDIR}/cli.txt`);
  console.log(`- ${OUTDIR}/rotation.md`);
  console.log(`- ${OUTDIR}/lint.jsonschema`);
  console.log('\n▶ sample (first 5):');
  console.log(cliLines.split('\n').slice(0,5).join('\n'));
  console.log('\nℹ reminder: aux non-followers, IG n\'autorise qu\'UNE request texte. optimise ce premier ping.');
}

main().catch(e=>{ console.error(e); process.exit(1); });