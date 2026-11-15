# Phone UI/UX test plan — Semestre A1

Target: `https://alinikkhah2001.github.io/French/`  
Also local: `npm run build && npm run dev` (or `node scripts/serve.mjs`)

## Devices

- iPhone Safari (current iOS)
- Add to Home Screen → standalone PWA
- Optional: Android Chrome install

## Smoke

1. Cold open Accueil — default path **Semestre A1** (not podcast Bienvenue).
2. Path cards show only **Semestre A1** + **Companion Édito** unless “Bibliothèque complète” is checked.
3. Open each semestre lesson (`a1-heure-date` … `a1-drill-futur-meteo`) — no “café spilled” error.
4. Open each Édito companion lesson — external Didier links work.
5. Toggle **Bibliothèque complète** — archived paths reappear; uncheck returns to A1-only.

## Lesson UX

- Grammar / vocabulary / flashcards / exam tabs render.
- Exam: tap choices (44px+), submit, see score + explanations.
- Pronounce buttons speak `fr-FR` when available.
- Progress % updates; Reset clears lesson progress.

## Touch / layout

- Bottom tab bar reachable one-handed; safe-area respected.
- No horizontal scroll on exam questions.
- Library drawer (browser chrome) opens/closes without trapping scroll.
- Standalone: floating croissant + glass tab bar visible.

## Offline

1. Visit Accueil + open 2 semestre lessons online.
2. Airplane mode → reopen app.
3. Shell loads; cached semestre Markdown still opens.
4. Uncached archived podcast may fail offline (acceptable).

## Progress persistence

1. Complete an exam on `a1-heure-date`.
2. Kill Safari / swipe away PWA.
3. Reopen — quizAttempted / unlock of next lesson preserved.

## Regression

- Full library toggle does not wipe word list / review queue.
- Deep link `#lesson=a1-famille-possessifs&tab=exam` opens exam tab.
- Empty hash lands on Accueil (home), not a random podcast.

## Perf

- Cold LTE load Accueil under ~3s after first visit (SW warm).
- Search keyboard does not jump tab bar off-screen.

## Capture

Save screenshots into this folder:

- `home-semestre.png`
- `exam-mobile.png`
- `standalone-tabs.png`
- `edito-links.png`
