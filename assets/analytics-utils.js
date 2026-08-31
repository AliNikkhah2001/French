const APOSTROPHE_PREFIXES = new Set(["c", "d", "j", "l", "m", "n", "qu", "s", "t"]);

export function stripMarkdown(value = '') {
  return String(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

export function normalizeFrench(value = '') {
  return stripMarkdown(value)
    .toLocaleLowerCase('fr')
    .replace(/[’‘‛`´]/g, "'")
    .normalize('NFC')
    .trim();
}

export function tokenizeFrench(value = '') {
  const normalized = normalizeFrench(value);
  const matches = normalized.match(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)*/gu) || [];
  return matches.flatMap(token => {
    const apostrophe = token.indexOf("'");
    if (apostrophe < 1) return [token];
    const prefix = token.slice(0, apostrophe);
    const remainder = token.slice(apostrophe + 1);
    return APOSTROPHE_PREFIXES.has(prefix) && remainder ? [`${prefix}'`, remainder] : [token];
  });
}

export function uniqueFrenchTokens(value = '') {
  return [...new Set(tokenizeFrench(value))];
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
