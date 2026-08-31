# Le Petit Atelier Français 🇫🇷

A playful, content-driven French learning platform for podcasts, books, articles, videos, and custom lessons. The site is deployed by GitHub Actions to GitHub Pages.

The platform turns Markdown files into interactive lessons with:

- French ↔ English transcript cards
- source links and embedded podcast/audio players
- searchable vocabulary
- grammar explanations
- collocations and important notes
- flashcards with progress tracking
- multiple-choice exam practice and scoring
- a 365-day GitHub-style activity calendar and current/longest streaks
- separate mastery tracking for transcript, vocabulary, grammar, flashcards, and exams
- a searchable entity inventory for lessons, words, grammar patterns, and collocations
- build-time exploratory data analysis (token counts, word lengths, distributions, and per-lesson statistics)
- personal and catalogue matching against a ranked French top-5,000 benchmark
- JSON progress export/import for moving between browsers
- content filters for podcast, book, article, video, and guide
- responsive, accessible layout

No application framework or external runtime library is required. Node is used only during the build to discover and validate Markdown files.

## Quick start

```bash
npm run build
python3 -m http.server 8000 --directory dist
```

There are no package dependencies. If you prefer, run the build directly with `node scripts/build-content.mjs`.

Open `http://localhost:8000`.

## Add a lesson

1. Copy `content/_template.md`.
2. Rename it, for example `content/my-french-article.md`.
3. Change the frontmatter and section tables.
4. Run `npm run build` to validate it.
5. Commit and push to `main`.

The GitHub workflow discovers every non-draft `.md` file inside `content/`, generates a manifest, validates the lesson, and publishes the updated site automatically.

You can keep a large bilingual transcript outside the Markdown file. Add `transcript_file: "my-transcript.tsv"` to the lesson frontmatter, then place the TSV, CSV, or JSON file beside the lesson. The build converts it to the interactive transcript automatically. See the format guide for examples.

## Analytics and progress

`npm run build` creates:

- `dist/data/analytics.json` for the dashboard
- `dist/data/analytics-summary.md` for the GitHub Actions job summary
- a content manifest that lists every published lesson and entity count

Pull requests validate all content and publish the analytics summary without deploying. Pushes to `main` do the same checks and deploy to GitHub Pages.

The site is fully static, so personal study progress is stored in browser `localStorage`, not in GitHub. Use **My progress → Export progress** to back it up and **Import progress** on another browser or device. No account or tracking service is used.

## Publish on GitHub Pages

1. Create a GitHub repository.
2. Copy this project into the repository root.
3. Push to the `main` branch.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **GitHub Actions**.
6. Open the **Actions** tab and wait for the deployment workflow to finish.

Every later push to `main` rebuilds and redeploys the site.

## Audio and podcast embeds

Use one or both fields in lesson frontmatter:

```yaml
audio_url: "https://example.com/episode.mp3"
audio_embed: "https://player.example.com/embed/episode/123"
```

- `audio_url` creates a native HTML audio player.
- `audio_embed` creates an iframe player.
- `source_url` and `apple_url` create clearly labeled external links.

Only embed providers that allow embedding. Keep a source link as a fallback.

## Content schema

See [docs/content-format.md](docs/content-format.md) for the complete authoring reference and [content/_template.md](content/_template.md) for a copy-ready lesson.

The following top-level sections are recognized:

- `# Overview`
- `# Transcript`
- `# Grammar`
- `# Vocabulary`
- `# Collocations`
- `# Important notes`
- `# Flashcards`
- `# Exam guide`
- `# Exam practice`

Unknown sections are still displayed as reading notes.

## Copyright and attribution

The platform can link to third-party sources and embed authorized players, but that does not automatically grant permission to republish an entire transcript, article, or book. Publish only material you created, material you are licensed to use, public-domain material, or appropriately limited excerpts. Attribute the original source and keep the source link.

The included Emel Mathlouthi lesson is a study example based on the excerpt supplied for this project and links back to the official Duolingo episode.

## Project structure

```text
.
├── .github/workflows/deploy-pages.yml
├── assets/
│   ├── app.js
│   ├── analytics-utils.js
│   ├── content-parser.js
│   └── styles.css
├── content/
│   ├── _template.md
│   ├── episode-88-une-chanson-revolutionnaire.md
│   └── french-exams-roadmap.md
├── docs/content-format.md
├── data/fr_50k.txt
├── scripts/build-content.mjs
├── index.html
└── package.json
```

## Official references used by the example content

- [Duolingo episode and transcript](https://podcast.duolingo.com/episode-88-une-chanson-revolutionnaire-a-song-of-revolution-revisited)
- [Apple Podcasts episode](https://podcasts.apple.com/ca/podcast/une-chanson-r%C3%A9volutionnaire-a-song-of/id1466824259?i=1000604023506)
- [DELF tout public](https://www.france-education-international.fr/en/diplome/delf-tout-public)
- [DALF](https://www.france-education-international.fr/en/diplome/dalf)
- [TCF tout public](https://www.france-education-international.fr/en/test/tcf-tout-public)
- [TEF Canada](https://www.lefrancaisdesaffaires.fr/en/candidate/test-evaluation-francais/tef-canada/presentation/)

## Frequency data

The common-word comparison uses the first 5,000 rows of the French OpenSubtitles 2018 list from [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), whose content is licensed under CC BY-SA 4.0. Subtitle frequency is conversational and corpus-specific, so the ranking is a benchmark—not a universal learning order. [Lexique](https://www.lexique.org/) is linked in the dashboard as a research-oriented alternative. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
