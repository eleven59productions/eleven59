import { parse } from 'acorn';
import sanitizeHtml from 'sanitize-html';
import { createHash } from 'node:crypto';

function literal(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(p => {
    if (p.type !== 'Property' || p.computed || p.kind !== 'init') throw Error('Reviews must contain literal values');
    return [p.key.name ?? p.key.value, literal(p.value)];
  }));
  throw Error('Reviews must contain literal values');
}

export function extractReviews(html) {
  // Parse the two data declarations only, never execute site JavaScript.
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
  const values = {};
  for (const name of ['months', 'watchDescriptions']) {
    const start = blocks.indexOf(`const ${name} =`);
    if (start < 0) throw Error(`Missing ${name}`);
    const next = blocks.indexOf('\n    };', start);
    if (next < 0) throw Error(`Missing end of ${name}`);
    const tree = parse(blocks.slice(start, next + 7), { ecmaVersion: 'latest' });
    values[name] = literal(tree.body[0].declarations[0].init);
  }
  const result = [];
  for (const [month, info] of Object.entries(values.months)) {
    for (const [, key] of info.titles) {
      const raw = values.watchDescriptions[key];
      if (!raw) continue;
      const chunks = raw.split(/<div class="watch-entry-break"><\/div>(?=<strong>)/);
      // Site entries group episodes in oldest-first order. Email uses newest-first.
      for (const chunk of chunks.reverse()) {
        const heading = chunk.match(/^<strong>([\s\S]*?)<\/strong>/)?.[1];
        if (!heading) throw Error(`Missing title for ${key}`);
        const title = sanitizeHtml(heading, { allowedTags: [], allowedAttributes: {} });
        const id = createHash('sha256').update(`${month}:${info.label}:${key}:${title}`).digest('hex');
        const clean = sanitizeHtml(chunk.replace(/<div class="watch-entry-break"><\/div>/g, '<br><br>'), {
          allowedTags: ['strong', 'b', 'em', 'i', 'a', 'br'],
          allowedAttributes: { a: ['href'] },
          allowedSchemes: ['https', 'http', 'mailto'],
          nonTextTags: ['script', 'style', 'button'],
          transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href } }) }
        });
        result.push({ id, title, html: clean, month, monthLabel: info.label, order: result.length });
      }
    }
  }
  return result;
}

export function registerPublication(history, reviews, publishedAt) {
  const baseline = !history;
  const next = structuredClone(history || { initializedAt: publishedAt, entries: {} });
  for (const review of reviews) {
    const existing = next.entries[review.id];
    next.entries[review.id] = { ...review, publishedAt: existing ? existing.publishedAt : baseline ? null : publishedAt };
  }
  // Keep removed entries' dates so rollbacks never reclassify old reviews as new.
  next.activeIds = reviews.map(r => r.id);
  return next;
}
