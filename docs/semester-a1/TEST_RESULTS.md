# Phone / browser test results — 15 Nov 2026

Live: https://alinikkhah2001.github.io/French/

## Passed

- Accueil defaults to **Semestre A1** + **Companion Édito** only
- Archived paths hidden until **Bibliothèque complète**
- Lesson `a1-heure-date` loads; Exam tab shows 20 MCQs
- Radio selection works; sequential unlock locks later semestre lessons until exam completed
- Édito legal links present (Didier / Educadhoc / guide TOC)
- Deploy workflow green (`feat: refocus app on Semestre A1 + Édito companion`)

## Notes for real iPhone

Run the full checklist in `PHONE_UX_TEST_PLAN.md` on device (Add to Home Screen + airplane mode). Browser automation confirmed desktop + mobile viewport exam UI.

## Known quirks

- Hidden loading/error nodes remain in the DOM (hidden) — cosmetic for a11y tree only
- Sidebar type chips still list podcast/video types from the full corpus; lesson list itself is filtered to primary paths
