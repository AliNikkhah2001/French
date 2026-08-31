import { escapeHtml, inlineMarkdown, parseLesson } from './content-parser.js';
import { dateFromKey, localDateKey, normalizeFrench } from './analytics-utils.js';

const ACTIVITY_KEY = 'atelier-activity-v1';
const FREQUENCY_KEY = 'atelier-frequency-known-v1';
const state = {
  manifest: null,
  analytics: null,
  type: 'all',
  search: '',
  selected: null,
  lesson: null,
  activeTab: null,
  wordType: 'all',
  cardIndex: 0,
  cardRevealed: false,
  entityType: 'all',
  entitySearch: ''
};

const $ = id => document.getElementById(id);
const titleCase = value => String(value || '').replace(/\b\w/g, letter => letter.toUpperCase());
const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const percent = (value, total) => total ? Math.min(100, Math.round(value / total * 100)) : 0;

// Robust base for GitHub Pages project sites (e.g. /French/) and local dev
const SITE_BASE = new URL('..', import.meta.url);
function siteFetch(path) {
  const clean = String(path).replace(/^\.?\//, '');
  const url = new URL(clean, SITE_BASE);
  return fetch(url, { cache: 'no-store' });
}

function externalUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function readRoute() {
  if (location.hash === '#dashboard') return { dashboard: true, slug: null, tab: null };
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  return { dashboard: params.has('dashboard'), slug: params.get('lesson'), tab: params.get('tab') };
}

function replaceRoute(slug, tab) {
  const params = new URLSearchParams({ lesson: slug, tab });
  history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
}

function progressKey(slug = state.selected?.slug) {
  return `atelier-progress:${slug || 'unknown'}`;
}

function emptyProgress() {
  return { revealed: [], known: [], learnedWords: [], learnedGrammar: [], quizAttempted: false, quizScore: 0 };
}

function getProgress(slug = state.selected?.slug) {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(slug))) || {};
    return { ...emptyProgress(), ...saved, revealed: saved.revealed || [], known: saved.known || [], learnedWords: saved.learnedWords || [], learnedGrammar: saved.learnedGrammar || [] };
  } catch {
    return emptyProgress();
  }
}

function setProgress(progress, slug = state.selected?.slug) {
  localStorage.setItem(progressKey(slug), JSON.stringify(progress));
  if (slug === state.selected?.slug) updateProgress();
}

function getActivity() {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY)) || {}; }
  catch { return {}; }
}

function activityCount(entry) {
  return typeof entry === 'number' ? entry : Number(entry?.count || 0);
}

function recordActivity(kind) {
  const activity = getActivity();
  const key = localDateKey();
  const current = typeof activity[key] === 'object' ? activity[key] : { count: activityCount(activity[key]), kinds: {} };
  current.count += 1;
  current.kinds = current.kinds || {};
  current.kinds[kind] = (current.kinds[kind] || 0) + 1;
  activity[key] = current;
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

function getFrequencyKnown() {
  try { return JSON.parse(localStorage.getItem(FREQUENCY_KEY)) || []; }
  catch { return []; }
}

function updateProgress() {
  if (!state.lesson) return;
  const progress = getProgress();
  const total = state.lesson.transcript.length + state.lesson.vocabulary.length + state.lesson.grammar.length + state.lesson.flashcards.length + state.lesson.exam.length;
  const completed = progress.revealed.length + progress.learnedWords.length + progress.learnedGrammar.length + progress.known.length + (progress.quizAttempted ? state.lesson.exam.length : 0);
  const value = percent(completed, total);
  $('progress-value').textContent = `${value}%`;
  $('progress-fill').style.width = `${value}%`;
}

async function loadManifest() {
  showLoading();
  try {
    const manifestResponse = await siteFetch('content/index.json');
    if (!manifestResponse.ok) throw new Error(`Content manifest returned ${manifestResponse.status} at ${manifestResponse.url}.`);
    state.manifest = await manifestResponse.json();
    const analyticsPath = state.manifest.analytics || 'data/analytics.json';
    const analyticsResponse = await siteFetch(analyticsPath);
    if (!analyticsResponse.ok) throw new Error(`Analytics returned ${analyticsResponse.status} at ${analyticsResponse.url}.`);
    state.analytics = await analyticsResponse.json();
    renderTypeFilters();
    renderLibrary();
    const route = readRoute();
    if (route.dashboard) showDashboard();
    else {
      const selected = state.manifest.lessons.find(item => item.slug === route.slug) || state.manifest.lessons[0];
      await loadLesson(selected, route.tab);
    }
  } catch (error) {
    console.error(error);
    showError(`${error.message} Run “npm run build” and serve the dist folder through a local web server. (base: ${SITE_BASE.href})`);
  }
}

function showLoading() {
  $('loading-state').hidden = false;
  $('error-state').hidden = true;
  $('lesson-view').hidden = true;
  $('dashboard-view').hidden = true;
}

function showError(message) {
  $('loading-state').hidden = true;
  $('lesson-view').hidden = true;
  $('dashboard-view').hidden = true;
  $('error-state').hidden = false;
  $('error-message').textContent = message;
}

function showLesson() {
  $('loading-state').hidden = true;
  $('error-state').hidden = true;
  $('dashboard-view').hidden = true;
  $('lesson-view').hidden = false;
  $('dashboard-button').classList.remove('active');
}

function filteredLessons() {
  const query = normalize(state.search);
  return state.manifest.lessons.filter(item => {
    const typeMatch = state.type === 'all' || item.type === state.type;
    const haystack = normalize([item.title, item.description, item.author, item.level, ...(item.tags || [])].join(' '));
    return typeMatch && (!query || haystack.includes(query));
  });
}

function renderTypeFilters() {
  const types = ['all', ...new Set(state.manifest.lessons.map(item => item.type))];
  $('type-filters').innerHTML = types.map(type => `<button class="filter-chip ${type === state.type ? 'active' : ''}" type="button" data-type="${escapeHtml(type)}">${escapeHtml(type === 'all' ? 'All' : type)}</button>`).join('');
  $('type-filters').querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
    state.type = button.dataset.type;
    renderTypeFilters();
    renderLibrary();
  }));
}

function renderLibrary() {
  const lessons = filteredLessons();
  $('lesson-count').textContent = `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} on today’s menu`;
  if (!lessons.length) {
    $('lesson-list').replaceChildren($('empty-library-template').content.cloneNode(true));
    return;
  }
  $('lesson-list').innerHTML = lessons.map(item => {
    const detail = [titleCase(item.type), item.level, item.duration].filter(Boolean).join(' · ');
    return `<button class="lesson-card ${item.slug === state.selected?.slug && !$('lesson-view').hidden ? 'active' : ''}" type="button" data-slug="${escapeHtml(item.slug)}"><span class="lesson-card-emoji">${escapeHtml(item.emoji)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(detail)}</small></span><span class="lesson-arrow">›</span></button>`;
  }).join('');
  $('lesson-list').querySelectorAll('[data-slug]').forEach(button => button.addEventListener('click', async () => {
    const item = state.manifest.lessons.find(lesson => lesson.slug === button.dataset.slug);
    if (item) await loadLesson(item);
    closeMobileLibrary();
  }));
}

async function loadLesson(item, requestedTab = null) {
  if (!item) return;
  showLoading();
  try {
    const response = await siteFetch(item.path);
    if (!response.ok) throw new Error(`Lesson returned ${response.status} at ${response.url}.`);
    state.selected = item;
    state.lesson = parseLesson(await response.text());
    state.wordType = 'all';
    state.cardIndex = 0;
    state.cardRevealed = false;
    hydrateLessonHeader();
    const tabs = availableTabs();
    state.activeTab = tabs.some(tab => tab.id === requestedTab) ? requestedTab : (tabs.find(tab => tab.id === 'transcript')?.id || tabs[0]?.id);
    renderTabs();
    renderActiveTab();
    updateProgress();
    replaceRoute(item.slug, state.activeTab);
    showLesson();
    renderLibrary();
    document.title = `${item.title} · Le Petit Atelier Français`;
  } catch (error) {
    console.error(error);
    showError(`${error.message} Check the lesson path and rebuild the content manifest. (tried: ${item?.path}, base: ${SITE_BASE.href})`);
  }
}

function hydrateLessonHeader() {
  const item = state.selected;
  const metadata = state.lesson.metadata;
  $('lesson-emoji').textContent = item.emoji;
  $('lesson-type').textContent = item.type;
  $('lesson-level').textContent = item.level;
  $('lesson-duration').textContent = item.duration || '';
  $('lesson-title').textContent = item.title;
  $('lesson-description').textContent = item.description || '';
  $('poster-word').textContent = ({ podcast: 'ÉCOUTEZ!', book: 'LISEZ!', article: 'LISEZ!', video: 'REGARDEZ!', guide: 'RÉVISEZ!' })[item.type] || 'APPRENEZ!';
  const source = externalUrl(metadata.source_url || item.source_url);
  const apple = externalUrl(metadata.apple_url || item.apple_url);
  $('source-actions').innerHTML = [source ? `<a class="button blue" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open original source ↗</a>` : '', apple ? `<a class="button paper" href="${escapeHtml(apple)}" target="_blank" rel="noopener">Apple Podcasts ↗</a>` : ''].join('');
  renderAudio(metadata);
}

function renderAudio(metadata) {
  const embed = externalUrl(metadata.audio_embed);
  const audio = externalUrl(metadata.audio_url);
  const section = $('audio-section');
  if (!embed && !audio) { section.hidden = true; $('audio-player').innerHTML = ''; return; }
  section.hidden = false;
  $('audio-player').innerHTML = embed ? `<iframe title="Embedded audio player" src="${escapeHtml(embed)}" loading="lazy" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>` : `<audio controls preload="metadata" src="${escapeHtml(audio)}">Your browser does not support the audio element.</audio>`;
}

function availableTabs() {
  const lesson = state.lesson;
  const tabs = [];
  if (lesson.overview) tabs.push({ id: 'overview', label: '☕ Overview' });
  if (lesson.transcript.length) tabs.push({ id: 'transcript', label: `💬 Transcript (${lesson.transcript.length})` });
  if (lesson.grammar.length) tabs.push({ id: 'grammar', label: `🧩 Grammar (${lesson.grammar.length})` });
  if (lesson.vocabulary.length) tabs.push({ id: 'vocabulary', label: `📚 Words (${lesson.vocabulary.length})` });
  if (lesson.collocations.length) tabs.push({ id: 'collocations', label: '🧠 Collocations' });
  if (lesson.notes) tabs.push({ id: 'notes', label: '📌 Notes' });
  if (lesson.flashcards.length) tabs.push({ id: 'flashcards', label: `🃏 Flashcards (${lesson.flashcards.length})` });
  if (lesson.examGuide || lesson.exam.length) tabs.push({ id: 'exam', label: `🎓 Exam${lesson.exam.length ? ` (${lesson.exam.length})` : ''}` });
  lesson.extras.forEach((extra, index) => tabs.push({ id: `extra-${index}`, label: `📝 ${extra.title}` }));
  return tabs;
}

function renderTabs() {
  $('lesson-tabs').innerHTML = availableTabs().map(tab => `<button class="tab-button ${tab.id === state.activeTab ? 'active' : ''}" type="button" role="tab" aria-selected="${tab.id === state.activeTab}" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join('');
  $('lesson-tabs').querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    renderTabs(); renderActiveTab(); replaceRoute(state.selected.slug, state.activeTab);
    $('tab-panel').focus({ preventScroll: true });
  }));
}

function sectionHeading(kicker, title, description, stat = '') {
  return `<div class="section-intro"><div><span class="kicker">${escapeHtml(kicker)}</span><h3>${escapeHtml(title)}</h3>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>${stat ? `<span class="mini-stat">${escapeHtml(stat)}</span>` : ''}</div>`;
}

function renderActiveTab() {
  const id = state.activeTab;
  if (id === 'overview') renderOverview();
  else if (id === 'transcript') renderTranscript();
  else if (id === 'grammar') renderGrammar();
  else if (id === 'vocabulary') renderVocabulary();
  else if (id === 'collocations') renderCollocations();
  else if (id === 'notes') renderNotes();
  else if (id === 'flashcards') renderFlashcards();
  else if (id === 'exam') renderExam();
  else if (id?.startsWith('extra-')) renderExtra(Number(id.split('-')[1]));
}

function renderOverview() {
  $('tab-panel').innerHTML = `${sectionHeading('Le point de départ', 'Before you begin', 'Understand the context, then decide what one useful thing you want to remember.')}<div class="rich-copy">${state.lesson.overview}</div>`;
}

function renderTranscript(query = '') {
  const progress = getProgress();
  const q = normalize(query);
  const matches = state.lesson.transcript.map((line, index) => ({ line, index })).filter(({ line }) => !q || normalize([line.french, line.english, line.notes].join(' ')).includes(q));
  $('tab-panel').innerHTML = `${sectionHeading('Écoutez, puis regardez', 'Transcript lab', 'Reveal translations one at a time. Listening before reading trains your ear.', `${progress.revealed.length}/${state.lesson.transcript.length} revealed`)}<div class="transcript-controls"><label class="compact-search"><span>⌕</span><input id="transcript-search" type="search" value="${escapeHtml(query)}" placeholder="Search the transcript…"></label><button class="button paper small" id="reveal-all" type="button">Reveal all</button><button class="button paper small" id="hide-all" type="button">Hide all</button></div><div class="transcript-list">${matches.map(({ line, index }) => transcriptCard(line, index, progress.revealed.includes(index))).join('') || '<div class="empty-section">No matching line. Try another word.</div>'}</div>`;
  $('transcript-search').addEventListener('input', event => renderTranscript(event.target.value));
  $('reveal-all').addEventListener('click', () => { const next = getProgress(); if (next.revealed.length < state.lesson.transcript.length) recordActivity('translation'); next.revealed = state.lesson.transcript.map((_, index) => index); setProgress(next); renderTranscript(query); });
  $('hide-all').addEventListener('click', () => { const next = getProgress(); next.revealed = []; setProgress(next); renderTranscript(query); });
  $('tab-panel').querySelectorAll('[data-reveal-line]').forEach(button => button.addEventListener('click', () => toggleTranslation(Number(button.dataset.revealLine), query)));
}

function transcriptCard(line, index, revealed) {
  return `<article class="transcript-card"><div class="transcript-french"><span class="line-number">${String(index + 1).padStart(2, '0')}</span><div class="french-line">${inlineMarkdown(line.french || '')}</div><button class="translation-button" type="button" data-reveal-line="${index}" aria-expanded="${revealed}">${revealed ? 'Hide English' : 'Reveal English'}</button></div><div class="transcript-english" ${revealed ? '' : 'hidden'}><p>${inlineMarkdown(line.english || '')}</p>${line.notes ? `<span class="transcript-note">💡 ${inlineMarkdown(line.notes)}</span>` : ''}</div></article>`;
}

function toggleTranslation(index, query) {
  const progress = getProgress();
  const adding = !progress.revealed.includes(index);
  progress.revealed = adding ? [...progress.revealed, index] : progress.revealed.filter(value => value !== index);
  if (adding) recordActivity('translation');
  setProgress(progress); renderTranscript(query);
}

function renderGrammar() {
  const progress = getProgress();
  $('tab-panel').innerHTML = `${sectionHeading('Le laboratoire', 'Grammar you can reuse', 'Open one card, make your own sentence, then mark the pattern learned.', `${progress.learnedGrammar.length}/${state.lesson.grammar.length} learned`)}<div class="grammar-list">${state.lesson.grammar.map((item, index) => { const learned = progress.learnedGrammar.includes(index); return `<details class="grammar-card ${learned ? 'learned' : ''}" ${index === 0 ? 'open' : ''}><summary>${escapeHtml(item.title)}</summary><div class="rich-copy">${item.html}</div><button class="mastery-button ${learned ? 'learned' : ''}" type="button" data-learn-grammar="${index}">${learned ? '✓ Learned' : 'Mark learned'}</button></details>`; }).join('')}</div>`;
  $('tab-panel').querySelectorAll('[data-learn-grammar]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); toggleLearned('learnedGrammar', Number(button.dataset.learnGrammar), renderGrammar, 'grammar'); }));
}

function toggleLearned(field, index, rerender, activityKind) {
  const progress = getProgress();
  const adding = !progress[field].includes(index);
  progress[field] = adding ? [...progress[field], index] : progress[field].filter(value => value !== index);
  if (adding) recordActivity(activityKind);
  setProgress(progress); rerender();
}

function vocabularyTypes() {
  return ['all', ...new Set(state.lesson.vocabulary.map(word => normalize(word.type || 'other')).filter(Boolean))];
}

function renderVocabulary(query = '') {
  const q = normalize(query);
  const progress = getProgress();
  const words = state.lesson.vocabulary.map((word, index) => ({ word, index })).filter(({ word }) => (state.wordType === 'all' || normalize(word.type) === state.wordType) && (!q || normalize(Object.values(word).join(' ')).includes(q)));
  $('tab-panel').innerHTML = `${sectionHeading('Le panier de mots', 'Vocabulary market', 'Search, filter, and mark each useful word as learned.', `${progress.learnedWords.length}/${state.lesson.vocabulary.length} learned`)}<div class="word-controls"><label class="compact-search"><span>⌕</span><input id="word-search" type="search" value="${escapeHtml(query)}" placeholder="Search French or English…"></label><div class="word-filter-row">${vocabularyTypes().map(type => `<button class="word-filter ${type === state.wordType ? 'active' : ''}" type="button" data-word-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join('')}</div></div><div class="table-scroll"><table class="vocabulary-table"><thead><tr><th>French</th><th>English</th><th>Type</th><th>Note</th><th>Progress</th></tr></thead><tbody>${words.map(({ word, index }) => { const learned = progress.learnedWords.includes(index); return `<tr class="${learned ? 'learned-row' : ''}"><td>${inlineMarkdown(word.french || '')}</td><td>${inlineMarkdown(word.english || '')}</td><td>${inlineMarkdown(word.type || '')}</td><td>${inlineMarkdown(word.note || '')}</td><td><button class="mastery-button ${learned ? 'learned' : ''}" type="button" data-learn-word="${index}">${learned ? '✓ Learned' : 'Learn'}</button></td></tr>`; }).join('')}</tbody></table></div>`;
  $('word-search').addEventListener('input', event => renderVocabulary(event.target.value));
  $('tab-panel').querySelectorAll('[data-word-type]').forEach(button => button.addEventListener('click', () => { state.wordType = button.dataset.wordType; renderVocabulary(query); }));
  $('tab-panel').querySelectorAll('[data-learn-word]').forEach(button => button.addEventListener('click', () => toggleLearned('learnedWords', Number(button.dataset.learnWord), () => renderVocabulary(query), 'vocabulary')));
}

function renderCollocations() {
  $('tab-panel').innerHTML = `${sectionHeading('Des mots qui voyagent ensemble', 'Collocations', 'Memorize useful word partnerships as complete chunks.')}<div class="collocation-grid">${state.lesson.collocations.map(item => `<article class="collocation-card"><b>${inlineMarkdown(item.french || '')}</b><span>${inlineMarkdown(item.english || '')}</span><em>${inlineMarkdown(item.example || '')}</em></article>`).join('')}</div>`;
}

function renderNotes() {
  $('tab-panel').innerHTML = `${sectionHeading('À ne pas oublier', 'Important notes', 'Pronunciation, culture, and the small details textbooks sometimes hide.')}<div class="notes-board"><div class="rich-copy">${state.lesson.notes}</div></div>`;
}

function renderFlashcards() {
  const cards = state.lesson.flashcards;
  if (!cards.length) return;
  state.cardIndex = Math.min(state.cardIndex, cards.length - 1);
  const card = cards[state.cardIndex];
  const progress = getProgress();
  const known = progress.known.includes(state.cardIndex);
  $('tab-panel').innerHTML = `${sectionHeading('La mémoire, sans panique', 'Flashcards', 'Say the answer aloud before revealing it.', `${progress.known.length}/${cards.length} known`)}<div class="flashcard-stage"><div class="flashcard"><div class="flashcard-content"><strong>${inlineMarkdown(state.cardRevealed ? card.back : card.front)}</strong>${state.cardRevealed && card.hint ? `<p class="flashcard-hint">💡 ${inlineMarkdown(card.hint)}</p>` : '<p>What does it mean?</p>'}</div></div><p class="card-position">Card ${state.cardIndex + 1} of ${cards.length}${known ? ' · marked known' : ''}</p><div class="card-controls"><button class="button paper" id="previous-card" type="button">← Previous</button><button class="button blue" id="reveal-card" type="button">${state.cardRevealed ? 'Show French' : 'Reveal answer'}</button><button class="button ${known ? 'paper' : 'red'}" id="know-card" type="button">${known ? 'Undo known' : 'I knew it ✓'}</button><button class="button paper" id="next-card" type="button">Next →</button></div></div>`;
  $('previous-card').addEventListener('click', () => moveCard(-1));
  $('next-card').addEventListener('click', () => moveCard(1));
  $('reveal-card').addEventListener('click', () => { state.cardRevealed = !state.cardRevealed; renderFlashcards(); });
  $('know-card').addEventListener('click', markCardKnown);
}

function moveCard(change) {
  const length = state.lesson.flashcards.length;
  state.cardIndex = (state.cardIndex + change + length) % length;
  state.cardRevealed = false; renderFlashcards();
}

function markCardKnown() {
  const progress = getProgress();
  const adding = !progress.known.includes(state.cardIndex);
  progress.known = adding ? [...progress.known, state.cardIndex] : progress.known.filter(index => index !== state.cardIndex);
  if (adding) recordActivity('flashcard');
  setProgress(progress); renderFlashcards();
}

function renderExam() {
  const lesson = state.lesson;
  const progress = getProgress();
  const guide = lesson.examGuide ? `<div class="rich-copy">${lesson.examGuide}</div>` : '';
  const quiz = lesson.exam.length ? `<form class="quiz-form" id="quiz-form">${lesson.exam.map((question, index) => quizQuestion(question, index)).join('')}</form><div class="quiz-footer"><button class="button blue" id="check-quiz" type="button">Check my answers</button><button class="button paper" id="clear-quiz" type="button">Clear</button><span class="quiz-score" id="quiz-score">${progress.quizAttempted ? `Last score: ${progress.quizScore}/${lesson.exam.length}` : ''}</span></div>` : '';
  $('tab-panel').innerHTML = `${sectionHeading('Mode examen', 'Exam practice', 'Use the lesson first. Then answer from memory without opening another tab.', lesson.exam.length ? `${lesson.exam.length} questions` : '')}${guide}${quiz}`;
  if (lesson.exam.length) { $('check-quiz').addEventListener('click', checkQuiz); $('clear-quiz').addEventListener('click', renderExam); }
}

function quizQuestion(question, index) {
  const options = ['a', 'b', 'c', 'd'];
  return `<fieldset class="quiz-question" data-question="${index}" data-answer="${escapeHtml((question.answer || '').toUpperCase())}"><legend>${index + 1}. ${inlineMarkdown(question.question || '')}</legend>${options.map(letter => `<label class="answer-label"><input type="radio" name="question-${index}" value="${letter.toUpperCase()}"><span><b>${letter.toUpperCase()}.</b> ${inlineMarkdown(question[letter] || '')}</span></label>`).join('')}<p class="question-feedback" hidden></p></fieldset>`;
}

function checkQuiz() {
  let score = 0;
  $('tab-panel').querySelectorAll('.quiz-question').forEach((element, index) => {
    const selected = element.querySelector('input:checked')?.value;
    const correct = element.dataset.answer;
    const isCorrect = selected === correct;
    element.classList.remove('correct', 'incorrect'); element.classList.add(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) score += 1;
    const feedback = element.querySelector('.question-feedback'); feedback.hidden = false;
    feedback.innerHTML = `${isCorrect ? '✓ Correct.' : `Not quite. The answer is ${escapeHtml(correct)}.`} ${inlineMarkdown(state.lesson.exam[index].explanation || '')}`;
  });
  const progress = getProgress(); progress.quizAttempted = true; progress.quizScore = score;
  recordActivity('exam'); setProgress(progress); $('quiz-score').textContent = `Score: ${score}/${state.lesson.exam.length}`;
}

function renderExtra(index) {
  const extra = state.lesson.extras[index];
  if (extra) $('tab-panel').innerHTML = `${sectionHeading('Lecture', extra.title, 'Additional lesson notes.')}<div class="rich-copy">${extra.html}</div>`;
}

function streakStats(activity) {
  const active = new Set(Object.entries(activity).filter(([, entry]) => activityCount(entry) > 0).map(([key]) => key));
  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const key of sorted) {
    const date = dateFromKey(key);
    if (previous && Math.round((date - previous) / 86400000) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run); previous = date;
  }
  let cursor = new Date();
  if (!active.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (active.has(localDateKey(cursor))) { current += 1; cursor.setDate(cursor.getDate() - 1); }
  return { current, longest };
}

function allProgress() {
  return new Map(state.manifest.lessons.map(lesson => [lesson.slug, getProgress(lesson.slug)]));
}

function learnedTokenSet(progressMap) {
  const tokens = new Set(getFrequencyKnown().map(normalizeFrench));
  state.analytics.entities.vocabulary.forEach(entity => {
    if (progressMap.get(entity.slug)?.learnedWords.includes(entity.index)) entity.tokens.forEach(token => tokens.add(token));
  });
  return tokens;
}

function activityGrid(activity) {
  const days = [];
  const cursor = new Date(); cursor.setDate(cursor.getDate() - 364);
  for (let index = 0; index < 365; index += 1) {
    const key = localDateKey(cursor); const count = activityCount(activity[key]);
    const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
    days.push(`<span class="activity-cell level-${level}" title="${key}: ${count} learning action${count === 1 ? '' : 's'}" aria-label="${key}: ${count} actions"></span>`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.join('');
}

function metricCard(icon, label, value, note) {
  return `<article class="metric-card"><span>${icon}</span><div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${escapeHtml(note)}</p></div></article>`;
}

function progressRow(label, value, total, color = '') {
  const valuePercent = percent(value, total);
  return `<div class="mastery-row"><div><b>${escapeHtml(label)}</b><span>${value}/${total} · ${valuePercent}%</span></div><div class="mastery-track"><i style="width:${valuePercent}%;${color ? `background:${color}` : ''}"></i></div></div>`;
}

function barChart(items, limit = 12) {
  const selected = items.slice(0, limit); const max = Math.max(1, ...selected.map(item => item.count));
  return `<div class="bar-chart">${selected.map(item => `<div class="bar-row"><span title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><i><b style="width:${Math.max(2, item.count / max * 100)}%"></b></i><strong>${item.count}</strong></div>`).join('')}</div>`;
}

function countDistribution(values) {
  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), 'fr'));
}

function showDashboard() {
  if (!state.analytics) return;
  $('loading-state').hidden = true; $('error-state').hidden = true; $('lesson-view').hidden = true; $('dashboard-view').hidden = false;
  $('dashboard-button').classList.add('active'); closeMobileLibrary(); renderDashboard(); renderLibrary();
  document.title = 'Learning dashboard · Le Petit Atelier Français';
}

function renderDashboard() {
  const analytics = state.analytics;
  const progressMap = allProgress();
  const activity = getActivity();
  const streak = streakStats(activity);
  const learnedWords = analytics.entities.vocabulary.filter(item => progressMap.get(item.slug)?.learnedWords.includes(item.index));
  const learnedGrammar = analytics.entities.grammar.filter(item => progressMap.get(item.slug)?.learnedGrammar.includes(item.index));
  const learnedTokens = learnedTokenSet(progressMap);
  const knownCommon = analytics.commonWords.filter(item => learnedTokens.has(item.word));
  const learnedTypes = countDistribution(learnedWords.map(item => normalizeFrench(item.type || 'other')));
  const learnedLengths = countDistribution(learnedWords.flatMap(item => item.tokens).map(token => token.replace(/'/g, '').length)).sort((a, b) => Number(a.label) - Number(b.label));
  const totals = analytics.totals;
  const revealed = analytics.entities.lessons.reduce((sum, lesson) => sum + progressMap.get(lesson.slug).revealed.length, 0);
  const knownCards = analytics.entities.lessons.reduce((sum, lesson) => sum + progressMap.get(lesson.slug).known.length, 0);
  const examCorrect = analytics.entities.lessons.reduce((sum, lesson) => sum + (progressMap.get(lesson.slug).quizAttempted ? progressMap.get(lesson.slug).quizScore : 0), 0);
  const nextWords = analytics.commonWords.filter(item => !learnedTokens.has(item.word)).slice(0, 18);
  $('dashboard-view').innerHTML = `<header class="dashboard-hero"><div><span class="kicker">Le tableau de bord</span><h2>Your French, in motion.</h2><p>Progress is stored privately in this browser. Export a backup before clearing browser data or changing devices.</p></div><div class="dashboard-actions"><button class="button paper" id="export-progress" type="button">Export progress</button><label class="button blue import-label">Import progress<input id="import-progress" type="file" accept="application/json,.json"></label></div></header>
  <div class="metric-grid">${metricCard('🔥', 'Current streak', `${streak.current} day${streak.current === 1 ? '' : 's'}`, `Longest: ${streak.longest} days`)}${metricCard('📚', 'Vocabulary learned', `${learnedWords.length}/${totals.vocabulary}`, `${percent(learnedWords.length, totals.vocabulary)}% of added vocabulary`)}${metricCard('🧩', 'Grammar learned', `${learnedGrammar.length}/${totals.grammar}`, `${percent(learnedGrammar.length, totals.grammar)}% of added patterns`)}${metricCard('🇫🇷', 'Common-5,000 learned', `${knownCommon.length}/5,000`, `${percent(knownCommon.length, 5000)}% personal coverage`)}</div>
  <section class="dashboard-card activity-card"><div class="card-heading"><div><span class="kicker">365 jours</span><h3>Learning activity</h3></div><span>${Object.values(activity).reduce((sum, entry) => sum + activityCount(entry), 0)} actions</span></div><div class="activity-scroll"><div class="activity-grid">${activityGrid(activity)}</div></div><div class="activity-legend"><span>Less</span>${[0,1,2,3,4].map(level => `<i class="activity-cell level-${level}"></i>`).join('')}<span>More</span></div></section>
  <div class="dashboard-columns"><section class="dashboard-card"><div class="card-heading"><div><span class="kicker">Maîtrise</span><h3>Topic progress</h3></div></div>${progressRow('Transcript translations', revealed, totals.transcriptLines)}${progressRow('Vocabulary', learnedWords.length, totals.vocabulary)}${progressRow('Grammar', learnedGrammar.length, totals.grammar)}${progressRow('Flashcards', knownCards, totals.flashcards)}${progressRow('Exam answers', examCorrect, totals.examQuestions)}</section>
  <section class="dashboard-card"><div class="card-heading"><div><span class="kicker">Corpus</span><h3>Content snapshot</h3></div></div><div class="snapshot-grid"><span><b>${totals.transcriptTokens}</b> French tokens</span><span><b>${totals.uniqueTranscriptWords}</b> unique words</span><span><b>${totals.transcriptLines}</b> translated lines</span><span><b>${totals.lessons}</b> lessons</span></div><p class="source-note">The published catalogue contains <b>${totals.catalogueCommonWords}</b> of the benchmark’s 5,000 words (${totals.catalogueCoveragePercent}%). This is catalogue coverage, not personal mastery.</p></section></div>
  <div class="dashboard-columns"><section class="dashboard-card"><div class="card-heading"><div><span class="kicker">EDA</span><h3>Most frequent transcript words</h3></div></div>${barChart(analytics.distributions.topTranscriptWords, 12)}</section><section class="dashboard-card"><div class="card-heading"><div><span class="kicker">EDA</span><h3>Word-length distribution</h3></div></div>${barChart(analytics.distributions.wordLength.map(item => ({ label: `${item.label} letters`, count: item.count })), 14)}</section></div>
  <div class="dashboard-columns"><section class="dashboard-card"><div class="card-heading"><div><span class="kicker">Mes mots</span><h3>Learned vocabulary by type</h3></div></div>${learnedTypes.length ? barChart(learnedTypes, 12) : '<div class="empty-section">Mark vocabulary learned to build this distribution.</div>'}</section><section class="dashboard-card"><div class="card-heading"><div><span class="kicker">Mes mots</span><h3>Learned-word lengths</h3></div></div>${learnedLengths.length ? barChart(learnedLengths.map(item => ({ label: `${item.label} letters`, count: item.count })), 14) : '<div class="empty-section">Your learned-word EDA will appear here.</div>'}</section></div>
  <section class="dashboard-card"><div class="card-heading"><div><span class="kicker">Les 5 000 mots</span><h3>Frequency benchmark match</h3></div><span>${knownCommon.length} personally learned</span></div><div class="band-grid">${analytics.frequencyBands.map(band => { const personal = analytics.commonWords.slice(band.start - 1, band.end).filter(item => learnedTokens.has(item.word)).length; return `<div><b>Ranks ${band.label}</b><span>Personal: ${personal}/${band.total}</span><span>Catalogue: ${band.catalogue}/${band.total}</span></div>`; }).join('')}</div><h4 class="next-title">Next high-frequency words</h4><div class="common-word-grid">${nextWords.map(item => `<button type="button" data-common-word="${escapeHtml(item.word)}"><b>${escapeHtml(item.word)}</b><span>#${item.rank}</span></button>`).join('')}</div><p class="source-note">Source: <a href="${escapeHtml(analytics.benchmark.url)}" target="_blank" rel="noopener">${escapeHtml(analytics.benchmark.source)}</a> (${escapeHtml(analytics.benchmark.license)}). ${escapeHtml(analytics.benchmark.caveat)} For a pedagogical alternative, see <a href="https://www.lexique.org/" target="_blank" rel="noopener">Lexique</a>.</p></section>
  <section class="dashboard-card entity-section"><div class="card-heading"><div><span class="kicker">Inventaire</span><h3>Added learning entities</h3></div><span>${totals.lessons + totals.vocabulary + totals.grammar + totals.collocations} entries</span></div><div class="entity-controls"><label class="compact-search"><span>⌕</span><input id="entity-search" type="search" value="${escapeHtml(state.entitySearch)}" placeholder="Search words, grammar, lessons…"></label><div id="entity-filters"></div></div><div class="entity-list" id="entity-list"></div></section><p class="import-status" id="import-status" role="status"></p>`;
  bindDashboard(progressMap);
}

function dashboardEntities() {
  const entities = [
    ...state.analytics.entities.lessons.map(item => ({ kind: 'lesson', slug: item.slug, title: item.title, detail: `${titleCase(item.type)} · ${item.level}`, tab: 'overview' })),
    ...state.analytics.entities.vocabulary.map(item => ({ kind: 'vocabulary', slug: item.slug, index: item.index, title: item.french, detail: `${item.english} · ${item.type}${item.rank ? ` · rank #${item.rank}` : ''}`, tab: 'vocabulary' })),
    ...state.analytics.entities.grammar.map(item => ({ kind: 'grammar', slug: item.slug, index: item.index, title: item.title, detail: item.lesson, tab: 'grammar' })),
    ...state.analytics.entities.collocations.map(item => ({ kind: 'collocation', slug: item.slug, index: item.index, title: item.french, detail: `${item.english} · ${item.lesson}`, tab: 'collocations' }))
  ];
  const q = normalize(state.entitySearch);
  return entities.filter(item => (state.entityType === 'all' || item.kind === state.entityType) && (!q || normalize(`${item.title} ${item.detail}`).includes(q)));
}

function renderEntityList(progressMap = allProgress()) {
  const types = ['all', 'lesson', 'vocabulary', 'grammar', 'collocation'];
  $('entity-filters').innerHTML = types.map(type => `<button class="word-filter ${state.entityType === type ? 'active' : ''}" type="button" data-entity-type="${type}">${type}</button>`).join('');
  const entities = dashboardEntities();
  $('entity-list').innerHTML = entities.slice(0, 200).map(item => {
    const progress = progressMap.get(item.slug);
    const learned = item.kind === 'vocabulary' ? progress.learnedWords.includes(item.index) : item.kind === 'grammar' ? progress.learnedGrammar.includes(item.index) : false;
    return `<button type="button" class="entity-row" data-open-slug="${escapeHtml(item.slug)}" data-open-tab="${item.tab}"><span class="entity-kind">${escapeHtml(item.kind)}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></span>${learned ? '<strong class="entity-learned">✓ learned</strong>' : '<span>›</span>'}</button>`;
  }).join('') || '<div class="empty-section">No matching entity.</div>';
  $('entity-filters').querySelectorAll('[data-entity-type]').forEach(button => button.addEventListener('click', () => { state.entityType = button.dataset.entityType; renderEntityList(progressMap); }));
  $('entity-list').querySelectorAll('[data-open-slug]').forEach(button => button.addEventListener('click', () => { location.hash = new URLSearchParams({ lesson: button.dataset.openSlug, tab: button.dataset.openTab }).toString(); }));
}

function bindDashboard(progressMap) {
  renderEntityList(progressMap);
  $('entity-search').addEventListener('input', event => { state.entitySearch = event.target.value; renderEntityList(progressMap); });
  $('export-progress').addEventListener('click', exportProgress);
  $('import-progress').addEventListener('change', importProgress);
  $('dashboard-view').querySelectorAll('[data-common-word]').forEach(button => button.addEventListener('click', () => {
    const word = normalizeFrench(button.dataset.commonWord); const known = new Set(getFrequencyKnown());
    if (!known.has(word)) { known.add(word); recordActivity('frequency-word'); }
    localStorage.setItem(FREQUENCY_KEY, JSON.stringify([...known])); renderDashboard();
  }));
}

function exportProgress() {
  const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), progress: Object.fromEntries(state.manifest.lessons.map(lesson => [lesson.slug, getProgress(lesson.slug)])), activity: getActivity(), frequencyKnown: getFrequencyKnown() };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `atelier-progress-${localDateKey()}.json`; link.click(); URL.revokeObjectURL(link.href);
}

async function importProgress(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.schemaVersion !== 1 || typeof payload.progress !== 'object') throw new Error('This is not an Atelier progress export.');
    state.manifest.lessons.forEach(lesson => { if (payload.progress[lesson.slug]) localStorage.setItem(progressKey(lesson.slug), JSON.stringify({ ...emptyProgress(), ...payload.progress[lesson.slug] })); });
    if (payload.activity && typeof payload.activity === 'object') localStorage.setItem(ACTIVITY_KEY, JSON.stringify(payload.activity));
    if (Array.isArray(payload.frequencyKnown)) localStorage.setItem(FREQUENCY_KEY, JSON.stringify(payload.frequencyKnown.map(normalizeFrench)));
    recordActivity('import'); renderDashboard(); $('import-status').textContent = `Imported ${file.name} successfully.`;
  } catch (error) {
    $('import-status').textContent = `Import failed: ${error.message}`;
  }
}

function closeMobileLibrary() {
  $('library-panel').classList.remove('open');
  $('mobile-library-button').setAttribute('aria-expanded', 'false');
}

function initTheme() {
  const saved = localStorage.getItem('atelier-theme');
  const dark = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-button').textContent = dark ? '☀' : '☾';
}

$('library-search').addEventListener('input', event => { state.search = event.target.value; renderLibrary(); });
$('mobile-library-button').addEventListener('click', () => { const open = $('library-panel').classList.toggle('open'); $('mobile-library-button').setAttribute('aria-expanded', String(open)); });
$('dashboard-button').addEventListener('click', () => { location.hash = 'dashboard'; });
$('theme-button').addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('atelier-theme', next); $('theme-button').textContent = next === 'dark' ? '☀' : '☾'; });
$('reset-lesson').addEventListener('click', () => { localStorage.removeItem(progressKey()); state.cardIndex = 0; state.cardRevealed = false; updateProgress(); renderActiveTab(); });
$('retry-button').addEventListener('click', loadManifest);
window.addEventListener('hashchange', async () => {
  if (!state.manifest) return;
  const route = readRoute();
  if (route.dashboard) { showDashboard(); return; }
  const item = state.manifest.lessons.find(lesson => lesson.slug === route.slug) || state.selected || state.manifest.lessons[0];
  if (item.slug !== state.selected?.slug || $('lesson-view').hidden) await loadLesson(item, route.tab);
  else if (route.tab && availableTabs().some(tab => tab.id === route.tab)) { state.activeTab = route.tab; renderTabs(); renderActiveTab(); }
});

initTheme();
loadManifest();
