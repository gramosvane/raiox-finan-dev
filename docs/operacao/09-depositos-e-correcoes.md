# 09 · Depósitos da maquineta e como corrigir um erro

## O que é
Em **Contas a Receber → Depósitos da maquineta**, o administrador registra o que o banco pagou:
1. marca os **títulos** (receitas previstas de PIX e cartão) que compõem o depósito (até 100);
2. informa a **data** em que caiu e a **conta bancária**;
3. digita as **linhas do extrato** (o valor que caiu; pode ser uma por bandeira, ex.: Mastercard débito; até 12) e o sistema soma.
   As linhas servem para você conferir com o extrato do banco; só a **soma** entra na conta. Valores no formato brasileiro (`1.234,56`);
4. confere o resumo: **bruto** dos títulos, **caiu no banco**, **taxa** (bruto menos o que caiu), o **percentual**, a conta e a data.

Ao confirmar, numa única operação (tudo ou nada): cada título é **baixado pelo valor bruto** na conta escolhida, **uma despesa de taxa**
é lançada (categoria da taxa, competência no mês do depósito) e o **registro imutável do depósito** é gravado com os títulos e as linhas.
A receita continua **bruta** (base do Simples); a taxa nunca é estimada.

## O que o sistema recusa (sem gravar nada)
- o que caiu maior que o bruto; título já baixado, de outra empresa, que não seja receita prevista; depósito anterior à venda, com data futura ou inexistente (ex.: 31/02);
- conta que não seja do tipo banco; categoria da taxa ausente, inativa, que não seja despesa **ou que não esteja no grupo Despesa financeira**;
- usuário sem empresa vinculada; bruto na tela diferente do bruto que o servidor calcula no momento (a lista mudou: atualize e confira);
- envio repetido (chave única) e dois depósitos simultâneos com o mesmo título;
- **taxa acima do limite** (padrão 5%): o sistema **não presume** que toda diferença é taxa; pode faltar ou sobrar título. Só registra com a confirmação explícita;
- título com vencimento **depois** da data do depósito: a tela pede confirmação de que o banco já pagou.
Só o **administrador** registra e corrige; operador e leitura são recusados no servidor.
A despesa de taxa de um depósito **não pode ser editada nem estornada à mão**: só a função Corrigir mexe nela.

## Procedimentos de recuperação (as baixas não se desfazem; o resto se corrige)
**(a) Digitei o valor que caiu errado (os títulos estão certos).** Botão **Corrigir** na linha do depósito: informe o valor correto e o motivo. O sistema, de forma atômica e
auditada, **estorna a despesa de taxa** vigente e **lança a taxa correta**, e grava a correção (valor anterior, novo, taxas, motivo, quem, quando).
O depósito original **nunca muda**. Valida: maior que zero, não maior que o bruto, diferente do atual, limite de taxa. Pode corrigir mais de uma vez.
O par estorno + taxa nova fica com **data de realização de hoje** (no regime de caixa, os meses já vistos não são reescritos) e **competência do mês do depósito**
(na DRE por competência, o mês do depósito passa a mostrar a taxa corrigida: **se esse mês já foi entregue ao contador, avise-o antes de corrigir**).
A categoria da taxa nova é a do depósito; se ela foi inativada ou saiu do grupo Despesa financeira depois, vale a categoria configurada hoje em "Configuração da taxa".

**(b) Marquei título a mais ou a menos (a composição está errada).** **Não use Corrigir para isso.** Corrigir só troca o valor que caiu; usá-lo para
"fazer a taxa ficar boa" falsifica o valor do extrato e estraga a conferência com o banco. A baixa não se desfaz e a função "desfazer depósito"
**ainda não existe** (é uma lacuna conhecida, prevista para uma etapa seguinte). O que fazer:
1. **não altere valores** e não repita o registro; anote data, conta, valor que caiu e qual título entrou a mais ou faltou (o histórico mostra a composição).
   **Não baixe nem inclua em outro depósito** o título que ficou de fora (nem o que foi marcado a mais): ele continua aparecendo como previsto ou vencido, mas o
   dinheiro dele já está no depósito registrado; baixá-lo à parte soma o valor duas vezes no caixa. Deixe-o como está até a orientação do contador;
2. o **dinheiro na conta está certo** (o que caiu é o que foi registrado); o erro está só em **qual título recebeu a baixa** e em **quanto da diferença virou taxa**;
3. mesmo assim a diferença altera a receita do mês e a taxa lançada, então **leve ao contador antes de fechar o mês**.
   **Não lance ajuste por conta própria:** todo lançamento realizado exige conta e muda o caixa, que já está certo. Registre só o que o contador definir
   (tipo, status e conta), com descrição clara (depósito, data, conta, título);
4. **Nunca** presuma que a diferença entre dois depósitos é taxa.
5. **Caminho rastreável:** o contador define o ajuste (tipo, status, conta); **quem lança é o administrador**, com descrição clara (depósito, data, conta, título) e o motivo;
   o lançamento vai para a **auditoria** (quem e quando). Sem a definição do contador, nada é lançado.
Prevenção: confira o resumo antes de confirmar; a tela avisa taxa acima do limite, vencimento futuro e linhas repetidas.

**(c) Escolhi a conta errada.** A baixa não pode ser editada nem estornada. A correção correta é uma **transferência entre contas** (fora do resultado,
duas pontas), marcada como **correção de conta** e não como movimento bancário. Essa função entra na etapa de transferências. Até lá **não faça
lançamentos de ajuste manuais** (distorcem o resultado): anote data, valor e as duas contas e aguarde a função. (Em (b) o contador pode definir o ajuste
porque o problema é de composição; em (c) a ferramenta correta está a caminho e um ajuste manual a tornaria mais difícil de conciliar.) Prevenção: a tela mostra a conta escolhida no resumo.

## PIX: como baixar enquanto ele ainda nasce como "a receber" (rotina PROVISÓRIA)
O PIX cai no banco na hora e sem taxa, mas o fechamento ainda o grava como "a receber" (sem conta). Até o PIX nascer direto no banco (próximas versões), baixe-o **uma vez por dia**,
na manhã seguinte, assim:
1. **Confira a fita INTEIRA** (dinheiro, despesas do caixa, débito e crédito, não só o PIX) e o **extrato do banco onde o PIX entrou** (o total do dia e a data real do crédito).
   **Depois que o PIX for baixado, a fita não tem mais correção**: o sistema não estorna fechamento com baixa e as linhas do fechamento não se editam nem se estornam à mão; qualquer erro vira lançamento de ajuste definido com o contador.
2. Em Contas a Receber → Depósitos da maquineta → Registrar depósito: marque **só os PIX daquele dia** (um dia por vez; nunca misture PIX com débito ou crédito).
3. Digite **uma linha** com a **soma do extrato** e a **data real** em que caiu; escolha o **banco em que entrou**. A taxa tem que dar **zero**: se aparecer taxa, a seleção ou o valor está errado, não confirme.
4. Confirme e verifique que o "A receber" de PIX **diminuiu pelo valor certo** e que o movimento foi registrado **uma única vez**.
Enquanto o PIX não tiver sido baixado, o banco **não** mostra esse dinheiro no sistema e o PIX aparece como atrasado a partir do dia seguinte: isso é pendência da conferência, não atraso do banco.
Não use o botão "Receber" avulso em débito ou crédito (baixa pelo bruto, sem taxa, e não se desfaz). Não lance transferência entre contas à mão (anote data, valor e as duas contas).

## Configuração (administrador)
No mesmo cartão: **categoria da taxa** (grupo Despesa financeira, escolhida por id) e **limite da taxa (%)**. A categoria é obrigatória para registrar depósitos com taxa;
se ainda não existe, o próprio diálogo de registro pede para escolhê-la (o botão "Salvar categoria" do diálogo grava só a categoria; o limite é mudado na seção de configuração).
Se a categoria gravada deixar de ser uma despesa ativa do grupo Despesa financeira, ela conta como não configurada e a tela pede uma nova.
Se a lista de títulos mudou enquanto o diálogo estava aberto (outra pessoa baixou um título), use **Atualizar títulos**: a conta, as linhas do extrato e a observação são mantidas.

## Backup
O backup oficial é a **cópia do banco do servidor** (`backup-usb.sh`); o exportador do aplicativo não inclui depósitos nem fechamentos.
