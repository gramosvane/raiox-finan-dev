// Painel do PocketBase (/_/) e login de superusuário só pelo PRÓPRIO servidor (túnel SSH).
// O serviço pode escutar na rede local (instalação simples); a porta fica aberta só para a LAN, mas o painel
// e a autenticação de superusuário NÃO: qualquer pedido que não venha do loopback, ou que traga cabeçalho de
// proxy (Cloudflare, X-Forwarded-For), recebe 403. Resposta genérica, sem detalhes.
routerUse((e) => {
  const caminho = (e.request.url && e.request.url.path) || ''
  const sensivel =
    caminho === '/_' || caminho.startsWith('/_/') || caminho.startsWith('/api/collections/_superusers')
  if (!sensivel) return e.next()

  const remoto = String(e.request.remoteAddr || '')
  const host = remoto.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  const loopback = host === '127.0.0.1' || host === '::1'
  const h = e.request.header
  const viaProxy =
    !!h.get('X-Forwarded-For') ||
    !!h.get('CF-Connecting-IP') ||
    !!h.get('X-Real-IP') ||
    !!h.get('Forwarded')
  if (loopback && !viaProxy) return e.next()
  return e.json(403, { message: 'Acesso negado.' })
})
