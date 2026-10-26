import datetime
import json
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request

B = sys.argv[1]
DB = sys.argv[2] + "/data.db"
falhas = 0


def call(m, p, b=None, t=None):
    r = urllib.request.Request(B + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    r.add_header("Content-Type", "application/json")
    if t:
        r.add_header("Authorization", t)
    try:
        with urllib.request.urlopen(r, timeout=30) as x:
            return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def chk(nome, obtido, esperado):
    global falhas
    ok = obtido in esperado if isinstance(esperado, list) else obtido == esperado
    print(("OK    " if ok else "FALHA ") + f"{nome} | obtido: {obtido} | esperado: {esperado}")
    if not ok:
        falhas += 1


def db():
    return sqlite3.connect(DB, timeout=20)


s, _ = call("POST", "/backend/v1/setup/administrador", {"name": "Dono", "usuario": "dono", "email": "dono@teste.com", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"})
chk("admin criado", s, 201)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok, uid = j["token"], j["record"]["id"]
s, emp = call("POST", "/api/collections/empresas/records", {"nome": "Funeraria Teste", "padrao": True, "usuario_id": uid}, tok)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok = j["token"]
eid = j["record"]["empresa_id"]


def cat(nome, tipo, grupo):
    s, c = call("POST", "/api/collections/categorias/records", {"nome": nome, "tipo": tipo, "grupo_dre": grupo, "usuario_id": uid, "ativa": True}, tok)
    assert s == 200, (nome, s, c)
    return c["id"]


c_rec = cat("1.1 Mensalidades de planos", "receita", "receita_bruta")
c_desp = cat("4.4 Agua e energia", "despesa", "despesas_operacionais")
c_taxa = cat("5.7 Taxas de maquineta e cartao", "despesa", "despesa_financeira")

# 1) cadastro de contas: nome unico por empresa, normalizado
def conta(nome, tipo, token=None):
    return call("POST", "/api/collections/contas/records", {"nome": nome, "tipo": tipo, "saldo_inicial": 0, "usuario_id": uid}, token or tok)


s, c_cofre = conta("Cofre", "caixa")
chk("1: conta Cofre criada", s, 200)
chk("1: conta assume a empresa do usuario", c_cofre.get("empresa_id"), eid)
s, c_itau = conta("Itaú", "banco")
chk("1: conta Itau criada", s, 200)
s, c_cart = conta("Cartão Corporativo", "cartao")
chk("1: conta cartao criada", s, 200)
s, _ = conta("  cofre  ", "caixa")
chk("1: nome repetido (maiusculas e espacos) recusado", s, 400)
s, _ = conta("COFRE", "banco")
chk("1: nome repetido em outro tipo recusado", s, 400)
s, _ = conta("Itau", "banco")
chk("1: nome igual sem acento (Itau x Itaú) recusado", s, 400)
s, _ = conta("Co\u200bfre", "caixa")
chk("1: nome com caractere invisivel recusado", s, 400)

# 2) baixa exige conta valida
hoje = datetime.date.today()
dia = hoje.isoformat()
comp = dia[:7]


def previsto(tipo, valor, desc, categoria, cid):
    s, r = call("POST", "/api/collections/lancamentos/records", {"tipo": tipo, "descricao": desc, "categoria": categoria, "categoria_id": cid, "valor": valor, "competencia": comp, "data_lancamento": dia, "data_vencimento": dia, "status": "previsto", "empresa_id": eid, "usuario_id": uid}, tok)
    assert s == 200, (desc, s, r)
    return r


def baixa(orig, conta_txt, token=None, status_extra=None):
    corpo = {"tipo": orig["tipo"], "descricao": "[LIQUIDADO] " + orig["descricao"], "categoria": orig["categoria"], "categoria_id": orig["categoria_id"], "valor": orig["valor"], "competencia": orig["competencia"], "data_lancamento": orig["data_lancamento"][:10], "data_vencimento": dia, "data_realizacao": dia, "status": "realizado", "empresa_id": eid, "usuario_id": uid, "liquidacao_de": orig["id"]}
    if conta_txt is not None:
        corpo["conta"] = conta_txt
    return call("POST", "/api/collections/lancamentos/records", corpo, token or tok)


p1 = previsto("receita", 300, "Venda cartao 1", "1.1 Mensalidades de planos", c_rec)
s, _ = baixa(p1, None)
chk("2: baixa SEM conta recusada", s, 400)
s, _ = baixa(p1, "   ")
chk("2: baixa com conta em branco recusada", s, 400)
s, r = baixa(p1, "Banco Inexistente")
chk("2: baixa com conta que nao existe recusada", s, 400)
print("   mensagem:", r.get("message"))
s, _ = baixa(p1, "Cartão Corporativo")
chk("2: receita em conta do tipo cartao recusada", s, 400)
n_ant = db().execute("select count(*) from lancamentos where liquidacao_de=?", (p1["id"],)).fetchone()[0]
chk("2: nenhuma baixa gravada pelas recusas", n_ant, 0)
s, r = baixa(p1, "  ITAÚ ")
chk("2: baixa com conta valida (maiusculas e espacos diferentes) aceita", s, 200)
chk("2: conta gravada com o nome canonico do cadastro", r.get("conta"), "Itaú")
s, _ = baixa(p1, "Itaú")
chk("2: segunda baixa do mesmo previsto recusada (regra antiga mantida)", s, 400)

p2 = previsto("despesa", 80, "Conta de agua", "4.4 Agua e energia", c_desp)
s, r = baixa(p2, "Cofre")
chk("2: pagamento saindo do Cofre aceito", s, 200)
chk("2: pagamento gravado no Cofre", r.get("conta"), "Cofre")
# valor identico continua exigido
p3 = previsto("receita", 100, "Venda cartao 3", "1.1 Mensalidades de planos", c_rec)
corpo_liq = {"tipo": "receita", "descricao": "[LIQUIDADO] Venda cartao 3", "categoria": p3["categoria"], "categoria_id": p3["categoria_id"], "valor": 97, "competencia": comp, "data_lancamento": dia, "data_vencimento": dia, "data_realizacao": dia, "status": "realizado", "empresa_id": eid, "usuario_id": uid, "liquidacao_de": p3["id"], "conta": "Itaú"}
s, _ = call("POST", "/api/collections/lancamentos/records", corpo_liq, tok)
chk("2: baixa por valor liquido (97 contra 100) continua recusada", s, 400)

# 3) lancamento realizado direto tambem exige conta; restauracao de backup so por administrador
direto = {"tipo": "receita", "descricao": "Venda direta", "categoria": "1.1 Mensalidades de planos", "categoria_id": c_rec, "valor": 50, "competencia": comp, "data_lancamento": dia, "data_realizacao": dia, "status": "realizado", "empresa_id": eid, "usuario_id": uid}
s, _ = call("POST", "/api/collections/lancamentos/records", direto, tok)
chk("3: realizado direto SEM conta recusado", s, 400)
s, r = call("POST", "/api/collections/lancamentos/records", {**direto, "conta": "cofre"}, tok)
chk("3: realizado direto com conta valida aceito", s, 200)
chk("3: conta canonica gravada", r.get("conta"), "Cofre")
s, _ = call("POST", "/api/collections/lancamentos/records", {**direto, "conta": "Cartão Corporativo"}, tok)
chk("3: receita direta em conta cartao recusada", s, 400)
s, _ = call("POST", "/api/collections/lancamentos/records", {**direto, "status": "previsto", "data_realizacao": None, "data_vencimento": dia}, tok)
chk("3: previsto sem conta continua aceito (a conta vem na baixa)", s, 200)


def com_cabecalho(corpo, token):
    rq = urllib.request.Request(B + "/api/collections/lancamentos/records", data=json.dumps(corpo).encode(), method="POST")
    rq.add_header("Content-Type", "application/json")
    rq.add_header("Authorization", token)
    rq.add_header("X-Restauracao-Backup", "1")
    try:
        with urllib.request.urlopen(rq, timeout=30) as x:
            return x.status
    except urllib.error.HTTPError as e:
        return e.code


chk("3: RESTAURACAO (cabecalho + administrador) aceita realizado sem conta", com_cabecalho({**direto, "descricao": "Realizado antigo restaurado"}, tok), 200)
p_rest = previsto("receita", 70, "Previsto antigo restaurado", "1.1 Mensalidades de planos", c_rec)
corpo_baixa_antiga = {"tipo": "receita", "descricao": "[LIQUIDADO] Previsto antigo restaurado", "categoria": p_rest["categoria"], "categoria_id": p_rest["categoria_id"], "valor": 70, "competencia": comp, "data_lancamento": dia, "data_vencimento": dia, "data_realizacao": dia, "status": "realizado", "empresa_id": eid, "usuario_id": uid, "liquidacao_de": p_rest["id"]}
chk("3: RESTAURACAO aceita baixa antiga sem conta", com_cabecalho(corpo_baixa_antiga, tok), 200)
s, uo = call("POST", "/api/collections/users/records", {"name": "Operador", "usuario": "operador", "email": "operador@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}, tok)
call("POST", f"/backend/v1/admin/usuarios/{uo.get('id')}/role", {"role": "operador", "empresa_id": eid}, tok)
s, jo = call("POST", "/api/collections/users/auth-with-password", {"identity": "operador", "password": "SenhaForte123"})
otok = jo.get("token")
chk("3: cabecalho de restauracao com OPERADOR continua recusado", com_cabecalho({**direto, "descricao": "Operador tenta burlar"}, otok), 400)

# 4) conta com lancamentos nao muda de nome nem e excluida; sem movimento pode
s, _ = call("PATCH", f"/api/collections/contas/records/{c_itau['id']}", {"nome": "Itau Novo"}, tok)
chk("4: renomear conta com lancamentos recusado", s, 400)
s, _ = call("DELETE", f"/api/collections/contas/records/{c_itau['id']}", None, tok)
chk("4: excluir conta com lancamentos recusado", s, 400)
s, r = call("PATCH", f"/api/collections/contas/records/{c_itau['id']}", {"saldo_inicial": 0}, tok)
chk("4: alterar so o saldo inicial continua permitido", s, 200)
s, _ = call("PATCH", f"/api/collections/contas/records/{c_itau['id']}", {"tipo": "caixa"}, tok)
chk("4: trocar o tipo de conta com movimento recusado", s, 400)
s, _ = call("PATCH", f"/api/collections/contas/records/{c_cofre['id']}", {"nome": "Cofre Novo"}, tok)
chk("4: renomear conta so com FECHAMENTOS e lancamentos recusado", s, 400)
s, c_bra = conta("Bradesco", "banco")
s, _ = call("PATCH", f"/api/collections/contas/records/{c_bra['id']}", {"nome": "Itaú"}, tok)
chk("4: renomear para nome ja existente recusado", s, 400)
s, _ = call("PATCH", f"/api/collections/contas/records/{c_bra['id']}", {"nome": "Bradesco PJ"}, tok)
chk("4: renomear conta SEM lancamentos permitido", s, 200)
s, _ = call("DELETE", f"/api/collections/contas/records/{c_bra['id']}", None, tok)
chk("4: excluir conta SEM lancamentos permitido", s, [200, 204])

# 5) fechamento: conta do caixa obrigatoria e do tipo caixa
def fech(**kw):
    corpo = {"data": dia, "total_fita": 500, "caixa": "Caixa 1", "numero_fita": "100", "categoria_id": c_rec, "conta": "Cofre",
             "maquineta_pix": 100, "maquineta_credito": 100, "maquineta_debito": 100, "dinheiro_contado": 180,
             "despesas": [{"descricao": "Compra de cafe", "categoria_id": c_desp, "valor": 20}]}
    corpo.update(kw)
    return call("POST", "/api/collections/fechamentos_caixa/records", corpo, tok)


l0 = db().execute("select count(*) from lancamentos").fetchone()[0]
s, _ = fech(conta="")
chk("5: fechamento sem conta recusado", s, 400)
s, _ = fech(conta="Itaú", numero_fita="101")
chk("5: dinheiro do caixa em conta de banco recusado", s, 400)
s, _ = fech(conta="Conta Fantasma", numero_fita="102")
chk("5: conta inexistente recusada", s, 400)
chk("5: nada gravado nas recusas", db().execute("select count(*) from lancamentos").fetchone()[0], l0)
s, r = fech(conta=" cofre ", numero_fita="103")
chk("5: fechamento com Cofre (variacao de maiusculas/espacos) aceito", s, 200)
chk("5: conta canonica no fechamento", r.get("conta"), "Cofre")
fid = r.get("id")
s, rl = call("GET", "/api/collections/lancamentos/records?perPage=50&filter=" + urllib.parse.quote(f"fechamento_id='{fid}'"), None, tok)
itens = rl.get("items", [])
din = [x for x in itens if x["descricao"].endswith("dinheiro")]
chk("5: receita do dinheiro no Cofre", ",".join(x["conta"] for x in din), "Cofre")
chk("5: despesa do caixa no Cofre", ",".join(x["conta"] for x in itens if x["tipo"] == "despesa"), "Cofre")
prev = {x["descricao"].split(" - ")[-1]: x for x in itens if x["status"] == "previsto"}
chk("5: PIX vence no mesmo dia", prev["PIX"]["data_vencimento"][:10], dia)
chk("5: debito vence amanha", prev["cartão de débito"]["data_vencimento"][:10], (hoje + datetime.timedelta(days=1)).isoformat())
chk("5: credito vence em 31 dias", prev["cartão de crédito"]["data_vencimento"][:10], (hoje + datetime.timedelta(days=31)).isoformat())
chk("5: previstos sem conta ate a baixa", {x["conta"] for x in prev.values()}, {""})
# baixa de um previsto do fechamento pelo banco
s, r2 = baixa(prev["PIX"], "Itaú")
chk("5: baixa do PIX do fechamento no Itau aceita", s, 200)
# estorno do fechamento mantem a conta nos contra-lancamentos
s, r3 = fech(numero_fita="104", total_fita=200, maquineta_pix=0, maquineta_credito=0, maquineta_debito=0, dinheiro_contado=200, despesas=[])
fid4 = r3.get("id")
s, r4 = call("POST", "/backend/v1/fechamento/estornar", {"id": fid4, "motivo": "teste de conta no estorno"}, tok)
chk("5: estorno do fechamento so de dinheiro aceito", s, 200)
x = db().execute("select conta from lancamentos where fechamento_id=? and estorno_de != ''", (fid4,)).fetchone()
chk("5: contra-lancamento mantem a conta Cofre", x[0] if x else None, "Cofre")

# 6) outra empresa nao usa as contas da empresa 1
s, emp2 = call("POST", "/api/collections/empresas/records", {"nome": "Outra Empresa", "padrao": False, "usuario_id": uid}, tok)
s, u2 = call("POST", "/api/collections/users/records", {"name": "Admoutra", "usuario": "admoutra", "email": "admoutra@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}, tok)
call("POST", f"/backend/v1/admin/usuarios/{u2.get('id')}/role", {"role": "administrador", "empresa_id": emp2.get("id")}, tok)
s, j2 = call("POST", "/api/collections/users/auth-with-password", {"identity": "admoutra", "password": "SenhaForte123"})
atok = j2.get("token")
if atok and j2["record"].get("empresa_id") == emp2.get("id"):
    s, co = call("POST", "/api/collections/contas/records", {"nome": "Cofre", "tipo": "caixa", "saldo_inicial": 0, "usuario_id": j2["record"]["id"]}, atok)
    chk("6: outra empresa pode ter conta com o mesmo nome (nome unico e por empresa)", s, 200)
    chk("6: conta da outra empresa vinculada a ela", co.get("empresa_id"), emp2.get("id"))
else:
    print("   (nao foi possivel criar admin da outra empresa; itens 6 pulados)")

# 7) leitura nao cria conta
s, ul = call("POST", "/api/collections/users/records", {"name": "Leitor", "usuario": "leitor", "email": "leitor@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}, tok)
call("POST", f"/backend/v1/admin/usuarios/{ul.get('id')}/role", {"role": "leitura", "empresa_id": eid}, tok)
s, jl = call("POST", "/api/collections/users/auth-with-password", {"identity": "leitor", "password": "SenhaForte123"})
s, _ = conta("Conta do leitor", "banco", jl.get("token"))
chk("7: cargo leitura nao cria conta", s, [400, 403])

print(f"=== RESUMO: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
