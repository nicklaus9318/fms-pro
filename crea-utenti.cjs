const https = require('https');

const SUPABASE_URL = 'obuwncdicflvlizhlmth.supabase.co'; // hostname per https.request (senza https://)
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9idXduY2RpY2ZsdmxpemhsbXRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgyMzg3NCwiZXhwIjoyMDg4Mzk5ODc0fQ.erUD57QSG6VBEUjGeS7gHOpCCcw24e_Lg5fjZr7pyg0';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: SUPABASE_URL,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let result = '';
      res.on('data', chunk => result += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(result) }); }
        catch { resolve({ status: res.statusCode, data: result }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  // 1. Carica tutte le email dalle squadre
  console.log('Carico le email dalle squadre...');
  const teamsRes = await request('GET', '/rest/v1/teams?select=owner_email&owner_email=not.is.null');
  const emails = [...new Set(
    teamsRes.data
      .map(t => t.owner_email)
      .filter(e => e && e.trim() !== '')
  )];
  console.log(`Trovate ${emails.length} email\n`);

  // 2. Crea un utente per ogni email
  let ok = 0, skip = 0, err = 0;
  for (const email of emails) {
    const res = await request('POST', '/auth/v1/admin/users', {
      email,
      password: '123456',
      email_confirm: true
    });
    if (res.status === 200 || res.status === 201) {
      console.log(`✅ ${email}`);
      ok++;
    } else if (res.data?.message?.includes('already') || res.data?.msg?.includes('already') || res.data?.error?.includes('already') || res.status === 422) {
      console.log(`⏭️  ${email} (già esistente)`);
      skip++;
    } else {
      console.log(`❌ ${email}: ${JSON.stringify(res.data)}`);
      err++;
    }
  }

  console.log(`\nFatto! ✅${ok} creati, ⏭️${skip} già esistenti, ❌${err} errori`);
}

main().catch(e => console.log('Errore:', e.message));
