// Hook onRecordCreate para coleções de empresas
// Regra 7a:
// Ao criar a PRIMEIRA empresa, vincular automaticamente a ela todos os usuários sem empresa
// e registrar o evento na auditoria existente.
// Regra 7d:
// Criação/vinculação de empresa pelo administrador registra o evento na auditoria (coleção blindada existente).
onRecordCreate((e) => {
  // Deixa o fluxo prosseguir para gerar ID e persistir a empresa
  e.next()

  try {
    const novaEmpresaId = e.record.id
    const novaEmpresaNome = e.record.getString('nome')
    const totalEmpresas = $app.countRecords('empresas')

    const authUserId = e.record.getString('usuario_id')

    // Auditoria da criação da empresa (Item 7d)
    const auditCol = $app.findCollectionByNameOrId('auditoria')
    const auditRecord = new Record(auditCol)
    auditRecord.set('usuario_id', authUserId || e.record.getString('usuario_id') || 'sistema')
    auditRecord.set('acao', 'criacao_empresa')
    auditRecord.set('descricao', `Empresa cadastrada: ${novaEmpresaNome} (ID: ${novaEmpresaId})`)
    auditRecord.set('referencia_id', novaEmpresaId)
    auditRecord.set('detalhes', {
      nome: novaEmpresaNome,
      cnpj: e.record.getString('cnpj'),
      padrao: e.record.getBool('padrao'),
      total_empresas: totalEmpresas,
    })
    $app.save(auditRecord)

    // Se for a primeira empresa cadastrada no sistema (totalEmpresas === 1 logo após salvar)
    if (totalEmpresas === 1) {
      // Localizar todos os usuários sem empresa (empresa_id = '' ou null)
      const usersSemEmpresa = $app.findRecordsByFilter(
        'users',
        "empresa_id = '' || empresa_id = null",
        'created',
        1000,
        0,
      )

      let vinculadosCount = 0
      for (const u of usersSemEmpresa) {
        u.set('empresa_id', novaEmpresaId)
        $app.save(u)
        vinculadosCount++
      }

      // Registrar evento na auditoria existente
      const auditAutoVinculo = new Record(auditCol)
      auditAutoVinculo.set('usuario_id', authUserId || 'sistema')
      auditAutoVinculo.set('acao', 'auto_vinculo_primeira_empresa')
      auditAutoVinculo.set(
        'descricao',
        `Primeira empresa criada (${novaEmpresaNome}): ${vinculadosCount} usuário(s) sem empresa foram automaticamente vinculados.`,
      )
      auditAutoVinculo.set('referencia_id', novaEmpresaId)
      auditAutoVinculo.set('detalhes', {
        empresa_id: novaEmpresaId,
        empresa_nome: novaEmpresaNome,
        usuarios_vinculados_count: vinculadosCount,
      })
      $app.save(auditAutoVinculo)
    }
  } catch (err) {
    console.error('Falha ao processar hook de empresas:', err)
  }
}, 'empresas')
