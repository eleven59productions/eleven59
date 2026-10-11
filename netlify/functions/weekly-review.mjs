import { api, store } from '../../lib/server.mjs';
import { compose, weeklyReviews, windowFor, FROM, SEGMENT } from '../../lib/newsletter.mjs';
export default async () => {
  if (process.env.NEWSLETTER_ENABLED !== 'true') { console.log('Newsletter disabled pending test and mailing address'); return; }
  if (!process.env.NEWSLETTER_POSTAL_ADDRESS) throw Error('NEWSLETTER_POSTAL_ADDRESS is missing');
  const { local, start, end, date } = windowFor();
  if (local.weekday !== 5 || local.hour !== 9) return;
  const db = store();
  const history = await db.get('history', { type: 'json' });
  if (!history) throw Error('Review history was not initialized by the production deploy');
  const key = `sends/${date}`;
  const saved = await db.getWithMetadata(key, { type: 'json' });
  if (saved?.data.status === 'sent') return;
  if (saved?.data.lockedAt && Date.now() - saved.data.lockedAt < 120000) return;
  const claim = await db.setJSON(key, { ...saved?.data, status: 'working', lockedAt: Date.now() }, saved ? { onlyIfMatch: saved.etag } : { onlyIfNew: true });
  if (!claim.modified) return;
  const name = `11:59 Weekly Review ${date}`;
  let broadcastId = saved?.data.broadcastId;
  // Recover a draft after an uncertain API response; never create a second edition.
  if (!broadcastId) {
    const list = await api('/broadcasts');
    const found = list.data?.find(b => b.name === name);
    if (found) {
      broadcastId = found.id;
      if (['sent', 'queued', 'scheduled'].includes(found.status)) { await db.setJSON(key, { status: 'sent', broadcastId }); return; }
    }
  }
  if (!broadcastId) {
    const content = compose(weeklyReviews(history, start, end), date, process.env.NEWSLETTER_POSTAL_ADDRESS);
    const created = await api('/broadcasts', { method: 'POST', body: { name, segment_id: SEGMENT, from: FROM, ...content } });
    broadcastId = created.id;
    await db.setJSON(key, { status: 'draft', broadcastId, lockedAt: Date.now() });
  }
  const current = await api(`/broadcasts/${broadcastId}`);
  if (!['sent', 'queued', 'scheduled'].includes(current.status)) {
    await api(`/broadcasts/${broadcastId}/send`, { method: 'POST', body: {} });
  }
  await db.setJSON(key, { status: 'sent', broadcastId, sentAt: new Date().toISOString() });
  console.log(`Weekly Review ${date} submitted to Resend`);
};
// First attempt is exactly 9 AM in LA; remaining invocations are retry opportunities.
// Both UTC hours account for Pacific daylight saving time.
export const config = { schedule: '* 16,17 * * 5' };
