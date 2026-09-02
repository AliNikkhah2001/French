import { escapeHtml, inlineMarkdown, parseLesson } from './content-parser.js';
import { dateFromKey, localDateKey, normalizeFrench } from './analytics-utils.js';

const ACTIVITY_KEY = 'atelier-activity-v1';
const FREQUENCY_KEY = 'atelier-frequency-known-v1';
const WORDLIST_KEY = 'atelier-wordlist-v1';
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
  entitySearch: '',
  view: 'lesson',
  wordlistFilter: 'all',
  reviewFilter: 'due',
  reviewIndex: 0,
  reviewRevealed: false,
  installEvent: null
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
  const raw = location.hash.replace(/^#/, '');
  if (raw === 'dashboard') return { view: 'dashboard', slug: null, tab: null };
  if (raw === 'wordlist') return { view: 'wordlist', slug: null, tab: null };
  if (raw === 'review') return { view: 'review', slug: null, tab: null };
  const params = new URLSearchParams(raw);
  return {
    view: params.get('view') || 'lesson',
    slug: params.get('lesson'),
    tab: params.get('tab'),
    wordlistFilter: params.get('wl'),
    reviewFilter: params.get('rv')
  };
}

function replaceRoute(updates = {}) {
  const current = readRoute();
  const params = new URLSearchParams();
  const view = updates.view ?? current.view ?? 'lesson';
  if (view !== 'lesson') params.set('view', view);
  const slug = updates.slug ?? current.slug;
  const tab = updates.tab ?? current.tab;
  if (view === 'lesson' && slug) params.set('lesson', slug);
  if (view === 'lesson' && tab) params.set('tab', tab);
  if (updates.wordlistFilter) params.set('wl', updates.wordlistFilter);
  if (updates.reviewFilter) params.set('rv', updates.reviewFilter);
  const next = params.toString();
  history.replaceState(null, '', `${location.pathname}${location.search}${next ? `#${next}` : ''}`);
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
    if (route.view === 'dashboard') showDashboard();
    else if (route.view === 'wordlist') showWordList();
    else if (route.view === 'review') showReview();
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
  $('wordlist-view').hidden = true;
  $('review-view').hidden = true;
  document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
  $('dashboard-button')?.classList.remove('active');
}

function showError(message) {
  $('loading-state').hidden = true;
  $('lesson-view').hidden = true;
  $('dashboard-view').hidden = true;
  $('wordlist-view').hidden = true;
  $('review-view').hidden = true;
  $('error-state').hidden = false;
  $('error-message').textContent = message;
}

function showLesson() {
  $('loading-state').hidden = true;
  $('error-state').hidden = true;
  $('dashboard-view').hidden = true;
  $('wordlist-view').hidden = true;
  $('review-view').hidden = true;
  $('lesson-view').hidden = false;
  document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
  $('dashboard-button').classList.remove('active');
  state.view = 'lesson';
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
  $('tab-panel').querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', event => speak(button.dataset.speak, event.currentTarget)));
}

function transcriptCard(line, index, revealed) {
  const frenchText = (line.french || '').replace(/<[^>]+>/g, '').trim();
  return `<article class="transcript-card"><div class="transcript-french"><span class="line-number">${String(index + 1).padStart(2, '0')}</span><div class="french-line">${inlineMarkdown(line.french || '')}<button class="speak-button" type="button" data-speak="${escapeHtml(frenchText)}" aria-label="Pronounce line" title="Pronounce line" style="margin-left:8px;">🔊</button></div><button class="translation-button" type="button" data-reveal-line="${index}" aria-expanded="${revealed}">${revealed ? 'Hide English' : 'Reveal English'}</button></div><div class="transcript-english" ${revealed ? '' : 'hidden'}><p>${inlineMarkdown(line.english || '')}</p>${line.notes ? `<span class="transcript-note">💡 ${inlineMarkdown(line.notes)}</span>` : ''}</div></article>`;
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
  $('tab-panel').innerHTML = `${sectionHeading('Le panier de mots', 'Vocabulary market', 'Search, filter, and mark each useful word as learned.', `${progress.learnedWords.length}/${state.lesson.vocabulary.length} learned`)}<div class="word-controls"><label class="compact-search"><span>⌕</span><input id="word-search" type="search" value="${escapeHtml(query)}" placeholder="Search French or English…"></label><div class="word-filter-row">${vocabularyTypes().map(type => `<button class="word-filter ${type === state.wordType ? 'active' : ''}" type="button" data-word-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join('')}</div></div><div class="table-scroll"><table class="vocabulary-table"><thead><tr><th>French</th><th>English</th><th>Type</th><th>Note</th><th>Actions</th></tr></thead><tbody>${words.map(({ word, index }) => { const learned = progress.learnedWords.includes(index); const french = (word.french || '').replace(/<[^>]+>/g, '').split('/')[0].trim(); return `<tr class="${learned ? 'learned-row' : ''}"><td><span class="word-link" data-lookup="${escapeHtml(french)}" tabindex="0">${inlineMarkdown(word.french || '')}</span> <button class="speak-button" type="button" data-speak="${escapeHtml(french)}" aria-label="Pronounce" title="Pronounce">🔊</button></td><td>${inlineMarkdown(word.english || '')}</td><td>${inlineMarkdown(word.type || '')}</td><td>${inlineMarkdown(word.note || '')}</td><td><button class="mastery-button ${learned ? 'learned' : ''}" type="button" data-learn-word="${index}">${learned ? '✓ Learned' : 'Learn'}</button> <button class="mastery-button" type="button" data-add-wordlist="${index}" title="Add to my word list">+ List</button></td></tr>`; }).join('')}</tbody></table></div>`;
  $('word-search').addEventListener('input', event => renderVocabulary(event.target.value));
  $('tab-panel').querySelectorAll('[data-word-type]').forEach(button => button.addEventListener('click', () => { state.wordType = button.dataset.wordType; renderVocabulary(query); }));
  $('tab-panel').querySelectorAll('[data-learn-word]').forEach(button => button.addEventListener('click', () => toggleLearned('learnedWords', Number(button.dataset.learnWord), () => renderVocabulary(query), 'vocabulary')));
  $('tab-panel').querySelectorAll('[data-add-wordlist]').forEach(button => button.addEventListener('click', () => addLessonWordToList(Number(button.dataset.addWordlist))));
  $('tab-panel').querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', event => speak(button.dataset.speak, event.currentTarget)));
}

function addLessonWordToList(index) {
  const word = state.lesson.vocabulary[index];
  if (!word) return;
  const french = (word.french || '').replace(/<[^>]+>/g, '').split('/')[0].trim();
  const list = getWordList();
  if (list.some(item => normalizeFrench(item.french) === normalizeFrench(french))) {
    showToast(`“${french}” is already in your list.`, 'success');
    return;
  }
  list.unshift({
    id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    french,
    english: word.english || '',
    type: word.type || 'vocab',
    createdAt: Date.now()
  });
  saveWordList(list);
  recordActivity('word-add');
  showToast(`Added “${french}” to your list.`, 'success');
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
  const frontText = (card.front || '').replace(/<[^>]+>/g, '').split('/')[0].trim();
  $('tab-panel').innerHTML = `${sectionHeading('La mémoire, sans panique', 'Flashcards', 'Say the answer aloud before revealing it.', `${progress.known.length}/${cards.length} known`)}<div class="flashcard-stage"><div class="flashcard"><div class="flashcard-content"><button class="speak-button" type="button" id="flashcard-speak" data-speak="${escapeHtml(frontText)}" aria-label="Pronounce" title="Pronounce" style="position:absolute;top:18px;right:18px;">🔊</button><strong>${inlineMarkdown(state.cardRevealed ? card.back : card.front)}</strong>${state.cardRevealed && card.hint ? `<p class="flashcard-hint">💡 ${inlineMarkdown(card.hint)}</p>` : '<p>What does it mean?</p>'}</div></div><p class="card-position">Card ${state.cardIndex + 1} of ${cards.length}${known ? ' · marked known' : ''}</p><div class="card-controls"><button class="button paper" id="previous-card" type="button">← Previous</button><button class="button blue" id="reveal-card" type="button">${state.cardRevealed ? 'Show French' : 'Reveal answer'}</button><button class="button ${known ? 'paper' : 'red'}" id="know-card" type="button">${known ? 'Undo known' : 'I knew it ✓'}</button><button class="button paper" id="next-card" type="button">Next →</button><button class="button paper" id="add-flashcard-list" type="button" title="Add to my word list">+ List</button></div></div>`;
  $('previous-card').addEventListener('click', () => moveCard(-1));
  $('next-card').addEventListener('click', () => moveCard(1));
  $('reveal-card').addEventListener('click', () => { state.cardRevealed = !state.cardRevealed; renderFlashcards(); });
  $('know-card').addEventListener('click', markCardKnown);
  $('flashcard-speak').addEventListener('click', event => speak(frontText, event.currentTarget));
  $('add-flashcard-list').addEventListener('click', () => {
    const list = getWordList();
    if (list.some(item => normalizeFrench(item.french) === normalizeFrench(frontText))) {
      showToast(`“${frontText}” is already in your list.`, 'success');
      return;
    }
    list.unshift({
      id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      french: frontText,
      english: card.back || '',
      type: 'phrase',
      createdAt: Date.now()
    });
    saveWordList(list);
    recordActivity('word-add');
    showToast(`Added “${frontText}” to your list.`, 'success');
  });
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
  $('wordlist-view').hidden = true; $('review-view').hidden = true;
  $('dashboard-button').classList.add('active'); closeMobileLibrary(); renderDashboard(); renderLibrary();
  document.title = 'Learning dashboard · Le Petit Atelier Français';
  state.view = 'dashboard';
  document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
  $('dashboard-button').classList.add('active');
}

/* ------------------- Word list & spaced repetition ------------------- */

function getWordList() {
  try { return JSON.parse(localStorage.getItem(WORDLIST_KEY)) || []; }
  catch { return []; }
}

function saveWordList(list) {
  localStorage.setItem(WORDLIST_KEY, JSON.stringify(list));
}

function spacedRepetitionBucket(word, now = Date.now()) {
  if (!word.lastReviewed) return 'fresh';
  const interval = word.interval || 0;
  const due = (word.dueAt || 0) - now;
  if (due <= 0) return 'due';
  if (due < 86400000) return 'soon';
  return 'later';
}

function recordReview(word, quality) {
  const now = Date.now();
  word.lastReviewed = now;
  word.repetitions = (word.repetitions || 0) + 1;
  word.reviews = word.reviews || [];
  word.reviews.push({ at: now, quality });
  let interval;
  if (quality < 2) {
    interval = 60 * 1000;
    word.repetitions = 0;
  } else if (quality === 2) {
    interval = Math.max(60 * 1000, (word.interval || 0) * 1.2);
  } else if (quality === 3) {
    interval = Math.max(24 * 3600 * 1000, (word.interval || 0) * 2.5 || 24 * 3600 * 1000);
  } else {
    interval = Math.max(3 * 24 * 3600 * 1000, (word.interval || 0) * 4 || 3 * 24 * 3600 * 1000);
  }
  word.interval = interval;
  word.dueAt = now + interval;
  return word;
}

function showWordList() {
  if (!state.analytics) return;
  $('loading-state').hidden = true; $('error-state').hidden = true; $('lesson-view').hidden = true; $('dashboard-view').hidden = true;
  $('wordlist-view').hidden = false; $('review-view').hidden = true;
  document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
  $('wordlist-button').classList.add('active');
  closeMobileLibrary();
  state.view = 'wordlist';
  document.title = 'My word list · Le Petit Atelier Français';
  renderWordList();
  renderLibrary();
}

function renderWordList() {
  const words = getWordList();
  const filter = state.wordlistFilter;
  const now = Date.now();
  const filtered = filter === 'all' ? words : words.filter(w => spacedRepetitionBucket(w, now) === filter);
  const stats = words.reduce((acc, word) => {
    const bucket = spacedRepetitionBucket(word, now);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, { fresh: 0, due: 0, soon: 0, later: 0 });
  const filterChip = (value, label) => `<button class="review-tab ${filter === value ? 'active' : ''}" data-wl-filter="${value}">${label}</button>`;
  $('wordlist-view').innerHTML = `
    <header class="wordlist-hero">
      <div>
        <span class="kicker">Mon carnet</span>
        <h2>My word list</h2>
        <p>Add any French word, mark what you remember, and the review queue keeps it fresh in long-term memory.</p>
      </div>
      <div class="wordlist-stats">
        <div class="wordlist-stat"><small>Total words</small><b>${words.length}</b></div>
        <div class="wordlist-stat"><small>Due today</small><b>${stats.due || 0}</b></div>
        <div class="wordlist-stat"><small>Coming up</small><b>${stats.soon || 0}</b></div>
        <div class="wordlist-stat"><small>Mastered</small><b>${stats.later || 0}</b></div>
      </div>
      <form class="add-word-form" id="add-word-form" autocomplete="off">
        <input id="add-french" type="text" placeholder="Mot français…" required maxlength="80" aria-label="French word">
        <input id="add-english" type="text" placeholder="English meaning…" maxlength="120" aria-label="English meaning">
        <input id="add-type" type="text" placeholder="Type (noun, verb…)" maxlength="40" aria-label="Type">
        <button class="button blue" type="submit" style="grid-column:1/-1;justify-self:stretch;">+ Add word</button>
      </form>
      <div class="review-tabs">${filterChip('all', 'All')} ${filterChip('fresh', 'New')} ${filterChip('due', 'Due')} ${filterChip('soon', 'Soon')} ${filterChip('later', 'Mastered')}</div>
    </header>
    <details class="add-note" style="margin-top:18px;background:var(--cream);">
      <summary style="cursor:pointer;font-weight:800;color:var(--ink);">📥 Bulk import (paste lines like <em>chat — cat — noun</em>)</summary>
      <textarea id="bulk-import" rows="5" placeholder="chat — cat — noun&#10;chien — dog — noun&#10;manger — to eat — verb" style="width:100%;margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--paper);"></textarea>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button class="button blue" type="button" id="bulk-import-button">Import words</button>
        <button class="button paper" type="button" id="bulk-export-button">Export JSON</button>
        <label class="button paper" style="cursor:pointer;">Import JSON<input type="file" id="bulk-import-file" accept="application/json" hidden></label>
      </div>
    </details>
    <div class="wordlist-table">
      <table>
        <thead><tr><th>French</th><th>English</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${filtered.length ? filtered.map(word => wordListRow(word, now)).join('') : '<tr><td colspan="5"><div class="empty-section">Your word list is empty. Add a word above to start studying.</div></td></tr>'}</tbody>
      </table>
    </div>`;
  $('add-word-form').addEventListener('submit', event => { event.preventDefault(); addWordFromForm(); });
  $('wordlist-view').querySelectorAll('[data-wl-filter]').forEach(button => button.addEventListener('click', () => {
    state.wordlistFilter = button.dataset.wlFilter;
    replaceRoute({ wordlistFilter: state.wordlistFilter });
    renderWordList();
  }));
  $('wordlist-view').querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => speak(button.dataset.speak, button)));
  $('wordlist-view').querySelectorAll('[data-lookup]').forEach(button => button.addEventListener('click', event => openDictionary(event.target, button.dataset.lookup)));
  $('wordlist-view').querySelectorAll('[data-delete-word]').forEach(button => button.addEventListener('click', () => deleteWord(button.dataset.deleteWord)));
  $('bulk-import-button')?.addEventListener('click', () => {
    const text = $('bulk-import').value;
    const added = importWords(text);
    if (added) showToast(`Imported ${added} word${added === 1 ? '' : 's'}.`, 'success');
    else showToast('Nothing to import — check the format.', 'error');
    renderWordList();
  });
  $('bulk-export-button')?.addEventListener('click', () => exportWordList());
  $('bulk-import-file')?.addEventListener('change', event => importWordListJson(event));
}

function wordListRow(word, now) {
  const bucket = spacedRepetitionBucket(word, now);
  const status = bucket === 'fresh' ? '<span class="review-now">New</span>' : bucket === 'due' ? '<span class="review-now">Due now</span>' : bucket === 'soon' ? '<span class="review-soon">Soon</span>' : '<span class="review-ok">Mastered</span>';
  const due = word.dueAt ? new Date(word.dueAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const speak = `<button class="speak-button" type="button" data-speak="${escapeHtml(word.french)}" aria-label="Pronounce ${escapeHtml(word.french)}" title="Pronounce">🔊</button>`;
  const lookup = `<button class="icon-action" type="button" data-lookup="${escapeHtml(word.french)}" title="Dictionary">📖</button>`;
  const del = `<button class="icon-action danger" type="button" data-delete-word="${escapeHtml(word.id)}" title="Remove">✕</button>`;
  return `<tr>
    <td class="french-cell" data-label="French"><span class="word-link" data-lookup="${escapeHtml(word.french)}" tabindex="0">${inlineMarkdown(word.french)}</span> ${speak}</td>
    <td data-label="English">${inlineMarkdown(word.english || '')}</td>
    <td data-label="Type">${inlineMarkdown(word.type || '')}</td>
    <td data-label="Status">${status}<br><small style="color:var(--muted)">${due}</small></td>
    <td class="actions" data-label="Actions">${lookup}${del}</td>
  </tr>`;
}

function addWordFromForm() {
  const french = $('add-french').value.trim();
  const english = $('add-english').value.trim();
  const type = $('add-type').value.trim();
  if (!french) return;
  const list = getWordList();
  list.unshift({
    id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    french,
    english,
    type: type || 'vocab',
    createdAt: Date.now()
  });
  saveWordList(list);
  recordActivity('word-add');
  showToast(`Added “${french}” to your list.`, 'success');
  $('add-french').value = '';
  $('add-english').value = '';
  $('add-type').value = '';
  renderWordList();
}

function deleteWord(id) {
  const list = getWordList().filter(word => word.id !== id);
  saveWordList(list);
  renderWordList();
  showToast('Word removed.', 'success');
}

function exportWordList() {
  const list = getWordList();
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `atelier-wordlist-${localDateKey()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importWordListJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('Expected a JSON array of words.');
      const list = getWordList();
      for (const item of data) {
        if (!item || typeof item.french !== 'string' || !item.french.trim()) continue;
        list.unshift({
          id: item.id || `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          french: item.french.trim(),
          english: (item.english || '').trim(),
          type: (item.type || 'vocab').trim(),
          createdAt: item.createdAt || Date.now(),
          lastReviewed: item.lastReviewed || null,
          interval: item.interval || 0,
          dueAt: item.dueAt || 0,
          repetitions: item.repetitions || 0,
          reviews: item.reviews || []
        });
      }
      saveWordList(list);
      showToast(`Imported ${data.length} word${data.length === 1 ? '' : 's'}.`, 'success');
      renderWordList();
    } catch (error) {
      showToast(`Import failed: ${error.message}`, 'error');
    }
  };
  reader.readAsText(file);
}

function importWords(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const list = getWordList();
  let added = 0;
  for (const line of lines) {
    const parts = line.split(/[—–\-=:,;]\s*|\t+/).map(p => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const [french, english, type] = parts;
    if (!french) continue;
    list.unshift({
      id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      french, english: english || '', type: type || 'vocab', createdAt: Date.now()
    });
    added += 1;
  }
  saveWordList(list);
  return added;
}

/* ------------------- Review (spaced repetition) ------------------- */

function reviewQueue(filter = state.reviewFilter) {
  const words = getWordList();
  const now = Date.now();
  if (filter === 'all') return [...words];
  if (filter === 'fresh') return words.filter(w => !w.lastReviewed);
  return words.filter(w => spacedRepetitionBucket(w, now) === filter);
}

function showReview() {
  if (!state.analytics) return;
  $('loading-state').hidden = true; $('error-state').hidden = true; $('lesson-view').hidden = true; $('dashboard-view').hidden = true;
  $('wordlist-view').hidden = true; $('review-view').hidden = false;
  document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
  $('review-button').classList.add('active');
  closeMobileLibrary();
  state.view = 'review';
  state.reviewIndex = 0;
  state.reviewRevealed = false;
  document.title = 'Review · Le Petit Atelier Français';
  renderLibrary();
  renderReview();
}

function renderReview() {
  const queue = reviewQueue();
  const total = queue.length;
  if (!total) {
    $('review-view').innerHTML = `<div class="review-empty"><span>🌿</span><b>No words in this queue.</b><p>Try another filter, or add some words from <a href="#wordlist">My word list</a>.</p></div>`;
    return;
  }
  if (state.reviewIndex >= total) state.reviewIndex = total - 1;
  if (state.reviewIndex < 0) state.reviewIndex = 0;
  const word = queue[state.reviewIndex];
  const dueAt = word.dueAt ? new Date(word.dueAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const filterChip = (value, label) => `<button class="review-tab ${state.reviewFilter === value ? 'active' : ''}" data-rv-filter="${value}">${label}</button>`;
  const head = `${state.reviewIndex + 1} of ${total}`;
  const speak = `<button class="speak-button" type="button" id="review-speak" data-speak="${escapeHtml(word.french)}" aria-label="Pronounce" title="Pronounce">🔊</button>`;
  $('review-view').innerHTML = `
    <header class="review-hero">
      <div>
        <span class="kicker">La révision</span>
        <h2>Review due words</h2>
        <p>Spaced repetition picks the next card based on how well you remembered it last time. Speak the word aloud, then reveal the meaning.</p>
      </div>
      <div class="review-tabs">${filterChip('due', 'Due now')} ${filterChip('fresh', 'New')} ${filterChip('soon', 'Soon')} ${filterChip('later', 'Mastered')} ${filterChip('all', 'All')}</div>
    </header>
    <div class="review-stage">
      <div class="review-card-content">
        <div>${speak}<strong style="margin-left:8px;color:var(--blue-2);">${escapeHtml(word.type || 'vocab')}</strong></div>
        <div class="french-word">${inlineMarkdown(word.french)}</div>
        ${state.reviewRevealed ? `<div class="english-word">${inlineMarkdown(word.english || '—')}</div>` : `<div class="reveal-hint">Say it aloud, then reveal the meaning.</div>`}
      </div>
    </div>
    <div class="review-controls">
      <button class="button paper" id="review-prev" type="button" ${state.reviewIndex <= 0 ? 'disabled' : ''}>← Previous</button>
      <button class="button blue" id="review-reveal" type="button">${state.reviewRevealed ? 'Hide meaning' : 'Reveal meaning'}</button>
      <button class="button paper" id="review-skip" type="button">Skip →</button>
    </div>
    <div class="review-controls">
      <button class="button red" data-quality="1" type="button">Forgot</button>
      <button class="button paper" data-quality="2" type="button">Hard</button>
      <button class="button paper" data-quality="3" type="button">Good</button>
      <button class="button blue" data-quality="4" type="button">Easy</button>
    </div>
    <div class="review-progress">
      <span>${head} · next due ${dueAt}</span>
      <span class="progress-fill-mini"><b style="width:${percent(state.reviewIndex + 1, total)}%"></b></span>
    </div>`;
  $('review-prev').addEventListener('click', () => { if (state.reviewIndex > 0) { state.reviewIndex -= 1; state.reviewRevealed = false; renderReview(); } });
  $('review-reveal').addEventListener('click', () => { state.reviewRevealed = !state.reviewRevealed; renderReview(); });
  $('review-skip').addEventListener('click', () => { state.reviewIndex = Math.min(total - 1, state.reviewIndex + 1); state.reviewRevealed = false; renderReview(); });
  $('review-speak').addEventListener('click', event => speak(word.french, event.currentTarget));
  $('review-view').querySelectorAll('[data-rv-filter]').forEach(button => button.addEventListener('click', () => {
    state.reviewFilter = button.dataset.rvFilter;
    state.reviewIndex = 0;
    state.reviewRevealed = false;
    replaceRoute({ reviewFilter: state.reviewFilter });
    renderReview();
  }));
  $('review-view').querySelectorAll('[data-quality]').forEach(button => button.addEventListener('click', () => {
    const list = getWordList();
    const index = list.findIndex(item => item.id === word.id);
    if (index < 0) return;
    recordReview(list[index], Number(button.dataset.quality));
    saveWordList(list);
    recordActivity('review');
    const newQueue = reviewQueue();
    if (state.reviewIndex >= newQueue.length) state.reviewIndex = Math.max(0, newQueue.length - 1);
    state.reviewRevealed = false;
    showToast('Progress saved.', 'success');
    renderReview();
  }));
}

/* ------------------- Speech synthesis & dictionary ------------------- */

let activeUtterance = null;

function speak(text, button) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  if (!('speechSynthesis' in window)) {
    showToast('Speech synthesis is not supported in this browser.', 'error');
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const frenchVoice = voices.find(voice => voice.lang?.toLowerCase().startsWith('fr'));
    if (frenchVoice) utterance.voice = frenchVoice;
    utterance.onend = () => button?.classList.remove('playing');
    utterance.onerror = () => button?.classList.remove('playing');
    activeUtterance = utterance;
    if (button) {
      button.classList.add('playing');
      button.disabled = true;
      utterance.onend = () => { button.classList.remove('playing'); button.disabled = false; };
      utterance.onerror = () => { button.classList.remove('playing'); button.disabled = false; };
    }
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    showToast('Could not play pronunciation.', 'error');
  }
}

const dictionaryCache = new Map();

async function lookupWord(word) {
  const key = normalizeFrench(word);
  if (dictionaryCache.has(key)) return dictionaryCache.get(key);
  const url = `https://fr.wiktionary.org/api/rest_v1/page/definitions/${encodeURIComponent(key)}`;
  const fetchPromise = fetch(url, { headers: { Accept: 'application/json' } })
    .then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const fr = (data.fr || data.definitions || []).find(entry => entry.language === 'fr') || data.fr || null;
      if (!fr || !fr.definitions?.length) throw new Error('No French definition');
      return {
        word: data.title || word,
        partOfSpeech: fr.partOfSpeech || '',
        pronunciation: fr.pronunciations?.[0]?.text || data.pronunciations?.[0]?.text || '',
        definitions: fr.definitions.slice(0, 4).map(d => d.definition || d).filter(Boolean)
      };
    });
  const fallback = Promise.all([
    fetch(`https://fr.wiktionary.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(key)}&format=json&origin=*`).then(r => r.json()).catch(() => null),
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`).catch(() => null)
  ]).then(([wk, en]) => {
    const extract = wk?.query?.pages && Object.values(wk.query.pages)[0]?.extract;
    if (extract) return { word, partOfSpeech: '', pronunciation: '', definitions: [extract.replace(/<[^>]+>/g, ' ').slice(0, 360)] };
    throw new Error('No definition found');
  });
  const promise = fetchPromise.catch(() => fallback);
  dictionaryCache.set(key, promise);
  return promise;
}

let activeDictionary = null;

function openDictionary(target, word) {
  closeDictionary();
  const trimmed = String(word || '').trim();
  if (!trimmed) return;
  const rect = target.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'dictionary-popover';
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
  pop.style.left = `${Math.min(window.innerWidth - 360, rect.left + window.scrollX)}px`;
  pop.innerHTML = `<button class="close" type="button" aria-label="Close">×</button><h4>${escapeHtml(trimmed)}</h4><div class="loading">Looking up definition…</div>`;
  document.body.appendChild(pop);
  activeDictionary = pop;
  pop.querySelector('.close').addEventListener('click', closeDictionary);
  setTimeout(() => {
    document.addEventListener('click', outsideClickHandler, { once: true });
  }, 0);
  lookupWord(trimmed).then(result => {
    if (activeDictionary !== pop) return;
    pop.innerHTML = `
      <button class="close" type="button" aria-label="Close">×</button>
      <h4>${escapeHtml(result.word)} <span class="pos">${escapeHtml(result.partOfSpeech || '')}</span></h4>
      ${result.pronunciation ? `<div class="pronunciation">[${escapeHtml(result.pronunciation)}]</div>` : ''}
      <ol>${result.definitions.map(def => `<li>${escapeHtml(def.replace(/<[^>]+>/g, ' ').slice(0, 320))}</li>`).join('')}</ol>
      <div class="source">
        <button class="icon-action" type="button" data-speak="${escapeHtml(trimmed)}">🔊 Pronounce</button>
        <a href="https://youglish.com/pronounce/${encodeURIComponent(trimmed)}/french" target="_blank" rel="noopener">Youglish (French)</a>
        <a href="https://forvo.com/word/${encodeURIComponent(trimmed)}/#fr" target="_blank" rel="noopener">Forvo</a>
        <a href="https://fr.wiktionary.org/wiki/${encodeURIComponent(trimmed)}" target="_blank" rel="noopener">Wiktionary</a>
      </div>`;
    pop.querySelector('.close').addEventListener('click', closeDictionary);
    pop.querySelector('[data-speak]').addEventListener('click', event => speak(trimmed, event.currentTarget));
  }).catch(error => {
    if (activeDictionary !== pop) return;
    pop.innerHTML = `<button class="close" type="button" aria-label="Close">×</button>
      <h4>${escapeHtml(trimmed)}</h4>
      <div class="error">Definition not available offline. Try one of the external sources:</div>
      <div class="source">
        <button class="icon-action" type="button" data-speak="${escapeHtml(trimmed)}">🔊 Pronounce</button>
        <a href="https://youglish.com/pronounce/${encodeURIComponent(trimmed)}/french" target="_blank" rel="noopener">Youglish (French)</a>
        <a href="https://forvo.com/word/${encodeURIComponent(trimmed)}/#fr" target="_blank" rel="noopener">Forvo</a>
        <a href="https://fr.wiktionary.org/wiki/${encodeURIComponent(trimmed)}" target="_blank" rel="noopener">Wiktionary</a>
      </div>`;
    pop.querySelector('.close').addEventListener('click', closeDictionary);
    pop.querySelector('[data-speak]').addEventListener('click', event => speak(trimmed, event.currentTarget));
  });
}

function outsideClickHandler(event) {
  if (activeDictionary && !activeDictionary.contains(event.target)) closeDictionary();
}

function closeDictionary() {
  if (activeDictionary) { activeDictionary.remove(); activeDictionary = null; }
}

/* ------------------- Toast notifications ------------------- */

let toastTimeout = null;
function showToast(message, kind = 'success') {
  closeToast();
  const tpl = $('toast-template').content.firstElementChild.cloneNode(true);
  tpl.textContent = message;
  tpl.classList.add(kind);
  document.body.appendChild(tpl);
  toastTimeout = setTimeout(() => { tpl.remove(); }, 2600);
}
function closeToast() {
  document.querySelectorAll('.toast').forEach(node => node.remove());
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = null;
}

function renderDashboard() {
  const analytics = state.analytics;
  const progressMap = allProgress();
  const activity = getActivity();
  const streak = streakStats(activity);
  const wordList = getWordList();
  const now = Date.now();
  const wordListDue = wordList.filter(word => spacedRepetitionBucket(word, now) === 'due').length;
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
  <div class="metric-grid">${metricCard('🔥', 'Current streak', `${streak.current} day${streak.current === 1 ? '' : 's'}`, `Longest: ${streak.longest} days`)}${metricCard('📚', 'Vocabulary learned', `${learnedWords.length}/${totals.vocabulary}`, `${percent(learnedWords.length, totals.vocabulary)}% of added vocabulary`)}${metricCard('🧩', 'Grammar learned', `${learnedGrammar.length}/${totals.grammar}`, `${percent(learnedGrammar.length, totals.grammar)}% of added patterns`)}${metricCard('🗒️', 'My word list', `${wordList.length} words`, `${wordListDue} due for review`)}</div>
  <section class="dashboard-card activity-card"><div class="card-heading"><div><span class="kicker">365 jours</span><h3>Learning activity</h3></div><span>${Object.values(activity).reduce((sum, entry) => sum + activityCount(entry), 0)} actions</span></div><div class="activity-scroll"><div class="activity-grid">${activityGrid(activity)}</div></div><div class="activity-legend"><span>Less</span>${[0,1,2,3,4].map(level => `<i class="activity-cell level-${level}"></i>`).join('')}<span>More</span></div></section>
  <section class="dashboard-card wordlist-card"><div class="card-heading"><div><span class="kicker">Mon carnet</span><h3>My word list snapshot</h3></div><a class="button paper" href="#view=review" id="dashboard-review-link">Review due →</a></div><div class="snapshot-grid"><span><b>${wordList.length}</b> total words</span><span><b>${wordListDue}</b> due now</span><span><b>${wordList.filter(w => spacedRepetitionBucket(w, now) === 'fresh').length}</b> new</span><span><b>${wordList.filter(w => spacedRepetitionBucket(w, now) === 'later').length}</b> mastered</span></div><p class="source-note">Use the <a href="#view=wordlist">word list</a> to add vocabulary from any lesson or paste your own. The review queue reschedules each card based on how confidently you recalled it.</p></section>
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
  const payload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    progress: Object.fromEntries(state.manifest.lessons.map(lesson => [lesson.slug, getProgress(lesson.slug)])),
    activity: getActivity(),
    frequencyKnown: getFrequencyKnown(),
    wordlist: getWordList()
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `atelier-progress-${localDateKey()}.json`; link.click(); URL.revokeObjectURL(link.href);
}

async function importProgress(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.schemaVersion > 2 || typeof payload.progress !== 'object') throw new Error('This is not an Atelier progress export.');
    state.manifest.lessons.forEach(lesson => { if (payload.progress[lesson.slug]) localStorage.setItem(progressKey(lesson.slug), JSON.stringify({ ...emptyProgress(), ...payload.progress[lesson.slug] })); });
    if (payload.activity && typeof payload.activity === 'object') localStorage.setItem(ACTIVITY_KEY, JSON.stringify(payload.activity));
    if (Array.isArray(payload.frequencyKnown)) localStorage.setItem(FREQUENCY_KEY, JSON.stringify(payload.frequencyKnown.map(normalizeFrench)));
    if (Array.isArray(payload.wordlist)) saveWordList(payload.wordlist);
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
$('dashboard-button').addEventListener('click', () => { location.hash = 'view=dashboard'; });
$('wordlist-button').addEventListener('click', () => { location.hash = 'view=wordlist'; });
$('review-button').addEventListener('click', () => { location.hash = 'view=review'; });
$('theme-button').addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('atelier-theme', next); $('theme-button').textContent = next === 'dark' ? '☀' : '☾'; });
$('reset-lesson').addEventListener('click', () => { localStorage.removeItem(progressKey()); state.cardIndex = 0; state.cardRevealed = false; updateProgress(); renderActiveTab(); });
$('retry-button').addEventListener('click', loadManifest);
window.addEventListener('hashchange', async () => {
  if (!state.manifest) return;
  const route = readRoute();
  if (route.view === 'dashboard') { showDashboard(); return; }
  if (route.view === 'wordlist') { showWordList(); return; }
  if (route.view === 'review') { showReview(); return; }
  if (route.wordlistFilter) state.wordlistFilter = route.wordlistFilter;
  if (route.reviewFilter) state.reviewFilter = route.reviewFilter;
  const item = state.manifest.lessons.find(lesson => lesson.slug === route.slug) || state.selected || state.manifest.lessons[0];
  if (!item) return;
  if (item.slug !== state.selected?.slug || $('lesson-view').hidden) await loadLesson(item, route.tab);
  else if (route.tab && availableTabs().some(tab => tab.id === route.tab)) { state.activeTab = route.tab; renderTabs(); renderActiveTab(); }
});

/* ------------------- Service worker & PWA install ------------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Try root scope first (controls entire /French/ site), fallback to assets scope
    const rootSw = new URL('../sw.js', import.meta.url);
    navigator.serviceWorker.register(rootSw, { scope: new URL('..', import.meta.url).pathname }).catch(() => {
      navigator.serviceWorker.register(new URL('sw.js', import.meta.url)).catch(error => console.warn('Service worker registration failed:', error));
    });
  });
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.installEvent = event;
  const btn = $('install-button');
  if (btn) btn.hidden = false;
});

const installButton = $('install-button');
if (installButton) {
  installButton.addEventListener('click', async () => {
    if (!state.installEvent) return;
    state.installEvent.prompt();
    await state.installEvent.userChoice;
    state.installEvent = null;
    installButton.hidden = true;
  });
}

window.addEventListener('appinstalled', () => {
  const btn = $('install-button');
  if (btn) btn.hidden = true;
  showToast('Installed! Open it from your home screen.', 'success');
});

document.addEventListener('click', event => {
  const link = event.target.closest('[data-lookup]');
  if (link) { event.preventDefault(); openDictionary(link, link.dataset.lookup); }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeDictionary();
});

// iOS standalone detection — adds minimal app chrome
function updateStandalone() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || new URLSearchParams(location.search).has('standalone');
  document.documentElement.classList.toggle('is-standalone', isStandalone);
  const tabbar = $('ios-tabbar');
  if (tabbar) tabbar.hidden = !isStandalone;
  updateIosTab();
}
function updateIosTab() {
  const view = readRoute().view;
  document.querySelectorAll('.ios-tab').forEach(btn => {
    const tab = btn.dataset.iosTab;
    const active = (tab === 'lessons' && view === 'lesson') || tab === view;
    btn.classList.toggle('active', active);
  });
}
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateStandalone);
document.querySelectorAll('.ios-tab').forEach(btn => btn.addEventListener('click', () => {
  const tab = btn.dataset.iosTab;
  if (tab === 'lessons') {
    if (state.manifest?.lessons?.[0]) location.hash = new URLSearchParams({ lesson: state.manifest.lessons[0].slug }).toString();
    else location.hash = '';
    // on mobile, open library as lesson picker
    if (window.innerWidth <= 760) { $('library-panel')?.classList.add('open'); $('mobile-library-button')?.setAttribute('aria-expanded', 'true'); }
  } else location.hash = `view=${tab}`;
}));
window.addEventListener('hashchange', updateIosTab);

initTheme();
updateStandalone();
loadManifest();
