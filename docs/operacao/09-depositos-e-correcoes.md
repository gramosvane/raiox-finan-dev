# 09 · Depósitos da maquineta e como corrigir um erro

## O que é
Em **Contas a Receber → Depósitos da maquineta**, o administrador registra o que o banco pagou:
1. marca os **títulos** (receitas previstas de PIX e cartão) que compõem o depósito;
2. informa a **data** em que caiu e a **conta bancária**;
3. digita as **linhas do extrato** (o valor que caiu; pode ser uma por bandeira, ex.: Mastercard débito) e o sistema soma;
4. confere o resumo: **bruto** dos títulos, **caiu no banco**, **taxa** (bruto menos o que caiu) e o **percentual**.

Ao confirmar, numa única operação (tudo ou nada): cada título é **baixado pelo valor bruto** na conta escolhida, **uma despesa de taxa**
é lançada (categoria da taxa, data do depósito) e o **registro imutável do depósito** é gravado com os títulos e as linhas.
A receita continua **bruta**; a taxa nunca é estimada.

## O que o sistema recusa (sem gravar nada)
- o que caiu maior que o bruto; título já baixado, de outra empresa, que não seja receita prevista; depósito anterior à venda ou com data futura;
- conta que não seja do tipo banco; categoria da taxa ausente, inativa ou que não seja despesa;
- envio repetido (chave única) e dois depósitos simultâneos com o mesmo título;
- **taxa acima do limite** (padrão 5%): o sistema **não presume** que toda diferença é taxa; pode faltar ou sobrar título. Só registra com a confirmação explícita.
Só o **administrador** registra e corrige; operador e leitura são recusados no servidor.

## Procedimentos de recuperação (as baixas não se desfazem; o resto se corrige)
**(a) Digitei o valor que caiu errado.** Botão **Corrigir** na linha do depósito: informe o valor correto e o motivo. O sistema, de forma atômica e
auditada, **estorna a despesa de taxa** vigente e **lança a taxa correta**, e grava a correção (valor anterior, novo, taxas, motivo, quem, quando).
O depósito original **nunca muda**. Valida: maior que zero, não maior que o bruto, diferente do atual, limite de taxa. Pode corrigir mais de uma vez.

**(b) Marquei título a mais ou a menos.** A baixa não se desfaz, mas a **receita bruta não muda**: só muda a data em que o dinheiro aparece. Procedimento:
1. identifique no **histórico** (composição do depósito) quais títulos foram associados e quais deveriam ter sido;
2. confira o valor real que caiu pelo extrato e **corrija o valor** do depósito (item a) para que a taxa fique igual à observada;
3. no depósito seguinte, registre normalmente os títulos que faltaram (a taxa daquele será calculada sobre eles). **Nunca** presuma que a diferença entre dois depósitos é taxa: registre o ajuste com observação clara;
4. se ficar diferença sem explicação, registre um **lançamento de ajuste** com descrição e peça conferência ao contador.

**(c) Escolhi a conta errada.** A baixa não pode ser editada nem estornada. A correção é uma **transferência entre contas** (fora do resultado, duas pontas),
marcada como **correção de conta** e não como movimento bancário. Essa função entra na etapa de transferências; até lá, registre a observação e não repita o erro:
a tela mostra a conta escolhida no resumo antes de confirmar.

## Configuração (administrador)
No mesmo cartão: **categoria da taxa** (despesa financeira, escolhida por id) e **limite da taxa (%)**. A categoria é obrigatória para registrar depósitos com taxa.

## Backup
O backup oficial é a **cópia do banco do servidor** (`backup-usb.sh`); o exportador do aplicativo não inclui depósitos nem fechamentos.
