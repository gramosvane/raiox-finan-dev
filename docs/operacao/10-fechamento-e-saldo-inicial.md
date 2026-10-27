# 10 · Fechamento de caixa: linhas protegidas, fita errada, data, saldo inicial e os números de faturamento

## Em três frases
O **dinheiro** da fita entra na hora na conta do caixa (Cofre). **PIX, débito e crédito** nascem como "a receber", sem conta, e só entram num banco quando são baixados
(ver `09-depositos-e-correcoes.md`). O **saldo de cada conta** é: saldo inicial + o que foi realizado nela; por isso o saldo inicial tem data de corte e registro.

## As linhas geradas por um fechamento não se editam nem se estornam à mão
O fechamento gera, ligadas à fita, as linhas de dinheiro, PIX, débito, crédito e as despesas do caixa. Se uma delas fosse mudada ou estornada sozinha, a fita deixaria de bater
com os lançamentos e o estorno do fechamento poderia desfazer duas vezes a mesma linha. Por isso o **servidor** recusa (não é só a tela):
- editar essas linhas (inclusive pela edição controlada);
- estornar essas linhas à mão (Lançamentos → Estornar).

**Fita lançada errada:** use **Estornar fechamento** (Fechamento de caixa, só administrador) e registre a fita de novo. Isso só é possível enquanto **nenhum** PIX ou cartão
daquela fita foi baixado. Se algum já foi baixado, nada é estornado (o sistema não desfaz baixa): o ajuste é um lançamento definido com o contador.

**Estorno já feito à mão em versão antiga:** se alguma linha de uma fita já tinha sido estornada à mão antes desta proteção, o "Estornar fechamento" **não estorna essa linha
de novo**: ele avisa quantas linhas já estavam estornadas e estorna as demais. Nunca há estorno em dobro.

## Data do fechamento
A data não pode ser **futura** nem inexistente (31/02). O dinheiro da fita nasce realizado nesse dia. Para um dia que passou, informe a data real das vendas.
O servidor também recusa, em qualquer rota interna, um lançamento **realizado** com data de realização no futuro (previsto pode ter vencimento futuro).

## Saldo inicial das contas: data de corte e registro
- Ao **criar** a conta, informe o saldo inicial e a **data do saldo inicial** (padrão: hoje; não pode ser futura). Saldo diferente de zero fica na auditoria.
- Depois de criada, o saldo inicial **não muda** pela API comum nem por edição: só pela função **Configurações → Contas → Alterar saldo inicial** (só administrador), que exige
  **motivo** e a **data de corte** e grava, junto, a auditoria com valor anterior, valor novo, data anterior, data nova, quem e quando. Se a auditoria falhar, nada é alterado.
- Contas antigas aparecem como "data de corte não registrada": o Caixa do Painel não muda. A data entra quando o administrador registra o saldo inicial pela função acima
  (isso será exigido antes do saldo por conta, na próxima etapa).

## Os números de faturamento: o que cada tela mostra
| Onde | O que mostra | Critério |
|---|---|---|
| Painel → **Fluxo de caixa do mês** | entradas menos saídas realizadas | pela **data em que o dinheiro entrou ou saiu**. Cartão vendido em outubro e depositado em novembro entra em novembro. Inclui retirada de sócio; as duas pontas de uma transferência se anulam |
| Relatórios → **Evolução mensal** e **Faturamento** | receita bruta, despesas e lucro por mês | **competência**, igual à DRE: inclui o que ainda vai ser recebido (cartão não depositado), tira estornados e previstos já baixados, **não** inclui transferência entre contas nem retirada de sócio |
| Painel → DRE resumida e Relatórios → DRE | resultado do mês | competência (já era assim) |
| Contas a Receber | o que falta receber | previstos abertos |

**Atenção, números já vistos mudam:** "Evolução mensal" e "Faturamento Bruto" antes somavam só o já realizado pela competência (por isso o PIX e o cartão sumiam até a baixa) e
incluíam transferências. Ao entregar números ao contador, use a **DRE**; se usar os relatórios, eles agora batem com a DRE.
