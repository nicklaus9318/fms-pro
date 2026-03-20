/**
 * Cloudflare R2 Client
 * Upload file con compressione automatica per le immagini
 */

const R2_ENDPOINT = `https://${import.meta.env.VITE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_BUCKET = import.meta.env.VITE_R2_BUCKET_NAME;
const R2_ACCESS_KEY = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL;

/**
 * Genera la firma HMAC-SHA256 per AWS Signature V4 (compatibile con R2)
 */
async function hmacSha256(key, data) {
  const keyMaterial = typeof key === 'string'
    ? new TextEncoder().encode(key)
    : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hex(data) {
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Comprime un'immagine prima dell'upload
 * @param {File} file - File immagine originale
 * @param {Object} options - Opzioni compressione
 * @param {number} options.maxWidth - Larghezza massima (default: 1200)
 * @param {number} options.maxHeight - Altezza massima (default: 1200)
 * @param {number} options.quality - Qualità JPEG 0-1 (default: 0.7)
 * @returns {Promise<Blob>} - Immagine compressa
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.6,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Ridimensiona mantenendo le proporzioni
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Compressione fallita')); return; }
          resolve(blob);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Caricamento immagine fallito')); };
    img.src = url;
  });
}

/**
 * Upload un file su Cloudflare R2 con AWS Signature V4
 * @param {File|Blob} file - File da caricare
 * @param {string} path - Percorso nel bucket (es: "report-foto/2024/foto.jpg")
 * @param {string} contentType - MIME type (es: "image/jpeg")
 * @returns {Promise<string>} - URL pubblico del file
 */
export async function uploadToR2(file, path, contentType) {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';

  const region = 'auto';
  const service = 's3';

  const fileBuffer = file instanceof Blob ? await file.arrayBuffer() : file;
  const payloadHash = await sha256Hex(fileBuffer);

  const host = `${R2_ENDPOINT.replace('https://', '')}`;
  const canonicalUri = `/${R2_BUCKET}/${path}`;

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join('\n');

  // Deriva la signing key
  const kDate    = await hmacSha256(`AWS4${R2_SECRET_KEY}`, dateStamp);
  const kRegion  = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorization,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload R2 fallito (${response.status}): ${text}`);
  }

  return `${R2_PUBLIC_URL}/${path}`;
}

/**
 * Funzione tutto-in-uno: comprimi + carica immagine su R2
 * @param {File} file - File immagine originale
 * @param {string} folder - Cartella nel bucket (es: "report-foto", "team-logos")
 * @param {Object} compressionOptions - Opzioni compressione (vedi compressImage)
 * @returns {Promise<string>} - URL pubblico
 */
export async function uploadImageToR2(file, folder = 'uploads', compressionOptions = {}) {
  const isImage = file.type.startsWith('image/');

  let fileToUpload = file;
  let contentType = file.type;

  if (isImage) {
    // Comprimi l'immagine
    fileToUpload = await compressImage(file, compressionOptions);
    contentType = 'image/jpeg';
  }

  const ext = isImage ? 'jpg' : file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  return uploadToR2(fileToUpload, fileName, contentType);
}

/**
 * Upload PDF o file generico su R2 (senza compressione)
 * @param {File} file
 * @param {string} folder
 * @returns {Promise<string>} - URL pubblico
 */
export async function uploadFileToR2(file, folder = 'docs') {
  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}.${ext}`;
  return uploadToR2(file, fileName, file.type);
}
