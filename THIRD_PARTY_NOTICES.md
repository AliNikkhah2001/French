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
