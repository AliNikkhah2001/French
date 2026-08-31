import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseLesson } from '../assets/content-parser.js';
import { normalizeFrench, stripMarkdown, tokenizeFrench, uniqueFrenchTokens } from '../assets/analytics-utils.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(projectRoot, 'content');
const distRoot = join(projectRoot, 'dist');
const benchmarkPath = join(projectRoot, 'data', 'fr_50k.txt');
const checkOnly = process.argv.includes('--check');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (extname(entry.name).toLowerCase() === '.md' && !entry.name.startsWith('_')) files.push(absolute);
  }
  return files;
}

function publicPath(file) {
  return relative(projectRoot, file).split(sep).join('/');
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map(value => value.trim().toLowerCase());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])));
}

function normalizeTranscriptRows(rows, file) {
  if (!Array.isArray(rows)) throw new Error(`${publicPath(file)}: transcript data must be an array of rows.`);
  return rows.map((raw, index) => {
    const row = Object.fromEntries(Object.entries(raw || {}).map(([key, value]) => [key.toLowerCase(), String(value ?? '').trim()]));
    const french = row.french || row.fr || '';
    const english = row.english || row.en || row.translation || '';
    if (!french || !english) throw new Error(`${publicPath(file)}: transcript row ${index + 1} needs French and English values.`);
    return { french, english, notes: row.notes || row.note || '' };
  });
}

function markdownCell(value) {
  return String(value).replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function transcriptTable(rows) {
  return ['| French | English | Notes |', '|---|---|---|', ...rows.map(row => `| ${markdownCell(row.french)} | ${markdownCell(row.english)} | ${markdownCell(row.notes)} |`)].join('\n');
}

function injectTranscript(markdown, rows) {
  const section = `# Transcript\n\n${transcriptTable(rows)}\n\n`;
  const existing = /^#\s+Transcript\s*\r?\n[\s\S]*?(?=^#\s+|\s*$)/im;
  return existing.test(markdown) ? markdown.replace(existing, section) : `${markdown.trim()}\n\n${section}`;
}

async function materializeTranscript(markdown, sourceFile, attributes) {
  if (!attributes.transcript_file) return markdown;
  const transcriptFile = resolve(dirname(sourceFile), String(attributes.transcript_file));
  if (transcriptFile !== contentRoot && !transcriptFile.startsWith(`${contentRoot}${sep}`)) throw new Error(`${publicPath(sourceFile)}: transcript_file must stay inside content/.`);
  const extension = extname(transcriptFile).toLowerCase();
  const text = await readFile(transcriptFile, 'utf8');
  let rows;
  if (extension === '.json') rows = JSON.parse(text);
  else if (extension === '.tsv') rows = parseDelimited(text, '\t');
  else if (extension === '.csv') rows = parseDelimited(text, ',');
  else throw new Error(`${publicPath(sourceFile)}: transcript_file must be .tsv, .csv, or .json.`);
  return injectTranscript(markdown, normalizeTranscriptRows(rows, transcriptFile));
}

function validate(metadata, parsed, file, slugs) {
  const errors = [];
  for (const field of ['title', 'slug', 'type', 'level']) if (!metadata[field]) errors.push(`missing required field “${field}”`);
  if (metadata.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug)) errors.push('slug must contain lowercase letters, numbers, and single hyphens only');
  if (slugs.has(metadata.slug)) errors.push(`duplicate slug “${metadata.slug}”`);
  if (!parsed.overview && !parsed.transcript.length && !parsed.examGuide) errors.push('lesson needs an Overview, Transcript, or Exam guide section');
  if (parsed.exam.some(question => !['A', 'B', 'C', 'D'].includes((question.answer || '').toUpperCase()))) errors.push('exam answers must be A, B, C, or D');
  if (errors.length) throw new Error(`${publicPath(file)}:\n- ${errors.join('\n- ')}`);
  slugs.add(metadata.slug);
}

async function readBenchmark() {
  const lines = (await readFile(benchmarkPath, 'utf8')).trim().split(/\r?\n/).slice(0, 5000);
  if (lines.length !== 5000) throw new Error('data/fr_50k.txt must contain at least 5,000 ranked rows.');
  return lines.map((line, index) => {
    const separator = line.lastIndexOf(' ');
    return { word: normalizeFrench(line.slice(0, separator)), rank: index + 1, frequency: Number(line.slice(separator + 1)) };
  });
}

function countValues(values) {
  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), 'fr'));
}

function roundPercent(value, total) {
  return total ? Math.round(value / total * 10000) / 100 : 0;
}

function buildAnalytics(records, benchmark) {
  const benchmarkByWord = new Map(benchmark.map(entry => [entry.word, entry]));
  const allTranscriptTokens = [];
  const catalogueTokens = new Set();
  const vocabulary = [];
  const grammar = [];
  const collocations = [];
  const lessons = records.map(record => {
    const { item, parsed } = record;
    const transcriptTokens = parsed.transcript.flatMap(line => tokenizeFrench(line.french));
    const lessonCatalogue = new Set(transcriptTokens);
    allTranscriptTokens.push(...transcriptTokens);
    parsed.vocabulary.forEach((word, index) => {
      const tokens = uniqueFrenchTokens(word.french);
      tokens.forEach(token => lessonCatalogue.add(token));
      const ranked = tokens.map(token => benchmarkByWord.get(token)).filter(Boolean).sort((a, b) => a.rank - b.rank)[0];
      vocabulary.push({ id: `${item.slug}:vocabulary:${index}`, lesson: item.title, slug: item.slug, index, french: stripMarkdown(word.french), english: stripMarkdown(word.english), type: stripMarkdown(word.type || 'other'), note: stripMarkdown(word.note), tokens, rank: ranked?.rank || null });
    });
    parsed.grammar.forEach((entry, index) => grammar.push({ id: `${item.slug}:grammar:${index}`, lesson: item.title, slug: item.slug, index, title: stripMarkdown(entry.title) }));
    parsed.collocations.forEach((entry, index) => {
      const tokens = uniqueFrenchTokens(entry.french);
      tokens.forEach(token => lessonCatalogue.add(token));
      collocations.push({ id: `${item.slug}:collocation:${index}`, lesson: item.title, slug: item.slug, index, french: stripMarkdown(entry.french), english: stripMarkdown(entry.english), example: stripMarkdown(entry.example), tokens });
    });
    lessonCatalogue.forEach(token => catalogueTokens.add(token));
    return { slug: item.slug, title: item.title, type: item.type, level: item.level, transcriptLines: parsed.transcript.length, transcriptTokens: transcriptTokens.length, uniqueTranscriptWords: new Set(transcriptTokens).size, vocabulary: parsed.vocabulary.length, grammar: parsed.grammar.length, collocations: parsed.collocations.length, flashcards: parsed.flashcards.length, exam: parsed.exam.length };
  });
  const transcriptCounts = countValues(allTranscriptTokens);
  const countLookup = new Map(transcriptCounts.map(item => [item.label, item.count]));
  const lengthDistribution = countValues(allTranscriptTokens.map(token => token.replace(/'/g, '').length)).sort((a, b) => Number(a.label) - Number(b.label));
  const commonWords = benchmark.map(entry => ({ ...entry, inCatalogue: catalogueTokens.has(entry.word), corpusCount: countLookup.get(entry.word) || 0 }));
  const frequencyBands = [[1, 100], [101, 500], [501, 1000], [1001, 2000], [2001, 5000]].map(([start, end]) => {
    const entries = commonWords.slice(start - 1, end);
    const covered = entries.filter(entry => entry.inCatalogue).length;
    return { label: `${start.toLocaleString()}–${end.toLocaleString()}`, start, end, total: entries.length, catalogue: covered, cataloguePercent: roundPercent(covered, entries.length) };
  });
  const catalogueCommonCount = commonWords.filter(entry => entry.inCatalogue).length;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    benchmark: { name: 'FrequencyWords French top 5,000', source: 'OpenSubtitles 2018 via hermitdave/FrequencyWords', url: 'https://github.com/hermitdave/FrequencyWords/blob/master/content/2018/fr/fr_50k.txt', license: 'CC BY-SA 4.0', size: 5000, caveat: 'Subtitle frequency is conversational and corpus-specific; rank is not a universal learning order.' },
    totals: { lessons: lessons.length, transcriptLines: records.reduce((sum, record) => sum + record.parsed.transcript.length, 0), transcriptTokens: allTranscriptTokens.length, uniqueTranscriptWords: new Set(allTranscriptTokens).size, vocabulary: vocabulary.length, grammar: grammar.length, collocations: collocations.length, flashcards: records.reduce((sum, record) => sum + record.parsed.flashcards.length, 0), examQuestions: records.reduce((sum, record) => sum + record.parsed.exam.length, 0), catalogueCommonWords: catalogueCommonCount, catalogueCoveragePercent: roundPercent(catalogueCommonCount, 5000) },
    distributions: { topTranscriptWords: transcriptCounts.slice(0, 30), wordLength: lengthDistribution, contentTypes: countValues(lessons.map(lesson => lesson.type)), vocabularyTypes: countValues(vocabulary.map(word => normalizeFrench(word.type || 'other'))) },
    frequencyBands,
    commonWords,
    entities: { lessons, vocabulary, grammar, collocations }
  };
}

function summaryMarkdown(analytics) {
  const totals = analytics.totals;
  const lessonRows = analytics.entities.lessons.map(lesson => `| ${lesson.title} | ${lesson.type} | ${lesson.transcriptLines} | ${lesson.transcriptTokens} | ${lesson.uniqueTranscriptWords} | ${lesson.vocabulary} | ${lesson.grammar} |`).join('\n');
  return `# French learning content analytics\n\nGenerated: ${analytics.generatedAt}\n\n| Measure | Value |\n|---|---:|\n| Published lessons | ${totals.lessons} |\n| Transcript lines | ${totals.transcriptLines} |\n| French transcript tokens | ${totals.transcriptTokens} |\n| Unique transcript words | ${totals.uniqueTranscriptWords} |\n| Vocabulary entities | ${totals.vocabulary} |\n| Grammar entities | ${totals.grammar} |\n| Collocations | ${totals.collocations} |\n| Top-5,000 catalogue coverage | ${totals.catalogueCommonWords} / 5,000 (${totals.catalogueCoveragePercent}%) |\n\n## Per lesson\n\n| Lesson | Type | Lines | Tokens | Unique | Vocabulary | Grammar |\n|---|---|---:|---:|---:|---:|---:|\n${lessonRows}\n\n> Benchmark: ${analytics.benchmark.source}. ${analytics.benchmark.caveat}\n`;
}

async function build() {
  const files = await walk(contentRoot);
  const slugs = new Set();
  const records = [];
  for (const file of files) {
    const sourceMarkdown = await readFile(file, 'utf8');
    const { attributes } = parseFrontmatter(sourceMarkdown);
    if (attributes.draft === true) continue;
    const markdown = await materializeTranscript(sourceMarkdown, file, attributes);
    const parsed = parseLesson(markdown);
    validate(attributes, parsed, file, slugs);
    const item = { title: attributes.title, slug: attributes.slug, type: attributes.type, level: attributes.level, emoji: attributes.emoji || '🇫🇷', description: attributes.description || '', author: attributes.author || '', duration: attributes.duration || '', order: Number(attributes.order ?? 999), tags: Array.isArray(attributes.tags) ? attributes.tags : [], path: publicPath(file), source_url: attributes.source_url || '', apple_url: attributes.apple_url || '', has_audio: Boolean(attributes.audio_url || attributes.audio_embed), counts: { transcript: parsed.transcript.length, vocabulary: parsed.vocabulary.length, grammar: parsed.grammar.length, flashcards: parsed.flashcards.length, exam: parsed.exam.length } };
    records.push({ file, markdown, parsed, item });
  }
  records.sort((a, b) => a.item.order - b.item.order || a.item.title.localeCompare(b.item.title, 'fr'));
  if (!records.length) throw new Error('No published lessons found in content/.');
  const analytics = buildAnalytics(records, await readBenchmark());
  if (checkOnly) {
    console.log(`Validated ${records.length} lesson${records.length === 1 ? '' : 's'}, ${analytics.totals.vocabulary} vocabulary entities, ${analytics.totals.grammar} grammar entities, and 5,000 benchmark words.`);
    return;
  }
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(join(distRoot, 'content'), { recursive: true });
  await mkdir(join(distRoot, 'data'), { recursive: true });
  await cp(join(projectRoot, 'assets'), join(distRoot, 'assets'), { recursive: true });
  await cp(join(projectRoot, 'index.html'), join(distRoot, 'index.html'));
  await writeFile(join(distRoot, '.nojekyll'), '');
  for (const record of records) {
    const destination = join(distRoot, record.item.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, record.markdown);
  }
  await writeFile(join(distRoot, 'content', 'index.json'), `${JSON.stringify({ version: 2, analytics: 'data/analytics.json', lessons: records.map(record => record.item) }, null, 2)}\n`);
  await writeFile(join(distRoot, 'data', 'analytics.json'), `${JSON.stringify(analytics, null, 2)}\n`);
  await writeFile(join(distRoot, 'data', 'analytics-summary.md'), summaryMarkdown(analytics));
  console.log(`Built ${records.length} lessons and analytics into ${relative(projectRoot, distRoot)}/.`);
}

build().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
