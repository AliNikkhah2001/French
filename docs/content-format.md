# Markdown content format

Each Markdown file represents one learning item. It may be a podcast episode, book excerpt, article, video, or exam guide.

## Frontmatter

The file begins with simple YAML-like frontmatter:

```yaml
---
title: "Une chanson révolutionnaire"
slug: "une-chanson-revolutionnaire"
type: "podcast"
level: "A1–A2"
emoji: "🎙️"
description: "Music, freedom, and the past tense."
author: "Emel Mathlouthi / Duolingo French Podcast"
duration: "25 min"
order: 1
tags: [music, history, Tunisia]
source_url: "https://example.com/transcript"
apple_url: "https://podcasts.apple.com/example"
audio_url: ""
audio_embed: "https://player.example.com/embed/123"
transcript_file: "episode-transcript.tsv"
draft: false
---
```

Required fields:

- `title`
- `slug` — lowercase letters, digits, and hyphens only
- `type` — normally `podcast`, `book`, `article`, `video`, or `guide`
- `level` — for example `A1`, `A1–A2`, or `B1`

Optional fields control labels, links, audio, sorting, and visual identity. A file with `draft: true`, or a filename beginning with `_`, is not published.

## Overview

Ordinary Markdown is supported:

```markdown
# Overview

This story follows **a Tunisian musician** whose song became important.

- Read once without translation.
- Listen again while following the French.
```

## Transcript

Use a table with `French`, `English`, and optional `Notes` columns:

```markdown
# Transcript

| French | English | Notes |
|---|---|---|
| J’ai grandi en Tunisie. | I grew up in Tunisia. | `grandir` = to grow up |
```

The page turns each row into an interactive line with a translation reveal button.

### External transcript files

For long transcripts, set `transcript_file` in frontmatter. The path is relative to the lesson and must stay inside `content/`. Supported formats are TSV, CSV, and JSON.

TSV or CSV needs a header row. `Notes` is optional:

```tsv
French	English	Notes
Bonjour !	Hello!	A common greeting.
J’ai grandi en Tunisie.	I grew up in Tunisia.	Passé composé.
```

JSON is an array of objects:

```json
[
  {
    "French": "Bonjour !",
    "English": "Hello!",
    "Notes": "A common greeting."
  }
]
```

Accepted aliases are `fr`/`en`, and `translation` for English. During the build, external rows replace an existing `# Transcript` section or create one. The deployed lesson remains self-contained. A copy-ready TSV is included at `content/_sample-transcript.tsv`.

## Grammar

Use level-two headings for individual concepts:

```markdown
# Grammar

## Passé composé

Use it for completed events: **J’ai chanté.**

## Imparfait

Use it for background and habits: **J’aimais chanter.**
```

Each concept becomes a collapsible grammar card.

## Vocabulary

```markdown
# Vocabulary

| French | English | Type | Note |
|---|---|---|---|
| grandir | to grow up | verb | past participle: grandi |
| un pays | country | noun | masculine |
```

The page provides search and type filters automatically.

## Collocations

```markdown
# Collocations

| French | English | Example |
|---|---|---|
| être au pouvoir | to be in power | Il était au pouvoir. |
```

## Flashcards

```markdown
# Flashcards

| Front | Back | Hint |
|---|---|---|
| ce qui ne va pas | what is wrong | literally: what does not go |
```

## Exam practice

The exam tab supports four question types. The default is multiple choice; add a `Type` column to use the others. Answers may be `A`, `B`, `C`, or `D` for multiple choice. Fill, word-order and write questions use a plain-text `Answer`.

```markdown
# Exam practice

| Type | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| mc | What does “au chômage” mean? | at home | unemployed | in power | late | B | It is a fixed expression. |
```

**Multiple choice (default):** leave `Type` empty or use `mc`. `Answer` is `A`, `B`, `C` or `D`.

**Fill the blank (`fill`):** the learner types the word. Keep `Answer` short.

```markdown
| Type | Question | Answer | Explanation |
|---|---|---|---|
| fill | Complétez : « Je ___ à Paris. » | vis | present of vivre |
```

**Word order (`order`):** the learner arranges words into a sentence. `Answer` is the correct order, space-separated.

```markdown
| Type | Question | Answer | Explanation |
|---|---|---|---|
| order | Mettez les mots dans l’ordre. | Je vis à Paris. | normal word order |
```

**Write your answer (`write`):** an open short-answer box. `Answer` is the exact accepted text.

```markdown
| Type | Question | Answer | Explanation |
|---|---|---|---|
| write | Écrivez une phrase avec « vis ». | Je vis à Paris. | any correct sentence |
```

> Matching ignores case and accents, and ignores punctuation for `order`. Keep `explanation` short. If you omit the `Type` column, every row is treated as multiple choice (all seven other columns required).

## Important notes and custom sections

`# Important notes` gets its own tab. Any other top-level section is shown as a general reading section, so the format can grow without requiring application changes.

## Table limitations

Keep table cells on one line and escape a pipe as `\|`. For complex explanations, put the longer text in a grammar or notes section.

## What the build calculates

Every build tokenizes the French transcript and catalogue entities, then generates:

- total and unique transcript word counts
- top transcript words and word-length distribution
- entity lists and per-lesson counts
- content-type and vocabulary-type distributions
- catalogue coverage across frequency-rank bands
- matching against the top 5,000 rows of `data/fr_50k.txt`

Vocabulary and grammar mastery are marked by the learner in the browser. The dashboard combines those marks with the build-time catalogue data to calculate personal common-5,000 coverage.

## Audio guidance

- Use `audio_url` only for a direct playable audio file you are allowed to load.
- Use `audio_embed` for a provider’s official embeddable player.
- Always include `source_url` so the learner can open the original publication.
- Browser and provider privacy or subscription rules still apply.
