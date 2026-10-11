import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { extractReviews } from '../lib/reviews.mjs';
const html = await readFile('index.html', 'utf8');
const reviews = extractReviews(html);
await mkdir('dist', { recursive: true });
await mkdir('dist/media', { recursive: true });
const assets = JSON.parse(await readFile('media-source/manifest.json', 'utf8'));
for (const asset of assets) {
  const parts = await Promise.all(asset.parts.map(p => readFile(`media-source/${p}`, 'utf8')));
  await writeFile(`dist/media/${asset.file}`, Buffer.from(parts.join(''), 'base64'));
}
await copyFile('index.html', 'dist/index.html');
await writeFile('dist/reviews.json', JSON.stringify(reviews));
console.log(`Website built with ${reviews.length} review entries`);
