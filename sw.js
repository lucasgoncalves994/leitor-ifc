/* Service worker do leitor.
   Serve para duas coisas: deixar o site instalável no celular (o Chrome do
   Android só oferece "instalar aplicativo" quando existe um SW com fetch) e
   fazer o leitor abrir offline depois da primeira visita.

   Estratégia:
   - casca (HTML, scripts, ícones): guardada na instalação e servida do cache,
     atualizando por trás (stale-while-revalidate);
   - modelos (.json, 6 a 20 MB): nunca pré-baixados; entram no cache só depois
     que você abriu aquele modelo uma vez;
   - fontes do Google: cache primeiro, para não depender da rede;
   - .ifc e .xlsx: sempre da rede, são downloads, não fazem parte do app.
*/
const VERSAO = 'leitor-ifc-v1';
const CASCA = [
  './',
  './index.html',
  './ifc-core.js',
  './ifc-build.js',
  './three.min.js',
  './manifest.json',
  './icone-192.png',
  './icone-512.png',
  './icone-mascara-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSAO)
      // addAll falha inteiro se um item falhar; guardamos um a um
      .then((c) => Promise.all(CASCA.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const guardavel = (url) => !/\.(ifc|xlsx|zip)$/i.test(url.pathname);

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (!guardavel(url)) return;

  // navegação: rede primeiro (pega a versão nova), cache se estiver offline
  if (req.mode === 'navigate') {
    ev.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => { });
          return r;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // o resto: cache primeiro, e revalida por trás quando é da própria origem
  ev.respondWith(
    caches.match(req).then((cacheado) => {
      const naRede = fetch(req).then((r) => {
        if (r && (r.ok || r.type === 'opaque')) {
          const copia = r.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => { });
        }
        return r;
      }).catch(() => cacheado);
      return cacheado || naRede;
    })
  );
});
