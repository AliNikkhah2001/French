# Third-party notices

## FrequencyWords French corpus

This project includes `data/fr_50k.txt`, copied from:

- Project: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
- File: [French OpenSubtitles 2018 frequency list](https://github.com/hermitdave/FrequencyWords/blob/master/content/2018/fr/fr_50k.txt)
- Content source: OpenSubtitles 2018
- Content license: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
- Code license in the upstream repository: MIT

The build uses the first 5,000 ranked rows for the learner-facing comparison. Word frequency depends on the source corpus. Subtitle language overrepresents conversational dialogue and should not be treated as a universal curriculum or a definitive list of the “best” French words.

The site also links to [Lexique](https://www.lexique.org/) as an independent French lexical database and pedagogical reference. Lexique data is not redistributed in this project.

## PDF.js

The PDF reader uses [PDF.js](https://mozilla.github.io/pdf.js/), Copyright © 2012 Mozilla Foundation and contributors.

- Vendored: `assets/vendor/pdfjs/pdf.min.js` and `assets/vendor/pdfjs/pdf.worker.min.js` from `pdfjs-dist@3.11.174` (legacy build).
- License: [Apache License 2.0](https://github.com/mozilla/pdf.js/blob/master/LICENSE)

## Twemoji (croissant)

The app logo uses the croissant emoji artwork from [Twemoji](https://twemoji.twitter.com/), Copyright © 2020 Twitter, Inc.

- Vendored: `assets/vendor/twemoji/1f950.svg` and `assets/vendor/twemoji/1f950.png`.
- License: [Creative Commons Attribution 4.0 International (CC-BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

The generated icon set (`assets/icons/*`, `assets/logo.svg`, favicons) is derived from this artwork.

## Vocabulary bank (`data/vocab/`)

The in-app practice vocabulary bank merges three open sources (see `scripts/build-content.mjs — buildVocab`). Each word records its source.

- **Duolingo French–English 5000** — `duolingo_vocabulary_5000.csv`, French↔English word list from [WuqianMa/french-english-word5000](https://github.com/WuqianMa/french-english-word5000).
- **UFLF fr-en** — 14 chapter vocabulary files (French↔English, phrases/sentences) from [darigovresearch/Universal-Foreign-Language-Flashcards](https://github.com/darigovresearch/Universal-Foreign-Language-Flashcards), derived from the [Français interactif](https://www.laits.utexas.edu/fi/) program.
- **popmots 10k** — `10000-most-common-words-en-fr-dict.json` (includes IPA and part-of-speech) from [claudiabdm/popmots](https://github.com/claudiabdm/popmots), MIT licensed.

Check each upstream repository for its exact license before redistribution. The Anki shared deck [893324022](https://ankiweb.net/shared/info/893324022) was reviewed but its export could not be downloaded programmatically; add its `.apkg` (or a two-column `french|english` TSV) under `data/vocab/` to include it in the merged bank.
