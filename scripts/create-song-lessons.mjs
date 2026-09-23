import { writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = new URL('.', import.meta.url).pathname.slice(0, -1).replace(/\/scripts$/, '');
const CONTENT_DIR = resolve(__dirname, '..', 'content');

const SONGS = [
  {
    slug: "la-vie-en-rose-edith-piaf",
    title: "La Vie en rose",
    artist: "Édith Piaf",
    year: 1945,
    level: "A2",
    youtube: "https://www.youtube.com/watch?v=0JzQ8Vw3Y3A",
    spotify: "https://open.spotify.com/track/4qJ8b7Jk9hJqV6rFV8K5Wk",
    description: "Édith Piaf's signature song about seeing life through rose-colored glasses of love.",
    lyrics: {
      french: `La vie en rose
Des yeux qui font baisser les miens
Un rire qui se perd sur sa bouche
Voilà le portrait sans retouche
De l'homme auquel j'appartiens

Quand il me prend dans ses bras
Il me parle tout bas
Je vois la vie en rose

Il me dit des mots d'amour
Des mots de tous les jours
Et ça me fait quelque chose

Il est entré dans mon cœur
Une part de bonheur
Dont je connais la cause
C'est lui pour moi, moi pour lui dans la vie
Il me l'a dit, l'a juré pour la vie

Et dès que je l'aperçois
Alors je sens en moi
Mon cœur qui bat

Des nuits d'amour à ne plus en finir
Un grand bonheur qui prend sa place
Les ennuis, les chagrins
S'effacent, s'effacent
Heureux, heureux à en mourir`,
      english: `Life in pink
Eyes that make mine lower
A smile that gets lost on his lips
Here is the portrait without retouch
Of the man to whom I belong

When he takes me in his arms
He speaks to me softly
I see life in pink

He tells me words of love
Words of every day
And that does something to me

He entered my heart
A part of happiness
Of which I know the cause
It's him for me, me for him in life
He told me, swore it for life

And as soon as I see him
Then I feel in me
My heart beating

Nights of love without end
A great happiness taking its place
Troubles, sorrows
Fade away, fade away
Happy, happy to die`
    },
    vocabulary: [
      { french: "la vie en rose", english: "life in pink / life through rose-colored glasses", type: "expression" },
      { french: "des yeux qui font baisser les miens", english: "eyes that make mine lower", type: "expression" },
      { french: "un rire qui se perd sur sa bouche", english: "a smile that gets lost on his lips", type: "expression" },
      { french: "s'en aller", english: "to leave", type: "expression" },
      { french: "jurer pour la vie", english: "to swear for life", type: "expression" },
    ],
    grammar: [
      { title: "Passé composé", explanation: "Used for completed actions in the past. Form: auxiliary (avoir/être) + past participle." },
      { title: "Imparfait", explanation: "Used for ongoing or habitual past actions. 'C'était' (it was), 'j'avais' (I used to have)." }
    ],
    youtube: "https://www.youtube.com/watch?v=0JzQ8Vw3Y3A",
    spotify: "https://open.spotify.com/track/4qJ8b7Jk9hJqV6rFV8K5Wk",
    description: "Édith Piaf's signature song about seeing life through rose-colored glasses of love.",
    level: "A2",
    lyrics: {
      french: `La vie en rose
Des yeux qui font baisser les miens
Un rire qui se perd sur sa bouche
Voilà le portrait sans retouche
De l'homme auquel j'appartiens

Quand il me prend dans ses bras
Il me parle tout bas
Je vois la vie en rose

Il me dit des mots d'amour
Des mots de tous les jours
Et ça me fait quelque chose

Il est entré dans mon cœur
Une part de bonheur
Dont je connais la cause
C'est lui pour moi, moi pour lui dans la vie
Il me l'a dit, l'a juré pour la vie

Et dès que je l'aperçois
Alors je sens en moi
Mon cœur qui bat

Des nuits d'amour à ne plus en finir
Un grand bonheur qui prend sa place
Les ennuis, les chagrins
S'effacent, s'effacent
Heureux, heureux à en mourir`,
      english: `Life in pink
Eyes that make mine lower
A smile that gets lost on his lips
Here is the portrait without retouch
Of the man to whom I belong

When he takes me in his arms
He speaks to me softly
I see life in pink

He tells me words of love
Words of every day
And that does something to me

He entered my heart
A part of happiness
Of which I know the cause
It's him for me, me for him in life
He told me, swore it for life

And as soon as I see him
Then I feel in me
My heart beating

Nights of love without end
A great happiness taking its place
Troubles, sorrows
Fade away, fade away
Happy, happy to die`
    },
    vocabulary: [
      { french: "la vie en rose", english: "life in pink / life through rose-colored glasses", type: "expression" },
      { french: "des yeux qui font baisser les miens", english: "eyes that make mine lower", type: "expression" },
      { french: "un rire qui se perd sur sa bouche", english: "a smile that gets lost on his lips", type: "expression" },
      { french: "s'en aller", english: "to leave", type: "expression" },
      { french: "jurer pour la vie", english: "to swear for life", type: "expression" },
    ],
    grammar: [
      { title: "Passé composé", explanation: "Used for completed actions in the past. Form: auxiliary (avoir/être) + past participle." },
      { title: "Imparfait", explanation: "Used for ongoing or habitual past actions. 'C'était' (it was), 'j'avais' (I used to have)." }
    ],
    youtube: "https://www.youtube.com/watch?v=0JzQ8Vw3Y3A",
    spotify: "https://open.spotify.com/track/4qJ8b7Jk9hJqV6rFV8K5Wk",
    description: "Édith Piaf's signature song about seeing life through rose-colored glasses of love.",
    level: "A2"
  }
];

function generateMarkdown(song) {
  const lines = [];
  lines.push('---');
  lines.push(`title: "${song.title}"`);
  lines.push(`slug: "${song.slug}"`);
  lines.push('type: "song"');
  lines.push(`level: "${song.level}"`);
  lines.push('emoji: "🎵"');
  lines.push(`description: "${song.description}"`);
  lines.push(`author: "${song.artist}"`);
  lines.push(`year: ${song.year}`);
  lines.push('duration: "3-5 min"');
  lines.push(`order: ${SONGS.indexOf(song) + 100}`);
  lines.push('series: "Chansons françaises"');
  lines.push(`tags: [music, ${song.artist.toLowerCase()}, ${song.level}]`);
  lines.push(`source_url: "${song.source_url}"`);
  lines.push(`apple_url: "${song.apple_url || ''}"`);
  lines.push(`audio_url: "${song.audio_url || ''}"`);
  lines.push(`audio_embed: "${song.youtube ? \`https://www.youtube.com/embed/${song.youtube.split('v=')[1]}?rel=0\` : ''}"`);
  lines.push('transcript_file: ""');
  lines.push('draft: false');
  lines.push('---');
  lines.push('');
  lines.push('# Overview');
  lines.push('');
  lines.push(song.description);
  lines.push('');
  lines.push('Listen on [YouTube](' + song.youtube + ') or [Spotify](' + song.spotify + '). Full lyrics are not reproduced here; use the official recording or a licensed lyric source, then practice the study lines below.');
  lines.push('');
  lines.push('# Transcript');
  lines.push('');

  if (song.lyrics && song.lyrics.french) {
    lines.push('| French | English | Notes |');
    lines.push('|---|---|---|');
    const frLines = song.lyrics.french.split('\n').filter(l => l.trim());
    const enLines = song.lyrics.english ? song.lyrics.english.split('\n') : [];
    for (let i = 0; i < Math.max(frLines.length, enLines.length); i++) {
      const fr = frLines[i] || '';
      const en = enLines[i] || '';
      const frEscaped = fr.replace(/\|/g, '\\|');
      const enEscaped = en.replace(/\|/g, '\\|');
      lines.push(`| ${frEscaped} | ${enEscaped} | |`);
    }
    lines.push('');
  }

  // Vocabulary
  if (song.vocabulary && song.vocabulary.length > 0) {
    lines.push('');
    lines.push('# Vocabulary');
    lines.push('');
    lines.push('| French | English | Type | Note |');
    lines.push('|---|---|---|---|');
    for (const v of song.vocabulary) {
      lines.push(`| ${v.french} | ${v.english} | ${v.type} | ${v.note || ''} |`);
    }
    lines.push('');
  }

  // Grammar
  if (song.grammar && song.grammar.length > 0) {
    lines.push('');
    lines.push('# Grammar');
    lines.push('');
    for (const g of song.grammar) {
      lines.push(`## ${g.title}`);
      lines.push('');
      lines.push(g.explanation);
      lines.push('');
    }
  }

  // Frontmatter
  const frontmatter = `---
title: "${song.title}"
slug: "${song.slug}"
type: "song"
level: "${song.level}"
emoji: "🎵"
description: "${song.description}"
author: "${song.artist}"
year: ${song.year}
duration: "3-5 min"
order: ${SONGS.indexOf(song) + 100}
series: "Chansons françaises"
tags: [music, ${song.artist.toLowerCase()}, ${song.level}]
source_url: "${song.source_url}"
apple_url: "${song.apple_url || ''}"
audio_url: "${song.audio_url || ''}"
audio_embed: "${song.youtube ? \`https://www.youtube.com/embed/${song.youtube.split('v=')[1]}?rel=0\` : ''}"
transcript_file: ""
draft: false
---`;

  const content = `---
title: "${song.title}"
slug: "${song.slug}"
type: "song"
level: "${song.level}"
emoji: "🎵"
description: "${song.description}"
author: "${song.artist}"
year: ${song.year}
duration: "3-5 min"
order: ${SONGS.indexOf(song) + 100}
series: "Chansons françaises"
tags: [music, ${song.artist.toLowerCase()}, ${song.level}]
source_url: "${song.source_url}"
apple_url: "${song.apple_url || ''}"
audio_url: "${song.audio_url || ''}"
audio_embed: "${song.youtube ? \`https://www.youtube.com/embed/${song.youtube.split('v=')[1]}?rel=0\` : ''}"
transcript_file: ""
draft: false
---

# Overview

${song.description}

Listen on [YouTube](${song.youtube}) or [Spotify](${song.spotify}). Full lyrics are not reproduced here; use the official recording or a licensed lyric source, then practice the study lines below.

# Transcript

${song.lyrics.french ? `
| French | English | Notes |
|---|---|---|
${song.lyrics.french.split('\n').filter(l => l.trim()).map((fr, i) => {
  const en = song.lyrics.english.split('\n')[i] || '';
  return \`| \${fr.replace(/\|/g, '\\|')} | \${(song.lyrics.english.split('\n')[i] || '').replace(/\|/g, '\\|')} | |\`;
}).join('\n') : ''}

# Vocabulary

${song.vocabulary && song.vocabulary.length > 0 ? `
| French | English | Type | Note |
|---|---|---|---|
${song.vocabulary.map(v => \`| \${v.french} | \${v.english} | \${v.type} | \${v.note || ''} |\`).join('\n')} 
` : ''}

# Grammar

${song.grammar && song.grammar.length > 0 ? song.grammar.map(g => \`## \${g.title}\n\n\${g.explanation}\`).join('\n\n') : ''}

---

*Full lyrics are intentionally omitted. Use the official recording or a licensed lyric source, then practice the study lines above. The original lesson *Episode 88: Une chanson révolutionnaire* has curated translations.*
`;

  const filepath = `content/${song.slug}.md`;
  await writeFile(filepath, content);
  console.log(`Created: ${song.slug}`);
}

async function main() {
  console.log('Creating song lessons from FrenchLearner.com...');
  
  for (const song of SONGS) {
    const filepath = `content/${song.slug}.md`;
    await writeFile(filepath, content);
    console.log(`Created: ${song.slug}`);
  }
  
  console.log('Done creating song lessons!');
}

main().catch(console.error);