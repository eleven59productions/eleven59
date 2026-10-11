import { DateTime } from 'luxon';
import sanitizeHtml from 'sanitize-html';

export const ZONE = 'America/Los_Angeles';
export const SEGMENT = '4ad5917b-7716-4464-9840-e57b839e15f8';
export const FROM = '11:59 <watching@eleven59.com>';
export const SITE = 'https://eleven59.com';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const suffix = d => d % 100 >= 11 && d % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] || 'th');

export function windowFor(now = DateTime.now()) {
  const local = now.setZone(ZONE);
  const end = local.startOf('day').set({ hour: 9 });
  return { local, start: end.minus({ weeks: 1 }), end, date: end.toISODate() };
}

export function weeklyReviews(history, start, end) {
  return (history.activeIds || []).map(id => history.entries[id])
    .filter(r => r.publishedAt && DateTime.fromISO(r.publishedAt).toMillis() >= start.toMillis() && DateTime.fromISO(r.publishedAt).toMillis() < end.toMillis())
    .sort((a, b) => DateTime.fromISO(b.publishedAt).toMillis() - DateTime.fromISO(a.publishedAt).toMillis() || a.order - b.order);
}

export function compose(reviews, date, address) {
  const day = DateTime.fromISO(date, { zone: ZONE });
  const subject = `11:59 - Weekly Review - ${day.toFormat('MMMM')} ${day.day}${suffix(day.day)}`;
  const link = `${SITE}/?view=watching&month=current`;
  const rows = reviews.length ? `<ol>${reviews.map(r => `<li style="margin-bottom:16px;">${r.html}</li>`).join('')}</ol>` : '<p>No new reviews this week.</p>';
  const unsubscribe = '{{{RESEND_UNSUBSCRIBE_URL}}}';
  // Plain-looking HTML preserves bold text and inline links; text fallback preserves every URL.
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escape(subject)}</title></head><body><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#111111;"><p>Hi, Chat,</p><p>Here’s what we’ve <a href="${link}">watched this week</a>.</p>${rows}<p>Have a great weekend.</p><p><strong>11:59</strong></p><p style="font-size:12px;line-height:1.6;color:#555555;">${escape(address)}<br><a href="${unsubscribe}">Unsubscribe</a></p></td></tr></table></body></html>`;
  const textRows = reviews.map((r, i) => `${i + 1}. ${sanitizeHtml(r.html.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label} (${href})`).replace(/<br\s*\/?\s*>/gi, '\n'), { allowedTags: [], allowedAttributes: {} })}`).join('\n\n');
  const text = `Hi, Chat,\n\nHere’s what we’ve watched this week (${link}).\n\n${textRows || 'No new reviews this week.'}\n\nHave a great weekend.\n\n11:59\n\n${address}\nUnsubscribe: ${unsubscribe}`;
  return { subject, html, text };
}
