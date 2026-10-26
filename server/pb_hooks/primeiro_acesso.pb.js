// Primeiro acesso: criação de USO ÚNICO do administrador master (Raio-X Financeiro)
// - GET  /backend/v1/setup/status        -> { success, inicializado }  (público; só um booleano)
// - POST /backend/v1/setup/administrador -> cria o 1º usuário (name, usuario, email, password, passwordConfirm); fecha-se sozinho depois de usado
// Regras: só funciona com ZERO usuários; o papel NUNCA vem do cliente (o hook users_role_create
// define "administrador" para o primeiro usuário); fail-closed; sem senha em log nem em auditoria.
// Código de ativação (instalação simples): se existir pb_data/ativacao.codigo, o POST exige esse código
// (gerado pelo instalador e mostrado só no servidor); o arquivo é apagado quando o administrador é criado.
// Sem o arquivo (instalação manual antiga) o comportamento é o de antes.
// Criação do usuário e da auditoria na MESMA transação (padrão dos demais hooks): se qualquer
// etapa falhar, nada é criado. A contagem é refeita DENTRO da transação (o SQLite serializa as
// gravações: duas requisições simultâneas não obtêm, ambas, o papel de primeiro administrador).
routerAdd('GET', '/backend/v1/setup/status', (e) => {
  let total = 0
  try {
    total = $app.countRecords('users')
  } catch (_) {
    return e.json(500, {
      success: false,
      message: 'Não foi possível verificar o estado do sistema.',
    })
  }
  let exigeCodigo = false
  try {
    $os.stat($app.dataDir() + '/ativacao.codigo')
    exigeCodigo = true
  } catch (_) {}
  return e.json(200, { success: true, inicializado: total > 0, exigeCodigo: exigeCodigo && total === 0 })
})

routerAdd('POST', '/backend/v1/setup/administrador', (e) => {
  const reqInfo = e.requestInfo()
  const body = reqInfo ? reqInfo.body || {} : {}
  const nome = typeof body.name === 'string' ? body.name.trim() : ''
  const usuario = typeof body.usuario === 'string' ? body.usuario.trim().toLowerCase() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const senha = typeof body.password === 'string' ? body.password : ''
  const confirma = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : ''
  const codigoInformado =
    typeof body.codigo === 'string' ? body.codigo.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''

  const arqCodigo = $app.dataDir() + '/ativacao.codigo'
  let codigoEsperado = ''
  let temArquivoCodigo = false
  try {
    $os.stat(arqCodigo)
    temArquivoCodigo = true
    codigoEsperado = toString($os.readFile(arqCodigo)).toUpperCase().replace(/[^A-Z0-9]/g, '')
  } catch (_) {}
  if (temArquivoCodigo) {
    // arquivo presente mas ilegível ou vazio: fecha (fail-closed), nunca libera
    if (!codigoEsperado || !codigoInformado || !$security.equal(codigoInformado, codigoEsperado)) {
      return e.json(403, {
        success: false,
        message: 'Código de ativação inválido. Ele aparece na tela do servidor ao final da instalação.',
      })
    }
  }

  if (!nome) {
    return e.json(400, { success: false, message: 'O nome é obrigatório.' })
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) {
    return e.json(400, {
      success: false,
      message:
        'O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.',
    })
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return e.json(400, { success: false, message: 'Informe um e-mail válido.' })
  }
  if (senha.length < 8) {
    return e.json(400, { success: false, message: 'A senha deve ter pelo menos 8 caracteres.' })
  }
  if (senha !== confirma) {
    return e.json(400, { success: false, message: 'As senhas digitadas não coincidem.' })
  }

  let jaInicializado = false
  try {
    $app.runInTransaction((txApp) => {
      if (txApp.countRecords('users') > 0) {
        jaInicializado = true
        return
      }

      const col = txApp.findCollectionByNameOrId('users')
      const rec = new Record(col)
      rec.set('name', nome)
      rec.set('usuario', usuario)
      rec.setEmail(email)
      rec.setPassword(senha)
      rec.setVerified(true)
      txApp.save(rec)

      const auditCol = txApp.findCollectionByNameOrId('auditoria')
      const audit = new Record(auditCol)
      audit.set('usuario_id', rec.id)
      audit.set('acao', 'primeiro acesso')
      audit.set('descricao', 'Administrador master criado no primeiro acesso do sistema')
      audit.set('referencia_id', rec.id)
      txApp.save(audit)
    })
  } catch (err) {
    console.error('primeiro_acesso: falha ao criar o administrador:', err && err.message)
    return e.json(500, {
      success: false,
      message: 'Não foi possível criar o administrador. Nada foi criado; tente novamente.',
    })
  }

  if (jaInicializado) {
    return e.json(403, { success: false, message: 'O sistema já foi inicializado.' })
  }
  if (temArquivoCodigo) {
    try {
      $os.remove(arqCodigo)
    } catch (err) {
      console.error('primeiro_acesso: não consegui remover o código de ativação:', err && err.message)
    }
  }
  return e.json(201, { success: true, message: 'Administrador criado.' })
})
