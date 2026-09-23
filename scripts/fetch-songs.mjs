import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const BASE_URL = 'https://www.frenchlearner.com';
const CONTENT_DIR = 'content';

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FrenchLearnerBot/1.0)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main() {
  console.log('Fetching song list from FrenchLearner.com...');
  
  // Get the main songs page
  const html = await fetch('https://www.frenchlearner.com/songs').then(r => r.text());
  
  // Extract all song URLs
  const urlSet = new Set();
  const linkRegex = /href="(https:\/\/www\.frenchlearner\.com\/songs\/[^"]+)"/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    if (url.includes('/songs/') && !url.endsWith('/songs') && !url.includes('?') && !url.includes('#')) {
      // Only keep song pages, not category pages
      const pathParts = match[1].split('/');
      if (pathParts.length >= 5) { // https://www.frenchlearner.com/songs/song-name
        const slug = pathParts[pathParts.length - 1];
        if (slug && slug !== 'songs') {
          // Only add if it looks like a song page (has dashes, not just category)
          urls.add(url);
        }
      }
    }
  }
  
  console.log(`Found ${urls.size} unique song URLs`);
  
  // Process first 20 songs for testing
  const urls = Array.from(urls).slice(0, 20);
  
  for (const url of urls) {
    console.log(`Processing: ${url}`);
    try {
      const html = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
      const $ = cheerio.load(html);
      
      // Extract title
      const title = $('h1').first().text().trim() || $('title').text().trim();
      const cleanTitle = title.replace(/Lyrics.*?(Translation|Translation|Meaning)/i, '').replace(/Lyrics.*?(Translation|Translation|Meaning)/i, '').trim();
      
      // Extract content
      const content = $('.entry-content, .post-content, .post-body, main article, .entry-content').first();
      let content = '';
      if (content.length) {
        content = content.html();
      }
      
      // Extract French/English lyrics
      let frenchText = '', englishText = '';
      const lyricsSection = $('.entry-content, .post-content, .post-body, .song-lyrics, .lyrics').first();
      if (lyricsSection.length) {
        const text = lyricsSection.text();
        // Simple extraction - look for French/English pairs
        // This is a simplified extraction
      }
      
      console.log(`Processed: ${url} - ${title}`);
      
    } catch (e) {
      console.error(`Error processing ${url}:`, e.message);
    }
  }
}

main().catch(console.error);