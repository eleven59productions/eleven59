import { getStore } from '@netlify/blobs';
export const store = () => getStore({ name: 'weekly-review-production', consistency: 'strong' });
export async function api(path, { method = 'GET', body } = {}) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw Error('RESEND_API_KEY is missing');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://api.resend.com${path}`, {
      method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000)
    });
    if (response.status === 429 && attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
    const data = await response.json();
    if (!response.ok) { const error = Error(`Resend request failed (${response.status})`); error.status = response.status; error.serviceCode = String(data.name || '').replace(/[^a-z_]/g, '').slice(0, 60); error.serviceDetail = String(data.message || '').split(key).join('[credential]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 180); throw error; }
    return data;
  }
}
export async function updateHistory(reviews, publishedAt, register) {
  const db = store();
  for (let i = 0; i < 4; i++) {
    const old = await db.getWithMetadata('history', { type: 'json' });
    const next = register(old?.data, reviews, publishedAt);
    const result = await db.setJSON('history', next, old ? { onlyIfMatch: old.etag } : { onlyIfNew: true });
    if (result.modified) return next;
  }
  throw Error('Concurrent publication update; retry the deploy');
}
