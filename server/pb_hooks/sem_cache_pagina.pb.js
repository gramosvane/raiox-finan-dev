// Depois de uma atualização o navegador precisa buscar a PÁGINA nova, e não reaproveitar a antiga da memória.
// Os arquivos de /assets/ têm o nome com hash (mudam a cada versão) e podem ser guardados; já a página inicial
// (index.html e as rotas do aplicativo) recebe "Cache-Control: no-cache": o navegador sempre confere com o servidor.
// Não mexe em /api/, /backend/ nem no painel (/_/).
routerUse((e) => {
  const caminho = (e.request.url && e.request.url.path) || ''
  const ehApi = caminho.startsWith('/api/') || caminho.startsWith('/backend/') || caminho.startsWith('/_/')
  const ehAsset = caminho.startsWith('/assets/')
  if (!ehApi && !ehAsset) {
    e.response.header().set('Cache-Control', 'no-cache')
  }
  return e.next()
})
