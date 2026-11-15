# Phone / browser test results — 15 Nov 2026

Live: https://alinikkhah2001.github.io/French/  
Local: `npm run build && npm run dev` → http://localhost:8000/

## Passed (desktop + local)

- Accueil defaults to **Cahier de classe** with **Semestre A1** + **Companion Édito** path pills
- Archived podcast paths hidden until **Bibliothèque complète**
- Lesson `cahier-d1-heure-date` loads; Exam tab shows fill + MCQ (21 items)
- Sequential unlock locks later lessons until exam completed
- Édito legal links present (Didier / Educadhoc / guide TOC)
- Sidebar type chips limited to types in primary paths when archive is off
- Library view hides archived paths + PDFs unless Bibliothèque complète is on
- Deploy workflow green on `main`

## Mobile checklist (`PHONE_UX_TEST_PLAN.md`)

Run on iPhone Safari → Share → **Add to Home Screen**:

- [ ] Accueil + bottom tab bar reachable one-handed
- [ ] Open Devoir 1 → Exam → answer + Check my answers
- [ ] Airplane mode after first visit (shell + semester lessons)
- [ ] Progress persists after kill + reopen
- [ ] Bibliothèque complète reveals archived podcasts without breaking A1 paths

## Notes

- Hidden loading/error nodes remain in the DOM (hidden) — cosmetic for a11y tree only
- Édito book content is **not** redistributed; buy Educadhoc / Didier numérique separately
