import { escapeHtml, inlineMarkdown, parseLesson } from './content-parser.js';

const state = {
  manifest: null,
  type: 'all',
  search: '',
  selected: null,
  lesson: null,
  activeTab: null,
  wordType: 'all',
  cardIndex: 0,
  cardRevealed: false
};

const $ = id => document.getElementById(id);
const titleCase = value => String(value || '').replace(/\b\w/g, letter => letter.toUpperCase());
const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function externalUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function readRoute() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  return { slug: params.get('lesson'), tab: params.get('tab') };
}

function replaceRoute(slug, tab) {
  const params = new URLSearchParams({ lesson: slug, tab });
  history.replaceState(null, '', `${location.pathname}${location.search}#${params}`);
}

function progressKey() {
  return `atelier-progress:${state.selected?.slug || 'unknown'}`;
}

function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressKey())) || { revealed: [], known: [], quizAttempted: false, quizScore: 0 };
  } catch {
    return { revealed: [], known: [], quizAttempted: false, quizScore: 0 };
  }
}

function setProgress(progress) {
  localStorage.setItem(progressKey(), JSON.stringify(progress));
  updateProgress();
}

function updateProgress() {
  if (!state.lesson) return;
  const progress = getProgress();
  const total = state.lesson.transcript.length + state.lesson.flashcards.length + state.lesson.exam.length;
  const completed = progress.revealed.length + progress.known.length + (progress.quizAttempted ? state.lesson.exam.length : 0);
  const percent = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
  $('progress-value').textContent = `${percent}%`;
  $('progress-fill').style.width = `${percent}%`;
}

async function loadManifest() {
  showLoading();
  try {
    const response = await fetch('./content/index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Content manifest returned ${response.status}.`);
    state.manifest = await response.json();
    renderTypeFilters();
    renderLibrary();
    const route = readRoute();
    const selected = state.manifest.lessons.find(item => item.slug === route.slug) || state.manifest.lessons[0];
    await loadLesson(selected, route.tab);
  } catch (error) {
    showError(`${error.message} Run “npm run build” and serve the dist folder through a local web server.`);
  }
}

function showLoading() {
  $('loading-state').hidden = false;
  $('error-state').hidden = true;
  $('lesson-view').hidden = true;
}

function showError(message) {
  $('loading-state').hidden = true;
  $('lesson-view').hidden = true;
  $('error-state').hidden = false;
  $('error-message').textContent = message;
}

function showLesson() {
  $('loading-state').hidden = true;
  $('error-state').hidden = true;
  $('lesson-view').hidden = false;
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
    return `<button class="lesson-card ${item.slug === state.selected?.slug ? 'active' : ''}" type="button" data-slug="${escapeHtml(item.slug)}"><span class="lesson-card-emoji">${escapeHtml(item.emoji)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(detail)}</small></span><span class="lesson-arrow">›</span></button>`;
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
    const response = await fetch(`./${item.path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Lesson returned ${response.status}.`);
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
    renderLibrary();
    updateProgress();
    replaceRoute(item.slug, state.activeTab);
    showLesson();
    document.title = `${item.title} · Le Petit Atelier Français`;
  } catch (error) {
    showError(`${error.message} Check the lesson path and rebuild the content manifest.`);
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
  $('source-actions').innerHTML = [
    source ? `<a class="button blue" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open original source ↗</a>` : '',
    apple ? `<a class="button paper" href="${escapeHtml(apple)}" target="_blank" rel="noopener">Apple Podcasts ↗</a>` : ''
  ].join('');
  renderAudio(metadata);
}

function renderAudio(metadata) {
  const embed = externalUrl(metadata.audio_embed);
  const audio = externalUrl(metadata.audio_url);
  const section = $('audio-section');
  if (!embed && !audio) {
    section.hidden = true;
    $('audio-player').innerHTML = '';
    return;
  }
  section.hidden = false;
  $('audio-player').innerHTML = embed
    ? `<iframe title="Embedded audio player" src="${escapeHtml(embed)}" loading="lazy" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>`
    : `<audio controls preload="metadata" src="${escapeHtml(audio)}">Your browser does not support the audio element.</audio>`;
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
    renderTabs();
    renderActiveTab();
    replaceRoute(state.selected.slug, state.activeTab);
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
  $('reveal-all').addEventListener('click', () => { const next = getProgress(); next.revealed = state.lesson.transcript.map((_, index) => index); setProgress(next); renderTranscript(query); });
  $('hide-all').addEventListener('click', () => { const next = getProgress(); next.revealed = []; setProgress(next); renderTranscript(query); });
  $('tab-panel').querySelectorAll('[data-reveal-line]').forEach(button => button.addEventListener('click', () => toggleTranslation(Number(button.dataset.revealLine), query)));
}

function transcriptCard(line, index, revealed) {
  return `<article class="transcript-card"><div class="transcript-french"><span class="line-number">${String(index + 1).padStart(2, '0')}</span><div class="french-line">${inlineMarkdown(line.french || '')}</div><button class="translation-button" type="button" data-reveal-line="${index}" aria-expanded="${revealed}">${revealed ? 'Hide English' : 'Reveal English'}</button></div><div class="transcript-english" ${revealed ? '' : 'hidden'}><p>${inlineMarkdown(line.english || '')}</p>${line.notes ? `<span class="transcript-note">💡 ${inlineMarkdown(line.notes)}</span>` : ''}</div></article>`;
}

function toggleTranslation(index, query) {
  const progress = getProgress();
  progress.revealed = progress.revealed.includes(index) ? progress.revealed.filter(value => value !== index) : [...progress.revealed, index];
  setProgress(progress);
  renderTranscript(query);
}

function renderGrammar() {
  $('tab-panel').innerHTML = `${sectionHeading('Le laboratoire', 'Grammar you can reuse', 'Open one card, make your own sentence, then continue.', `${state.lesson.grammar.length} patterns`)}<div class="grammar-list">${state.lesson.grammar.map((item, index) => `<details class="grammar-card" ${index === 0 ? 'open' : ''}><summary>${escapeHtml(item.title)}</summary><div class="rich-copy">${item.html}</div></details>`).join('')}</div>`;
}

function vocabularyTypes() {
  return ['all', ...new Set(state.lesson.vocabulary.map(word => normalize(word.type || 'other')).filter(Boolean))];
}

function renderVocabulary(query = '') {
  const q = normalize(query);
  const words = state.lesson.vocabulary.filter(word => (state.wordType === 'all' || normalize(word.type) === state.wordType) && (!q || normalize(Object.values(word).join(' ')).includes(q)));
  $('tab-panel').innerHTML = `${sectionHeading('Le panier de mots', 'Vocabulary market', 'Search, filter, and learn nouns with their gender.', `${words.length} shown`)}<div class="word-controls"><label class="compact-search"><span>⌕</span><input id="word-search" type="search" value="${escapeHtml(query)}" placeholder="Search French or English…"></label><div class="word-filter-row">${vocabularyTypes().map(type => `<button class="word-filter ${type === state.wordType ? 'active' : ''}" type="button" data-word-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join('')}</div></div><table class="vocabulary-table"><thead><tr><th>French</th><th>English</th><th>Type</th><th>Note</th></tr></thead><tbody>${words.map(word => `<tr><td>${inlineMarkdown(word.french || '')}</td><td>${inlineMarkdown(word.english || '')}</td><td>${inlineMarkdown(word.type || '')}</td><td>${inlineMarkdown(word.note || '')}</td></tr>`).join('')}</tbody></table>`;
  $('word-search').addEventListener('input', event => renderVocabulary(event.target.value));
  $('tab-panel').querySelectorAll('[data-word-type]').forEach(button => button.addEventListener('click', () => { state.wordType = button.dataset.wordType; renderVocabulary(query); }));
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
  state.cardRevealed = false;
  renderFlashcards();
}

function markCardKnown() {
  const progress = getProgress();
  progress.known = progress.known.includes(state.cardIndex) ? progress.known.filter(index => index !== state.cardIndex) : [...progress.known, state.cardIndex];
  setProgress(progress);
  renderFlashcards();
}

function renderExam() {
  const lesson = state.lesson;
  const progress = getProgress();
  const guide = lesson.examGuide ? `<div class="rich-copy">${lesson.examGuide}</div>` : '';
  const quiz = lesson.exam.length ? `<form class="quiz-form" id="quiz-form">${lesson.exam.map((question, index) => quizQuestion(question, index)).join('')}</form><div class="quiz-footer"><button class="button blue" id="check-quiz" type="button">Check my answers</button><button class="button paper" id="clear-quiz" type="button">Clear</button><span class="quiz-score" id="quiz-score">${progress.quizAttempted ? `Last score: ${progress.quizScore}/${lesson.exam.length}` : ''}</span></div>` : '';
  $('tab-panel').innerHTML = `${sectionHeading('Mode examen', 'Exam practice', 'Use the lesson first. Then answer from memory without opening another tab.', lesson.exam.length ? `${lesson.exam.length} questions` : '')}${guide}${quiz}`;
  if (lesson.exam.length) {
    $('check-quiz').addEventListener('click', checkQuiz);
    $('clear-quiz').addEventListener('click', renderExam);
  }
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
    element.classList.remove('correct', 'incorrect');
    element.classList.add(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) score += 1;
    const feedback = element.querySelector('.question-feedback');
    feedback.hidden = false;
    const explanation = state.lesson.exam[index].explanation || '';
    feedback.innerHTML = `${isCorrect ? '✓ Correct.' : `Not quite. The answer is ${escapeHtml(correct)}.`} ${inlineMarkdown(explanation)}`;
  });
  const progress = getProgress();
  progress.quizAttempted = true;
  progress.quizScore = score;
  setProgress(progress);
  $('quiz-score').textContent = `Score: ${score}/${state.lesson.exam.length}`;
}

function renderExtra(index) {
  const extra = state.lesson.extras[index];
  if (!extra) return;
  $('tab-panel').innerHTML = `${sectionHeading('Lecture', extra.title, 'Additional lesson notes.')}<div class="rich-copy">${extra.html}</div>`;
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
$('mobile-library-button').addEventListener('click', () => {
  const open = $('library-panel').classList.toggle('open');
  $('mobile-library-button').setAttribute('aria-expanded', String(open));
});
$('theme-button').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('atelier-theme', next);
  $('theme-button').textContent = next === 'dark' ? '☀' : '☾';
});
$('reset-lesson').addEventListener('click', () => {
  localStorage.removeItem(progressKey());
  state.cardIndex = 0;
  state.cardRevealed = false;
  updateProgress();
  renderActiveTab();
});
$('retry-button').addEventListener('click', loadManifest);
window.addEventListener('hashchange', async () => {
  if (!state.manifest) return;
  const route = readRoute();
  const item = state.manifest.lessons.find(lesson => lesson.slug === route.slug);
  if (item && item.slug !== state.selected?.slug) await loadLesson(item, route.tab);
  else if (route.tab && availableTabs().some(tab => tab.id === route.tab)) { state.activeTab = route.tab; renderTabs(); renderActiveTab(); }
});

initTheme();
loadManifest();
