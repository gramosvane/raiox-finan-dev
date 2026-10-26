import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getContas } from '@/services/financial'
import type { Conta } from '@/types/financial'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ROTULO_TIPO: Record<string, string> = {
  caixa: 'caixa',
  banco: 'banco',
  cartao: 'cartão',
}

interface Props {
  value: string
  onChange: (nome: string) => void
  /** Tipos de conta aceitos. Padrão: todos. */
  tipos?: Array<Conta['tipo']>
  rotulo?: string
  id?: string
}

// Seletor de conta para baixas e fechamentos: NUNCA vem preenchido por padrão (a escolha é sempre deliberada).
export const SeletorContaBaixa: React.FC<Props> = ({
  value,
  onChange,
  tipos,
  rotulo = 'Conta (de onde entra ou sai o dinheiro)',
  id = 'seletor-conta',
}) => {
  const [contas, setContas] = useState<Conta[]>([])
  const [carregado, setCarregado] = useState(false)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let ativo = true
    getContas()
      .then((cs) => {
        if (ativo) setContas(cs)
      })
      .catch(() => {
        if (ativo) setFalhou(true)
      })
      .finally(() => {
        if (ativo) setCarregado(true)
      })
    return () => {
      ativo = false
    }
  }, [])

  const aceitas = contas.filter((c) => !tipos || tipos.includes(c.tipo))
  const descricaoTipos = tipos && tipos.length > 0 ? tipos.map((t) => ROTULO_TIPO[t] || t).join(' ou ') : ''

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-slate-600">
        {rotulo}
      </Label>
      {carregado && falhou ? (
        <p className="text-xs text-rose-700">
          Não foi possível carregar as contas. Recarregue a página e tente de novo.
        </p>
      ) : carregado && aceitas.length === 0 ? (
        <p className="text-xs text-rose-700">
          Nenhuma conta{descricaoTipos ? ` do tipo ${descricaoTipos}` : ''} cadastrada. Cadastre em{' '}
          <Link
            to="/configuracoes"
            target="_blank"
            rel="noreferrer"
            className="underline font-semibold"
          >
            Configurações → Contas Bancárias / Caixa
          </Link>
          .
        </p>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} aria-label={rotulo} className="bg-slate-50 border-slate-200 text-xs rounded-xl">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>
            {aceitas.map((c) => (
              <SelectItem key={c.id} value={c.nome}>
                {c.nome} ({ROTULO_TIPO[c.tipo] || c.tipo})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
