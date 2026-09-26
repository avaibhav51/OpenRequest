import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const host = '127.0.0.1'
const port = 4173
const mount = '/OpenRequest/'
const root = join(process.cwd(), 'dist')
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2'
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`)
  if (url.pathname === `${mount}__fixtures/profile`) {
    const body = JSON.stringify({ id: 42, name: 'Regression fixture', mode: url.searchParams.get('mode') })
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'content-length': Buffer.byteLength(body),
      'content-type': 'application/json; charset=utf-8',
      'x-openrequest-fixture': 'true'
    })
    response.end(body)
    return
  }
  if (url.pathname === '/OpenRequest') {
    response.writeHead(308, { location: mount })
    response.end()
    return
  }
  if (!url.pathname.startsWith(mount)) {
    response.writeHead(404).end('Not found')
    return
  }

  const relative = normalize(decodeURIComponent(url.pathname.slice(mount.length))).replace(/^(\.\.(\/|\\|$))+/, '')
  let file = join(root, relative || 'index.html')
  try {
    if (!(await stat(file)).isFile()) file = join(root, 'index.html')
  } catch {
    file = join(root, 'index.html')
  }

  response.writeHead(200, {
    'cache-control': 'no-cache',
    'content-type': types[extname(file)] ?? 'application/octet-stream'
  })
  createReadStream(file).pipe(response)
})

server.listen(port, host, () => console.log(`E2E server: http://${host}:${port}${mount}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
