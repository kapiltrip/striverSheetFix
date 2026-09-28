# Recall — DSA practice

A personal study app for Kapil’s 45–60 minute sessions. The current A2Z catalogue contains 474 problems, with links back to takeUforward and the exercise platforms.

On Windows, double-click `Open-Striver.cmd`. It starts Recall on your PC and
opens `http://127.0.0.1:5173/` in Chrome. Your study records and uploaded files
stay in this folder’s ignored `.wrangler/state/` directory. The launcher reuses
the local database and GitHub connection from the earlier preview; it does not
use ChatGPT Sites or require a ChatGPT sign-in.

The server keeps running after you close Chrome, so the next launch is quick.
Double-click `Close-Striver.cmd` when you want to stop it; your saved data stays
on disk.

[Study flow](#study-flow) · [GitHub backups](#github-backups) · [Local setup](#local-setup-and-development) · [Verification](#verification)

## Study flow

The current plan begins Monday, 5 October 2026 and keeps the 12 April 2027 finish date. With all 474 problems remaining, that is 190 study days at two or three items per day. Today recommends unfinished work, due coding reattempts, then the next item in the guided order. A problem notebook keeps code, approach notes, mistakes, original images, PDFs, and attempt history together. Drafts autosave to the server; an unsuccessful save preserves the editor and blocks navigation away from it.

The first three sessions pair two algorithms with one array question:

| Date | Algorithms | Array question |
| --- | --- | --- |
| 5 October | Selection Sort, Bubble Sort | Largest Element |
| 6 October | Insertion Sorting, Merge Sorting | Second Largest Element |
| 7 October | Quick Sorting, Linear Search | Check if the Array is Sorted II |

The guided queue then continues through Arrays. The remaining Basics and Sorting entries come after Arrays, followed by the rest of A2Z. The problem sheet still displays all 474 items in the source order, so no lesson is removed. The first three dates move with the resume date if it is changed in settings.

Each problem notebook shows a concise question summary and a little context before the editor, so the task is visible without leaving the study flow. The original exercise remains linked for its complete examples and constraints. Question text is searchable from the problem sheet.

Recall cards use FSRS. The user attempts an answer before revealing it and then rates recall. Coding reattempts are separate: failed attempts return after one day, assisted attempts after two, and independent successes after 3, 7, 14, 30, then 60 days. Results are self-reported; code is run and submitted on the linked exercise platform.

Daily summaries use Asia/Kolkata dates. Weekly metrics report actual attempts and recall ratings. Fresh accounts start with no invented progress.

## GitHub backups

The app can store readable backups under `recall/` in the public repository `kapiltrip/cpp-and-scripting-practice`. Connect in the GitHub view using a fine-grained token restricted to that repository, with Contents: Read and write. The token is encrypted with AES-GCM in local storage and is never included in the backup. Code and notes sent to this repository are public.

Automatic backups run after attempts, recall reviews, and attachments. Pending work retries while the app is open; Back up now performs an immediate attempt. The server records success only after updating the Git reference. Existing files outside the app’s `recall/` directory are preserved, and reference updates never force-push.

A backup contains readable problem notebooks, complete solution source files, day indexes, original uploaded files, and a versioned state.json for recovery. Restore previews the contents, merges missing history and attachments, and preserves newer records already saved in the app. Large restores may require retrying; merges are designed to resume without duplicating history.

## Local setup and development

The app uses React/TypeScript, Vinext, the local Cloudflare D1/R2 emulator, and ts-fsrs. No Cloudflare account is needed. It listens only on the PC’s loopback address. Data requests reject other hostnames, and writes must come from the same origin. There is one local study space for this PC.

1. Install Node.js 22.13 or later and run `npm ci` if `node_modules/` is absent. The Windows launcher also detects the Node.js bundled with Codex on this PC.
2. Double-click `Open-Striver.cmd`. It creates the local database on first use, starts the server if needed, and opens Chrome. On subsequent launches, it reuses the running server.
3. For terminal development, run `npm run db:init` once and `npm run dev`. `npm run build` checks the production build. `npm start` serves that build locally on port 8787.

To enable or retain GitHub backups, keep `.env` with `GITHUB_ENCRYPTION_KEY` set to the same 64-character hex key used when the GitHub connection was created. Copy `.env.example` for a fresh setup and generate a new 32-byte random key. Keep `.env` and `.wrangler/state/` outside Git; back up both if you move PCs. Changing the key makes the saved GitHub connection unreadable until reconnected.

Run `npm run catalog:questions` when the source catalogue changes to refresh the concise in-app question summaries from the linked exercise or lesson pages.

The GitHub token is entered in the app, never placed in source files. Internet is needed for GitHub backups and linked exercise pages; saving study progress on this PC works offline.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build`.

Tests cover catalogue integrity, recall scheduling, coding retry intervals, date boundaries, priority selection, notebook export, secret exclusion, GitHub backup idempotence, failed-write recovery, restoration of original bytes, preservation of newer work, and account isolation. GitHub unit checks use an isolated mock API; a live connection is verified separately after authorization.

Catalogue source: [Striver’s A2Z sheet](https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z), retrieved 12 September 2026. Original teaching material remains on its source platform.
