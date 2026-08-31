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

Answers may be `A`, `B`, `C`, or `D`:

```markdown
# Exam practice

| Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|
| What does “au chômage” mean? | at home | unemployed | in power | late | B | It is a fixed expression. |
```

## Important notes and custom sections

`# Important notes` gets its own tab. Any other top-level section is shown as a general reading section, so the format can grow without requiring application changes.

## Table limitations

Keep table cells on one line and do not place an unescaped pipe character (`|`) inside a cell. For complex explanations, put the longer text in a grammar or notes section.

## Audio guidance

- Use `audio_url` only for a direct playable audio file you are allowed to load.
- Use `audio_embed` for a provider’s official embeddable player.
- Always include `source_url` so the learner can open the original publication.
- Browser and provider privacy or subscription rules still apply.
