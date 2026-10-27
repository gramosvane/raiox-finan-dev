import React, { useEffect, useRef, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { hojeBrasil, formatarDataCivil } from '@/lib/dataCivil'
import { parseValorBR } from '@/lib/numeroBR'
import type { Conta } from '@/types/financial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

interface Props {
  conta: Conta | null
  onFechar: () => void
  onAlterado: () => void
}

const SEM_RESPOSTA =
  'Sem resposta do servidor. Antes de tentar de novo, confira o saldo inicial da conta na lista: a alteração pode ter sido gravada.'

function paraTexto(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/**
 * Altera o saldo inicial de uma conta (somente administrador). O servidor exige motivo e a data de corte e grava a
 * auditoria com valor anterior, valor novo, quem e quando; a API comum de contas não muda mais o saldo inicial.
 */
export const AlterarSaldoInicialDialog: React.FC<Props> = ({ conta, onFechar, onAlterado }) => {
  const { toast } = useToast()
  const [valor, setValor] = useState('')
  const [dataCorte, setDataCorte] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const trava = useRef(false)

  useEffect(() => {
    if (!conta) return
    setValor(paraTexto(conta.saldo_inicial || 0))
    setDataCorte((conta.saldo_inicial_data || '').slice(0, 10) || hojeBrasil())
    setMotivo('')
    setErro('')
    trava.current = false
  }, [conta])

  const salvar = async () => {
    if (!conta || trava.current) return
    setErro('')
    const v = parseValorBR(valor)
    if (v === null) return setErro('Informe o saldo inicial em números, como 1.234,56 (pode ser zero ou negativo).')
    if (!dataCorte) return setErro('Informe a data de corte do saldo inicial.')
    if (dataCorte > hojeBrasil()) return setErro('A data de corte não pode ser futura.')
    if (motivo.trim().length < 5) return setErro('Informe o motivo da alteração (mínimo 5 letras).')
    trava.current = true
    setEnviando(true)
    try {
      await pb.send('/backend/v1/conta/saldo-inicial', {
        method: 'POST',
        body: { id: conta.id, valor: v, data_corte: dataCorte, motivo: motivo.trim() },
      })
      toast({ title: 'Saldo inicial alterado', description: 'A alteração ficou registrada na auditoria.' })
      onAlterado()
      onFechar()
    } catch (err: any) {
      setErro(err?.response?.message || SEM_RESPOSTA)
    } finally {
      trava.current = false
      setEnviando(false)
    }
  }

  return (
    <Dialog open={!!conta} onOpenChange={(a) => !a && !enviando && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar saldo inicial</DialogTitle>
          <DialogDescription>
            Conta {conta?.nome}. Hoje o Caixa soma o saldo inicial MAIS todos os lançamentos realizados da conta, de qualquer
            data; a data de corte é só um registro por enquanto. Informe o saldo de abertura de modo que saldo inicial + lançamentos
            realizados = saldo do extrato (não digite o saldo do extrato de hoje). A alteração fica registrada com o valor anterior,
            o motivo, quem alterou e quando.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="si-valor">Saldo inicial (R$)</Label>
            <Input id="si-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
            {conta && (
              <p className="text-[11px] text-slate-500 mt-1">
                Atual: R$ {paraTexto(conta.saldo_inicial || 0)}
                {conta.saldo_inicial_data
                  ? ` (corte em ${formatarDataCivil(conta.saldo_inicial_data.slice(0, 10))})`
                  : ' (data de corte ainda não registrada)'}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="si-data">Data de corte</Label>
            <Input id="si-data" type="date" max={hojeBrasil()} value={dataCorte} onChange={(e) => setDataCorte(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="si-motivo">Motivo</Label>
            <Input id="si-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ex.: saldo de abertura conferido com o contador" />
          </div>
          {erro && <p className="text-xs text-rose-600 font-medium">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
