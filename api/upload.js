import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { IncomingForm } from 'formidable';
import { readFileSync } from 'fs';

export const config = { api: { bodyParser: false } };

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024 }); // 10MB max

    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'Nessun file ricevuto' });

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = file.originalFilename?.split('.').pop() || 'jpg';
    const fileName = `match-photos/${timestamp}-${randomStr}.${ext}`;

    const fileBuffer = readFileSync(file.filepath);

    await s3.send(new PutObjectCommand({
      Bucket: 'fms-pro',
      Key: fileName,
      Body: fileBuffer,
      ContentType: file.mimetype || 'image/jpeg',
    }));

    const publicUrl = `https://pub-4b8afc0e5a2d4b67afeefb4ee6e4bb0e.r2.dev/${fileName}`;

    return res.status(200).json({ url: publicUrl, fileName });

  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
