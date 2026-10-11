# 11:59

The current eleven59.com website and Netlify newsletter functions.

## Netlify deployment

- Repository: `eleven59productions/eleven59`, branch `main`.
- Build command: `npm run build`.
- Publish directory: `dist`.
- Functions directory: `netlify/functions` (configured in `netlify.toml`).

Production runtime environment variables:

- `RESEND_API_KEY`: Full-access Resend API key. Store only in Netlify, never in GitHub or HTML.
- `NEWSLETTER_POSTAL_ADDRESS`: The company’s business mailing address, used in the email footer.
- `NEWSLETTER_ENABLED`: Leave unset while testing; set to `true` after the signup and email have been tested.

Resend sender: `11:59 <watching@eleven59.com>`.
Subscriber segment: `11:59 Weekly Review` (already created).

## Weekly Review

The scheduled function first runs every Friday at 9 AM in America/Los_Angeles and retries during that hour after failures. It handles daylight saving time. The subject includes the sending Friday’s date. Reviews published between the previous Friday at 9 AM (inclusive) and this Friday at 9 AM (exclusive) appear newest first. Title links and inline review links are preserved. Subscriber opt-outs are handled by Resend Broadcasts. An empty week sends a brief “No new reviews this week” edition.

The `on-deploy` event function records when review entries first appear on a production deployment. Entries in the initial deployment become an undated baseline, because their actual publication dates are unknown; they are not silently assigned invented dates. New entries receive the time they go live. Editing an existing entry does not republish it. Removed entries are omitted from the email, but their dates remain stored so rollbacks do not falsely make them new.

Update the website’s `months` and `watchDescriptions` data in `index.html`, commit to GitHub and let Netlify deploy. Do not switch back to Netlify Drop: manual uploads omit these build and publication-tracking steps. The build extracts each individual review into `reviews.json` without executing the website’s scripts. The newsletter link opens `/?view=watching&month=current`.

## Checks and limitations

Run `npm install`, `npm test` and `npm run build`.

Deployment and live tests still need to be completed on Netlify. The production runtime API key is not present in this repository. Emails are not enabled by default. Scheduled submission starts at 9 AM; recipient inbox delivery depends on Resend and the receiving provider. Very long editions can be clipped by email clients; full reviews are preserved rather than shortened.

The signup endpoint records explicit subscription intent and does not re-enable previously unsubscribed contacts. It rejects other origins, validates addresses, and rate-limits requests. A public endpoint may still need stronger anti-abuse controls if automated abuse occurs.
