import { writeFile, mkdir, readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = new URL('.', import.meta.url).pathname.slice(0, -1).replace(/\/scripts$/, '');
const CONTENT_DIR = resolve(__dirname, '..', 'content');
const BASE_URL = 'https://www.frenchlearner.com';

async function fetchHTML(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FrenchLearnerBot/1.0)' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function getSongList() {
  const html = await fetchHTML('https://www.frenchlearner.com/songs');
  const urls = new Set();
  const linkRegex = /href="(https:\/\/www\.frenchlearner\.com\/songs\/[^"]+)"/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    if (url.includes('/songs/') && !url.endsWith('/songs') && !url.includes('?') && !url.includes('#')) {
      const pathParts = url.split('/');
      const lastPart = url.split('/').pop();
      if (lastPart && lastPart !== 'songs' && lastPart.includes('-')) {
        urls.add(url);
      }
    }
  }
  return Array.from(urls);
}

async function fetchSongPage(url) {
  try {
    const html = await fetchHTML(url);
    
    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const cleanTitle = title
      .replace(/Lyrics\s*(?:&.*?)?(Translation|Translation|Meaning)/gi, '')
      .replace(/Lyrics\s*(?:&.*?)?(Translation|Translation|Meaning)/gi, '')
      .replace(/Lyrics\s*(?:&.*?)?(Translation|Translation|Meaning)/gi, '')
      .replace(/Lyrics\s*(?:&.*?)?(Translation|Translation|Meaning)/gi, '')
      .trim();
    
    // Extract main content
    const contentMatch = html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/);
    const content = contentMatch ? contentMatch[1] : '';
    
    // Extract French/English lyrics
    let frenchText = '', englishText = '';
    const lyricsSection = content.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/);
    if (lyricsSection) {
      const paras = lyricsSection[1].match(/<p>\s*(?:<strong[^>]*>([^<]+)<\/strong>\s*:\s*)?(.*?)<\/p>/g) || [];
      let lastEn = '';
      for (const p of paras) {
        const text = p.replace(/<[^>]+>/g, ' ').replace(/<[^>]+>/g, '').trim();
        if (!text) continue;
        const isFrench = text.match(/[àâäéèêëîïôöùûüÿçœæ]/i) && !/^[A-Z][a-z]/.test(text);
        if (text.match(/^[A-Z][a-z]+:/)) {
          // Speaker label
        } else if (/^[a-z]/.test(text)) {
          // French text
        }
      }
    }
    
    return { title: title || '', url, content: content.substring(0, 5000) };
  } catch (e) {
    console.error(`Error fetching ${url}:`, e.message);
    return null;
  }
}

async function main() {
  console.log('Fetching song list from FrenchLearner.com...');
  const urls = await getSongList();
  console.log(`Found ${urls.length} song URLs`);
  
  // Process first 15 for testing
  for (const url of urls.slice(0, 15)) {
    console.log(`Processing: ${url}`);
    const song = await fetchSongPage(url);
    if (song) {
      console.log(`  Title: ${song.title}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);