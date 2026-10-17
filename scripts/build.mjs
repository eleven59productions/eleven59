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
// Both scheduled tracks must exist; fail the deploy instead of publishing silence.
for (const filename of ['eleven59-theme.mp3', 'asset-1.mp3']) {
  const bytes = await readFile(`dist/media/${filename}`);
  if (!bytes.length || !assets.some(asset => asset.file === filename)) {
    throw Error(`Missing scheduled theme audio: ${filename}`);
  }
}
await copyFile('index.html', 'dist/index.html');
await copyFile('favicon.ico', 'dist/favicon.ico');
await writeFile('dist/reviews.json', JSON.stringify(reviews));
console.log(`Website built with ${reviews.length} review entries`);
