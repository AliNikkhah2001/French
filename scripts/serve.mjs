import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(projectRoot, 'dist');
const addedRoot = join(projectRoot, 'added content');
const port = Number(process.env.PORT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};

function lookup(root, pathname) {
  const base = resolve(root);
  const target = normalize(join(base, pathname));
  if (!target.startsWith(base)) return null;
  return target;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith('/French/')) pathname = pathname.slice('/French/'.length) || '/';
  const kind = pathname.startsWith('/added content/') ? addedRoot : distRoot;
  const relay = pathname.startsWith('/added content/') ? pathname.slice('added content/'.length) : pathname;
  const file = lookup(kind, relay);
  if (!file) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const info = await stat(file);
    if (info.isDirectory()) return serveFile(response, join(file, 'index.html'));
    return serveFile(response, file);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

function serveFile(response, file) {
  readFile(file)
    .then(data => {
      response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(data);
    })
    .catch(() => {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    });
}

server.listen(port, () => {
  console.log(`Serving dist/ (with /added content mapped to the source folder) at http://localhost:${port}/`);
});