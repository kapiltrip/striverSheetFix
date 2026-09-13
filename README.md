# Recall — DSA practice

A private study app for Kapil’s 45–60 minute sessions. The current A2Z catalogue contains 474 problems, with links back to takeUforward and the exercise platforms.

[Study flow](#study-flow) · [GitHub backups](#github-backups) · [Development](#development) · [Verification](#verification)

## Study flow

Today recommends unfinished work, due coding reattempts, then the next unvisited A2Z problem. A problem notebook keeps code, approach notes, mistakes, original images, PDFs, and attempt history together. Drafts autosave to the server; an unsuccessful save preserves the editor and blocks navigation away from it.

Each problem notebook shows a concise question summary and a little context before the editor, so the task is visible without leaving the study flow. The original exercise remains linked for its complete examples and constraints. Question text is searchable from the problem sheet.

Recall cards use FSRS. The user attempts an answer before revealing it and then rates recall. Coding reattempts are separate: failed attempts return after one day, assisted attempts after two, and independent successes after 3, 7, 14, 30, then 60 days. Results are self-reported; code is run and submitted on the linked exercise platform.

Daily summaries use Asia/Kolkata dates. Weekly metrics report actual attempts and recall ratings. Fresh accounts start with no invented progress.

## GitHub backups

The app is configured for the private repository `kapiltrip/dsa-study-notes`. Connect in the GitHub view using a fine-grained token restricted to that repository, with Contents: Read and write. The token is encrypted with AES-GCM on the server and is never included in the backup.

Automatic backups run after attempts, recall reviews, and attachments. Pending work retries while the app is open; Back up now performs an immediate attempt. The server records success only after updating the Git reference. Existing files outside the app’s `recall/` directory are preserved, and reference updates never force-push.

A backup contains readable problem notebooks, complete solution source files, day indexes, original uploaded files, and a versioned state.json for recovery. Restore previews the contents, merges missing history and attachments, and preserves newer records already saved in the app. Large restores may require retrying; merges are designed to resume without duplicating history.

## Development

The app uses React/TypeScript, Vinext, Cloudflare D1 and R2, and ts-fsrs. Hosted identity is provided by private Sites access; every data endpoint checks the current user and scopes queries to that user. Write endpoints also check the request origin.

1. Install the locked dependencies with `npm run install:ci` using Node 22.13 or later.
2. Copy .env.example to .env and set GITHUB_ENCRYPTION_KEY to 32 cryptographically random bytes encoded as hex. Keep the same key when redeploying so stored connections remain readable.
3. Build once with `npm run build`, then apply `drizzle/0000_fair_shape.sql` to the local D1 database using the generated `dist/server/wrangler.json` configuration and `.wrangler/state` persistence directory.
4. Start with `npm run dev`. The local preview offers a simulated sign-in; production uses the Sites owner’s identity.

Run `npm run catalog:questions` when the source catalogue changes to refresh the concise in-app question summaries from the linked exercise or lesson pages.

The GitHub token is entered in the app, never placed in source files. Production encryption configuration is managed as a Sites secret. App data is stored in D1/R2; the browser is not the authoritative database. Internet connectivity is required for saved study data and backups.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build`.

Tests cover catalogue integrity, recall scheduling, coding retry intervals, date boundaries, priority selection, notebook export, secret exclusion, GitHub backup idempotence, failed-write recovery, restoration of original bytes, preservation of newer work, and account isolation. GitHub unit checks use an isolated mock API; a live connection is verified separately after authorization.

Catalogue source: [Striver’s A2Z sheet](https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z), retrieved 12 September 2026. Original teaching material remains on its source platform.
