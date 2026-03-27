export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL mancante' });

  // Permetti solo URL R2
  if (!url.includes('r2.dev') && !url.includes('cloudflarestorage.com')) {
    return res.status(403).json({ error: 'URL non consentito' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch fallito: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
