#!/usr/bin/env node
/**
 * Generate interactive Markdown lessons from data/cahier-a1/devoirs.json
 * (cahier homework → fill / mc / order / write exam practice + flashcards).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(root, 'data', 'cahier-a1', 'devoirs.json');
const contentRoot = join(root, 'content');

function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function examTable(rows) {
  const header = '| Type | Question | A | B | C | D | Answer | Explanation |';
  const sep = '|---|---|---|---|---|---|---|---|';
  const body = rows.map(row => {
    const type = row.type || 'mc';
    return `| ${cell(type)} | ${cell(row.question)} | ${cell(row.a)} | ${cell(row.b)} | ${cell(row.c)} | ${cell(row.d)} | ${cell(row.answer)} | ${cell(row.explanation)} |`;
  }).join('\n');
  return `${header}\n${sep}\n${body}`;
}

function flashTable(rows) {
  const header = '| Front | Back | Hint |';
  const sep = '|---|---|---|';
  const body = rows.map(row => `| ${cell(row.front)} | ${cell(row.back)} | ${cell(row.hint)} |`).join('\n');
  return `${header}\n${sep}\n${body}`;
}

function vocabTable(rows) {
  const header = '| French | English | Type | Note |';
  const sep = '|---|---|---|---|';
  const body = rows.map(row => `| ${cell(row.french)} | ${cell(row.english)} | ${cell(row.type || 'vocab')} | ${cell(row.note)} |`).join('\n');
  return `${header}\n${sep}\n${body}`;
}

function lessonMarkdown(pack) {
  const tagList = Array.isArray(pack.tags)
    ? pack.tags
    : String(pack.tags || 'A1, cahier, semestre').split(',').map(t => t.trim()).filter(Boolean);
  return `---
title: ${JSON.stringify(pack.title)}
slug: ${JSON.stringify(pack.slug)}
type: "guide"
level: "A1"
emoji: ${JSON.stringify(pack.emoji || '📝')}
description: ${JSON.stringify(pack.description || '')}
author: "Cahier A1-1"
duration: ${JSON.stringify(pack.duration || '20 min')}
order: ${pack.order ?? 10}
tags: [${tagList.map(t => JSON.stringify(t)).join(', ')}]
draft: false
---

# Overview

${pack.overview}

# Grammar

${pack.grammar || '## Point clé\n\nVoir les exercices interactifs (onglet Exam).'}

# Vocabulary

${vocabTable(pack.vocabulary || [])}

# Flashcards

${flashTable(pack.flashcards || [])}

# Exam practice

${examTable(pack.exam || [])}
`;
}

const data = JSON.parse(await readFile(dataPath, 'utf8'));
await mkdir(contentRoot, { recursive: true });
const written = [];
for (const pack of data.packs) {
  const file = join(contentRoot, `${pack.slug}.md`);
  await writeFile(file, lessonMarkdown(pack), 'utf8');
  written.push(pack.slug);
}
console.log(`Generated ${written.length} cahier lessons:\n- ${written.join('\n- ')}`);
