import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseLesson } from '../assets/content-parser.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(projectRoot, 'content');
const distRoot = join(projectRoot, 'dist');
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

async function build() {
  const files = await walk(contentRoot);
  const slugs = new Set();
  const lessons = [];
  for (const file of files) {
    const markdown = await readFile(file, 'utf8');
    const { attributes } = parseFrontmatter(markdown);
    if (attributes.draft === true) continue;
    const parsed = parseLesson(markdown);
    validate(attributes, parsed, file, slugs);
    lessons.push({
      title: attributes.title,
      slug: attributes.slug,
      type: attributes.type,
      level: attributes.level,
      emoji: attributes.emoji || '🇫🇷',
      description: attributes.description || '',
      author: attributes.author || '',
      duration: attributes.duration || '',
      order: Number(attributes.order ?? 999),
      tags: Array.isArray(attributes.tags) ? attributes.tags : [],
      path: publicPath(file),
      source_url: attributes.source_url || '',
      apple_url: attributes.apple_url || '',
      has_audio: Boolean(attributes.audio_url || attributes.audio_embed),
      counts: {
        transcript: parsed.transcript.length,
        vocabulary: parsed.vocabulary.length,
        grammar: parsed.grammar.length,
        flashcards: parsed.flashcards.length,
        exam: parsed.exam.length
      }
    });
  }
  lessons.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'fr'));
  if (!lessons.length) throw new Error('No published lessons found in content/.');

  if (checkOnly) {
    console.log(`Validated ${lessons.length} lesson${lessons.length === 1 ? '' : 's'}.`);
    return;
  }

  await rm(distRoot, { recursive: true, force: true });
  await mkdir(join(distRoot, 'content'), { recursive: true });
  await cp(join(projectRoot, 'assets'), join(distRoot, 'assets'), { recursive: true });
  await cp(join(projectRoot, 'index.html'), join(distRoot, 'index.html'));
  await writeFile(join(distRoot, '.nojekyll'), '');
  for (const lesson of lessons) {
    const source = join(projectRoot, lesson.path);
    const destination = join(distRoot, lesson.path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
  const manifest = { version: 1, lessons };
  await writeFile(join(distRoot, 'content', 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built ${lessons.length} lessons into ${relative(projectRoot, distRoot)}/.`);
}

build().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
