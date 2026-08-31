const FRONTMATTER = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map(item => unquote(item)).filter(Boolean);
  }
  return unquote(trimmed);
}

export function parseFrontmatter(markdown) {
  const match = markdown.match(FRONTMATTER);
  if (!match) return { attributes: {}, body: markdown };
  const attributes = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    attributes[key] = parseScalar(value);
  }
  return { attributes, body: markdown.slice(match[0].length) };
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function safeUrl(value = '') {
  const url = value.trim();
  if (/^(https?:|mailto:|#|\.\.?\/)/i.test(url)) return escapeHtml(url);
  return '#';
}

export function inlineMarkdown(value = '') {
  let output = escapeHtml(value);
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noopener">${label}</a>`);
  return output;
}

function splitTableRow(line) {
  const clean = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let index = 0; index < clean.length; index += 1) {
    if (clean[index] === '\\' && clean[index + 1] === '|') { cell += '|'; index += 1; }
    else if (clean[index] === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += clean[index];
  }
  cells.push(cell.trim());
  return cells;
}

export function parseTable(markdown = '') {
  const lines = markdown.split(/\r?\n/);
  let start = lines.findIndex((line, index) => line.trim().startsWith('|') && lines[index + 1]?.trim().startsWith('|'));
  if (start === -1) return { headers: [], rows: [] };
  const tableLines = [];
  for (let index = start; index < lines.length && lines[index].trim().startsWith('|'); index += 1) tableLines.push(lines[index]);
  if (tableLines.length < 2) return { headers: [], rows: [] };
  const headers = splitTableRow(tableLines[0]);
  const rows = tableLines.slice(2).map(splitTableRow).filter(row => row.some(Boolean));
  return { headers, rows };
}

function tableToObjects(table) {
  return table.rows.map(row => Object.fromEntries(table.headers.map((header, index) => [header.trim().toLowerCase(), row[index] || ''])));
}

export function splitSections(body = '') {
  const matches = [...body.matchAll(/^#\s+(.+)$/gm)];
  if (!matches.length) return [{ title: 'Overview', body: body.trim() }];
  const sections = [];
  const preface = body.slice(0, matches[0].index).trim();
  if (preface) sections.push({ title: 'Overview', body: preface });
  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    sections.push({ title: match[1].trim(), body: body.slice(start, end).trim() });
  });
  return sections;
}

export function splitSubsections(body = '') {
  const matches = [...body.matchAll(/^##\s+(.+)$/gm)];
  if (!matches.length) return body.trim() ? [{ title: 'Key idea', body: body.trim() }] : [];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    return { title: match[1].trim(), body: body.slice(start, end).trim() };
  });
}

function tableToHtml(lines) {
  const table = parseTable(lines.join('\n'));
  if (!table.headers.length) return '';
  const head = table.headers.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('');
  const rows = table.rows.map(row => `<tr>${row.map(cell => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('');
  return `<div class="rich-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function markdownToHtml(markdown = '') {
  const lines = markdown.trim().split(/\r?\n/);
  const output = [];
  let paragraph = [];
  let listType = null;
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); closeList(); continue; }
    if (trimmed.startsWith('|') && lines[index + 1]?.trim().startsWith('|')) {
      flushParagraph(); closeList();
      const block = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) { block.push(lines[index]); index += 1; }
      index -= 1;
      output.push(tableToHtml(block));
      continue;
    }
    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const desired = unordered ? 'ul' : 'ol';
      if (listType !== desired) { closeList(); output.push(`<${desired}>`); listType = desired; }
      output.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }
    if (trimmed.startsWith('> ')) { flushParagraph(); closeList(); output.push(`<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`); continue; }
    paragraph.push(trimmed);
  }
  flushParagraph(); closeList();
  return output.join('\n');
}

function normalize(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseLesson(markdown) {
  const { attributes, body } = parseFrontmatter(markdown);
  const sections = splitSections(body);
  const byName = new Map(sections.map(section => [normalize(section.title), section]));
  const get = name => byName.get(normalize(name))?.body || '';
  const known = new Set(['overview', 'transcript', 'grammar', 'vocabulary', 'collocations', 'important notes', 'flashcards', 'exam guide', 'exam practice']);
  const grammar = splitSubsections(get('grammar')).map(item => ({ title: item.title, html: markdownToHtml(item.body) }));
  const transcript = tableToObjects(parseTable(get('transcript')));
  const vocabulary = tableToObjects(parseTable(get('vocabulary')));
  const collocations = tableToObjects(parseTable(get('collocations')));
  const flashcards = tableToObjects(parseTable(get('flashcards')));
  const exam = tableToObjects(parseTable(get('exam practice')));
  const extras = sections.filter(section => !known.has(normalize(section.title))).map(section => ({ title: section.title, html: markdownToHtml(section.body) }));
  return {
    metadata: attributes,
    overview: markdownToHtml(get('overview')),
    transcript,
    grammar,
    vocabulary,
    collocations,
    notes: markdownToHtml(get('important notes')),
    flashcards,
    examGuide: markdownToHtml(get('exam guide')),
    exam,
    extras
  };
}
