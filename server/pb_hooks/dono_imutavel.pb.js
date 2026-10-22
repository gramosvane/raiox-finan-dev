// Dono e empresa de contas e patrimônio não mudam por alteração (lote 12, achado F4 do Claude Security).
// A propriedade (usuario_id) e a empresa (empresa_id) só são definidas na criação, pelo hook
// enforce_usuario_id. Na alteração, qualquer tentativa de trocá-las é recusada, para que um registro
// próprio não possa ser empurrado para outro usuário ou outra empresa.
// Exceção única: registro antigo sem empresa pode ser vinculado à empresa do próprio usuário.
onRecordUpdateRequest(
  (e) => {
    const original = e.record.original()
    const donoAntes = original.getString('usuario_id')
    const donoDepois = e.record.getString('usuario_id')
    if (donoAntes !== donoDepois) {
      throw new BadRequestError('Operação negada: o dono do registro não pode ser alterado.')
    }
    const empresaAntes = original.getString('empresa_id')
    const empresaDepois = e.record.getString('empresa_id')
    if (empresaAntes !== empresaDepois) {
      const minhaEmpresa = e.auth ? e.auth.getString('empresa_id') : ''
      if (empresaAntes !== '' || empresaDepois === '' || empresaDepois !== minhaEmpresa) {
        throw new BadRequestError('Operação negada: a empresa do registro não pode ser alterada.')
      }
    }
    e.next()
  },
  'contas',
  'patrimonio',
)
