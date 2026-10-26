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

  useEffect(() => {
    let ativo = true
    getContas()
      .then((cs) => {
        if (ativo) setContas(cs)
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setCarregado(true)
      })
    return () => {
      ativo = false
    }
  }, [])

  const aceitas = contas.filter((c) => !tipos || tipos.includes(c.tipo))

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-slate-600">
        {rotulo}
      </Label>
      {carregado && aceitas.length === 0 ? (
        <p className="text-xs text-rose-700">
          Nenhuma conta cadastrada para esta operação. Cadastre em{' '}
          <Link to="/configuracoes" className="underline font-semibold">
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
