import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import { windowFor, weeklyReviews, compose } from '../lib/newsletter.mjs';
import { extractReviews, registerPublication } from '../lib/reviews.mjs';

test('Friday uses Los Angeles time and calendar weeks across DST', () => {
  for (const [now, end, start] of [
    ['2026-10-16T16:00:00Z', '2026-10-16T16:00:00.000Z', '2026-10-09T16:00:00.000Z'],
    ['2026-11-06T17:00:00Z', '2026-11-06T17:00:00.000Z', '2026-10-30T16:00:00.000Z'],
    ['2027-03-19T16:00:00Z', '2027-03-19T16:00:00.000Z', '2027-03-12T17:00:00.000Z']
  ]) {
    const w = windowFor(DateTime.fromISO(now));
    assert.equal(w.local.hour, 9);
    assert.equal(w.local.weekday, 5);
    assert.equal(w.end.toUTC().toISO(), end);
    assert.equal(w.start.toUTC().toISO(), start);
  }
});

test('initial archive is not falsely dated; edits do not resend reviews', () => {
  const first = [{ id: 'old', html: 'first', order: 0 }];
  const baseline = registerPublication(null, first, '2026-10-11T15:00:00Z');
  assert.equal(baseline.entries.old.publishedAt, null);
  const update = registerPublication(baseline, [...first, { id: 'new', html: 'new', order: 1 }], '2026-10-12T15:00:00Z');
  assert.equal(update.entries.new.publishedAt, '2026-10-12T15:00:00Z');
  const edit = registerPublication(update, [{ id: 'new', html: 'edited', order: 0 }], '2026-10-14T15:00:00Z');
  assert.equal(edit.entries.new.publishedAt, update.entries.new.publishedAt);
  assert.equal(edit.entries.new.html, 'edited');
});

test('window includes previous boundary and excludes current boundary; newest first', () => {
  const w = windowFor(DateTime.fromISO('2026-10-16T16:00:00Z'));
  const dates = ['2026-10-09T15:59:59Z', '2026-10-09T16:00:00Z', '2026-10-16T15:59:59Z', '2026-10-16T16:00:00Z'];
  const entries = Object.fromEntries(dates.map((publishedAt, i) => [String(i), { id: String(i), publishedAt, order: i }]));
  const selected = weeklyReviews({ entries, activeIds: Object.keys(entries) }, w.start, w.end);
  assert.deepEqual(selected.map(r => r.id), ['2', '1']);
});

test('subject ordinal, original links, simple copy and unsubscribe are preserved', () => {
  const c = compose([{ html: '<strong><a href="https://example.com/video">TITLE</a></strong> — A <a href="https://example.com/reference">review</a>.' }], '2026-10-16', 'Example business mailing address');
  assert.equal(c.subject, '11:59 - Weekly Review - October 16th');
  assert.match(c.html, /https:\/\/example.com\/video/);
  assert.match(c.text, /https:\/\/example.com\/reference/);
  assert.match(c.html, /view=watching&month=current/);
  assert.match(c.html, /RESEND_UNSUBSCRIBE_URL/);
  assert.match(compose([], '2026-10-23', 'address').subject, /23rd$/);
});

test('actual site data extracts without executing scripts, strips interactive emoji UI', async () => {
  const html = await readFile('index.html', 'utf8');
  const reviews = extractReviews(html);
  assert.ok(reviews.length > 10);
  assert.ok(reviews.some(r => r.title === 'BELOW (EP. 2)'));
  assert.ok(reviews.some(r => r.title === 'BELOW (PILOT)'));
  for (const r of reviews) {
    assert.ok(r.html.startsWith('<strong>'));
    assert.doesNotMatch(r.html, /onclick|<button|<script|<div|<span/);
  }
});
