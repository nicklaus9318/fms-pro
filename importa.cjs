const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://obuwncdicflvlizhlmth.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9idXduY2RpY2ZsdmxpemhsbXRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyMzg3NCwiZXhwIjoyMDg4Mzk5ODc0fQ.erUD57QSG6VBEUjGeS7gHOpCCcw24e_Lg5fjZr7pyg0'; // service role

const crypto = require('crypto');

function toUuid(idStr) {
  if (!idStr) return null;
  const h = crypto.createHash('md5').update(String(idStr)).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

const UUID_FIELDS = new Set(['id','team_id','league_id','loan_from_team_id','player_id',
  'home_team_id','away_team_id','mvp_player_id','auction_id','from_team_id','to_team_id','related_player_id']);

const SKIP_FIELDS = new Set(['updated_date','created_by_id','created_by','is_sample']);

const DATE_FIELDS = new Set(['suspension_end_date','injury_end_date','start_date','end_date','match_date','bid_time','created_date']);

function processRecord(rec) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (SKIP_FIELDS.has(k)) continue;
    if (UUID_FIELDS.has(k) && v) out[k] = toUuid(String(v));
    else if (DATE_FIELDS.has(k)) {
      if (!v) out[k] = null;
      else {
        const d = new Date(v);
        out[k] = isNaN(d.getTime()) ? null : v;
      }
    }
    else out[k] = v;
  }
  return out;
}

function postToSupabase(table, records) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(records);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=ignore-duplicates',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const dataFile = path.join(__dirname, 'dati-base44.json');
  if (!fs.existsSync(dataFile)) {
    console.log('❌ File dati-base44.json non trovato! Mettilo nella cartella del progetto.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const CHUNK = 1; // 1 record alla volta

  // Importa squadre
  console.log(`\n📦 Importazione ${data.Team.length} squadre...`);
  const teams = data.Team.map(processRecord);
  for (let i = 0; i < teams.length; i += CHUNK) {
    const chunk = teams.slice(i, i + CHUNK);
    try {
      await postToSupabase('teams', chunk);
      console.log(`  ✅ Squadre ${i+1}-${i+chunk.length}`);
    } catch(e) {
      console.log(`  ❌ Squadre ${i+1}-${i+chunk.length}: ${e.message.slice(0,100)}`);
    }
  }

  // Importa giocatori
  console.log(`\n📦 Importazione ${data.Player.length} giocatori...`);
  const players = data.Player.map(processRecord);
  for (let i = 0; i < players.length; i += CHUNK) {
    const chunk = players.slice(i, i + CHUNK);
    try {
      await postToSupabase('players', chunk);
      process.stdout.write(`\r  ✅ Giocatori ${i+chunk.length}/${players.length}`);
    } catch(e) {
      console.log(`\n  ❌ Giocatori ${i+1}-${i+chunk.length}: ${e.message.slice(0,100)}`);
    }
  }

  console.log('\n\n🎉 Importazione completata!');
}

main().catch(e => console.log('Errore:', e.message));
