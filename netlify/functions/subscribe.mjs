import { createHash } from 'node:crypto';
import { api, store } from '../../lib/server.mjs';
import { SEGMENT } from '../../lib/newsletter.mjs';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export default async (request, context) => {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!process.env.RESEND_API_KEY) return json({ error: 'Subscriptions are not available yet.' }, 503);
  const origin = request.headers.get('origin');
  if (!origin || !['https://eleven59.com', 'https://www.eleven59.com', 'https://clever-sunshine-836bdf.netlify.app'].includes(origin)) return json({ error: 'Invalid request origin.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 2048) return json({ error: 'Request too large.' }, 413);
  let input;
  try { const raw = await request.text(); if (raw.length > 2048) return json({ error: 'Request too large.' }, 413); input = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
  const email = String(input.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || input.consent !== true) return json({ error: 'Enter a valid email to subscribe.' }, 400);
  if (input.website) return json({ ok: true });
  let stage = "storage initialization";
  try {
    const db = store();
    const hash = createHash('sha256').update(`${context.ip}:${email}`).digest('hex');
    const bucket = Math.floor(Date.now() / 60000);
    stage = "signup rate limit";
    const rate = await db.set(`signup-rate/${hash}/${bucket}`, '1', { onlyIfNew: true });
    if (!rate.modified) return json({ error: 'Please wait a minute before trying again.' }, 429);
    stage = "contact lookup";
    let contact;
    try { contact = await api(`/contacts/${encodeURIComponent(email).replace(/%40/g, '@')}`); } catch (e) { if (e.status !== 404) throw e; }
    if (contact?.unsubscribed) return json({ error: 'This email previously unsubscribed; contact watching@eleven59.com to rejoin.' }, 409);
    stage = "contact subscription";
    if (contact) await api(`/contacts/${encodeURIComponent(email).replace(/%40/g, '@')}/segments/${SEGMENT}`, { method: 'POST' });
    else await api('/contacts', { method: 'POST', body: { email, segments: [{ id: SEGMENT }] } });
    stage = "consent storage";
    await db.setJSON(`consent/${createHash('sha256').update(email).digest('hex')}`, { email, subscribedAt: new Date().toISOString(), source: 'website', consent: '11:59 Weekly Review every Friday at 9 AM Los Angeles time' });
    return json({ ok: true });
  } catch (error) { console.error('Subscription failed', { stage, errorType: error.name, status: error.status || null, serviceCode: error.serviceCode || null, detail: error.serviceDetail || null }); return json({ error: 'Could not save your subscription. Please try again.' }, 502); }
};
export const config = { path: '/api/subscribe' };
