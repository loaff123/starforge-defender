import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// Test-only server. It deliberately serves only the game, not the repository.
createServer((request, response) => {
  if (!['/', '/index.html'].includes(request.url)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(readFileSync(new URL('../index.html', import.meta.url)));
}).listen(4173, '127.0.0.1', () => console.log('Starforge preview: http://127.0.0.1:4173'));
