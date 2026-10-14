// 0017: permissões por cargo (lote 2): o administrador define se o OPERADOR pode alterar cadastros.
// - Cria a coleção "permissoes" (chave/valor): listar só autenticados; criar/alterar só administrador;
//   nunca excluir pela API.
// - Semeia a chave "operador_cadastros" = "liberado" (mantém o comportamento atual).
// - Acrescenta às regras de criação/alteração dos CADASTROS (contas, categorias, departamentos,
//   centros_custo, patrimonio, empresas) a condição: administrador, ou permissão liberada.
//   Com valor "restrito" o operador continua lançando, mas não altera cadastros (no servidor).
// - Fail-closed: sem a linha da permissão, o operador não altera cadastros.
// Migração retrocompatível: não remove coleção, campo nem registro.
migrate(
  (app) => {
    let perm = null
    try {
      perm = app.findCollectionByNameOrId('permissoes')
    } catch (_) {}

    if (!perm) {
      perm = new Collection({
        name: 'permissoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'administrador'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'administrador'",
        deleteRule: null,
        fields: [
          { name: 'chave', type: 'text', required: true },
          { name: 'valor', type: 'text', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_permissoes_chave ON permissoes (chave)'],
      })
      app.save(perm)
    }

    const existente = app.findRecordsByFilter(
      'permissoes',
      "chave = 'operador_cadastros'",
      '',
      1,
      0,
    )
    if (!existente || existente.length === 0) {
      const rec = new Record(app.findCollectionByNameOrId('permissoes'))
      rec.set('chave', 'operador_cadastros')
      rec.set('valor', 'liberado')
      app.save(rec)
    }

    const condicao =
      "(@request.auth.role = 'administrador' || (@collection.permissoes:pc.chave = 'operador_cadastros' && @collection.permissoes:pc.valor = 'liberado'))"

    for (const nome of [
      'contas',
      'categorias',
      'departamentos',
      'centros_custo',
      'patrimonio',
      'empresas',
    ]) {
      let col = null
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        continue
      }
      let mudou = false
      for (const campo of ['createRule', 'updateRule']) {
        const atual = col[campo]
        if (atual && atual.indexOf('permissoes') === -1) {
          col[campo] = '(' + atual + ') && ' + condicao
          mudou = true
        }
      }
      if (mudou) app.save(col)
    }
  },
  (app) => {
    // Reversão conservadora: remove só a condição acrescentada; mantém a coleção e os dados.
    const condicao =
      " && (@request.auth.role = 'administrador' || (@collection.permissoes:pc.chave = 'operador_cadastros' && @collection.permissoes:pc.valor = 'liberado'))"
    for (const nome of [
      'contas',
      'categorias',
      'departamentos',
      'centros_custo',
      'patrimonio',
      'empresas',
    ]) {
      let col = null
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        continue
      }
      let mudou = false
      for (const campo of ['createRule', 'updateRule']) {
        const atual = col[campo]
        if (atual && atual.indexOf(condicao) !== -1) {
          let r = atual.replace(condicao, '')
          if (r.startsWith('(') && r.endsWith(')')) r = r.slice(1, -1)
          col[campo] = r
          mudou = true
        }
      }
      if (mudou) app.save(col)
    }
  },
)
