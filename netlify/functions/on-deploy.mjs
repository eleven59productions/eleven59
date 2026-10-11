import { registerPublication } from '../../lib/reviews.mjs';
import { updateHistory } from '../../lib/server.mjs';
export default {
  async deploySucceeded(event) {
    if (event.deploy.context !== 'production' || !event.deploy.publishedAt) return;
    const response = await fetch(new URL('/reviews.json', event.deploy.permalinkUrl), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('Could not read published review data');
    const reviews = await response.json();
    await updateHistory(reviews, event.deploy.publishedAt, registerPublication);
    console.log(`Registered ${reviews.length} reviews from production deploy`);
  }
};
