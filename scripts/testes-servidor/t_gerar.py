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


def n_lanc():
    return db().execute("select count(*) from lancamentos").fetchone()[0]


def n_fech():
    return db().execute("select count(*) from fechamentos_caixa").fetchone()[0]


s, _ = call("POST", "/backend/v1/setup/administrador", {"name": "Dono", "usuario": "dono", "email": "dono@teste.com", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"})
chk("admin criado", s, 201)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok, uid = j["token"], j["record"]["id"]
s, emp = call("POST", "/api/collections/empresas/records", {"nome": "Funeraria Teste", "padrao": True, "usuario_id": uid}, tok)
chk("empresa criada", s, 200)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok = j["token"]
eid = j["record"]["empresa_id"]


def cat(nome, tipo, grupo):
    s, c = call("POST", "/api/collections/categorias/records", {"nome": nome, "tipo": tipo, "grupo_dre": grupo, "usuario_id": uid, "ativa": True}, tok)
    assert s == 200, (nome, s, c)
    return c["id"]


c_rec = cat("1.1 Mensalidades de planos", "receita", "receita_bruta")
c_d1 = cat("4.4 Agua, energia, telefone e internet", "despesa", "despesas_operacionais")
c_d2 = cat("4.5 Manutencao e conservacao", "despesa", "despesas_operacionais")
for nome_c, tipo_c in [("Cofre", "caixa"), ("Itaú", "banco"), ("Cartão Corporativo", "cartao")]:
    s_c, r_c = call("POST", "/api/collections/contas/records", {"nome": nome_c, "tipo": tipo_c, "saldo_inicial": 0, "usuario_id": uid}, tok)
    assert s_c == 200, (nome_c, s_c, r_c)

hoje = datetime.date.today()
dia = hoje.isoformat()


def fech(**kw):
    corpo = {"data": dia, "total_fita": 1000, "caixa": "Caixa 1", "numero_fita": "2122", "categoria_id": c_rec, "conta": "Cofre",
             "maquineta_pix": 300, "maquineta_credito": 200, "maquineta_debito": 100, "dinheiro_contado": 350,
             "despesas": [{"descricao": "Compra de agua", "categoria_id": c_d1, "valor": 30},
                                {"descricao": "Cafe e coador", "categoria_id": c_d2, "valor": 20}]}
    corpo.update(kw)
    return call("POST", "/api/collections/fechamentos_caixa/records", corpo, tok)


def lancs(fid):
    s, r = call("GET", "/api/collections/lancamentos/records?perPage=100&filter=" + urllib.parse.quote(f"fechamento_id='{fid}'"), None, tok)
    return r.get("items", [])


# 1) fechamento que gera tudo
l0, f0 = n_lanc(), n_fech()
s, r = fech()
chk("1: criado", s, 200)
if s != 200:
    print("   resposta:", json.dumps(r, ensure_ascii=False)[:500])
fid1 = r.get("id")
chk("1: esperado = 1000-600-50", r.get("esperado_dinheiro"), 350)
chk("1: diferenca da gaveta 0", r.get("diferenca"), 0)
chk("1: despesas somadas da lista", r.get("despesas_dinheiro"), 50)
chk("1: caixa e fita gravados", (r.get("caixa"), r.get("numero_fita")), ("Caixa 1", "2122"))
ls = lancs(fid1)
chk("1: 6 lancamentos gerados", len(ls), 6)
rec = [x for x in ls if x["tipo"] == "receita"]
desp = [x for x in ls if x["tipo"] == "despesa"]
chk("1: receitas somam a fita (1000)", round(sum(x["valor"] for x in rec), 2), 1000)
chk("1: despesas somam 50", round(sum(x["valor"] for x in desp), 2), 50)
por = {x["descricao"].split(" - ")[-1]: x for x in rec}
chk("1: dinheiro 400 realizado", (por["dinheiro"]["valor"], por["dinheiro"]["status"]), (400, "realizado"))
chk("1: PIX 300 previsto", (por["PIX"]["valor"], por["PIX"]["status"]), (300, "previsto"))
chk("1: PIX vence no mesmo dia (D+0)", por["PIX"]["data_vencimento"][:10], hoje.isoformat())
chk("1: debito vence hoje+1", por["cartão de débito"]["data_vencimento"][:10], (hoje + datetime.timedelta(days=1)).isoformat())
chk("1: credito vence hoje+31", por["cartão de crédito"]["data_vencimento"][:10], (hoje + datetime.timedelta(days=31)).isoformat())
chk("1: responsavel = usuario logado", {x["usuario_id"] for x in ls}, {uid})
chk("1: empresa do usuario", {x["empresa_id"] for x in ls}, {eid})
chk("1: categoria da receita", {x["categoria_id"] for x in rec}, {c_rec})
chk("1: categorias das despesas", {x["categoria_id"] for x in desp}, {c_d1, c_d2})
chk("1: competencia do mes", {x["competencia"] for x in ls}, {dia[:7]})
chk("1: dinheiro na conta Cofre", por["dinheiro"].get("conta"), "Cofre")
chk("1: despesas do caixa saem do Cofre", {x.get("conta") for x in desp}, {"Cofre"})
chk("1: previstos de PIX/cartoes ainda sem conta (a conta vem na baixa)", {por[k].get("conta") for k in ("PIX", "cartão de débito", "cartão de crédito")}, {""})
chk("1: conta gravada no fechamento", r.get("conta") if False else db().execute("select conta from fechamentos_caixa where id=?", (fid1,)).fetchone()[0], "Cofre")

# 2) duplicidade por caixa + numero
l1, f1 = n_lanc(), n_fech()
s, r = fech()
chk("2: mesma fita no mesmo caixa recusada", s, 400)
chk("2: nada gravado na recusa (lancamentos)", n_lanc(), l1)
chk("2: nada gravado na recusa (fechamentos)", n_fech(), f1)
# outro caixa com o mesmo numero: permitido
s, r = fech(caixa="Caixa 2", total_fita=500, maquineta_pix=0, maquineta_credito=0, maquineta_debito=0, despesas=[], dinheiro_contado=500)
chk("2: outro caixa, mesmo numero: aceito", s, 200)
fid2 = r.get("id")
chk("2: so dinheiro: 1 lancamento", len(lancs(fid2)), 1)

# 3) validacoes e atomicidade
l2, f2 = n_lanc(), n_fech()
s, _ = fech(numero_fita="9001", maquineta_pix=900, maquineta_credito=200, maquineta_debito=100)
chk("3: formas maiores que a fita recusadas", s, 400)
s, _ = fech(numero_fita="9002", total_fita=100, maquineta_pix=0, maquineta_credito=0, maquineta_debito=0,
            despesas=[{"descricao": "Despesa grande", "categoria_id": c_d1, "valor": 150}])
chk("3: despesas maiores que o dinheiro recusadas", s, 400)
s, _ = fech(numero_fita="9003", despesas=[{"descricao": "Categoria falsa", "categoria_id": "naoexiste12345", "valor": 10}])
chk("3: categoria de despesa inexistente recusada", s, 400)
s, _ = fech(numero_fita="9004", categoria_id=c_d1)
chk("3: categoria de receita com tipo errado recusada", s, 400)
s, _ = fech(numero_fita="9005", despesas=[{"descricao": "Receita no lugar", "categoria_id": c_rec, "valor": 10}])
chk("3: categoria de despesa com tipo errado recusada", s, 400)
s, _ = fech(numero_fita="9006", despesas=[{"descricao": "ab", "categoria_id": c_d1, "valor": 10}])
chk("3: descricao curta recusada", s, 400)
s, _ = fech(numero_fita="")
chk("3: sem numero da fita recusado", s, 400)
s, _ = fech(caixa="", numero_fita="9007")
chk("3: sem caixa recusado", s, 400)
chk("3: nada gravado (lancamentos)", n_lanc(), l2)
chk("3: nada gravado (fechamentos)", n_fech(), f2)

# 4) prazos configuraveis (so administrador grava)
s, _ = call("POST", "/api/collections/permissoes/records", {"chave": "prazo_credito", "valor": "45"}, tok)
chk("4: administrador grava prazo do credito", s, 200)
s, r = fech(numero_fita="3001", total_fita=400, maquineta_pix=0, maquineta_debito=0, maquineta_credito=400, despesas=[], dinheiro_contado=0)
cr = [x for x in lancs(r.get("id"))]
chk("4: credito vence hoje+45", cr[0]["data_vencimento"][:10] if cr else None, (hoje + datetime.timedelta(days=45)).isoformat())
fid4 = r.get("id")

# 5) estorno bloqueado quando ha baixa
pix = por["PIX"]
s, b = call("POST", "/api/collections/lancamentos/records", {"tipo": "receita", "descricao": "[LIQUIDADO] PIX caixa 1", "categoria": pix["categoria"], "categoria_id": pix["categoria_id"], "valor": pix["valor"], "competencia": pix["competencia"], "data_lancamento": dia, "data_realizacao": dia, "status": "realizado", "empresa_id": eid, "usuario_id": uid, "liquidacao_de": pix["id"], "conta": "Itaú"}, tok)
chk("5: baixa do PIX criada", s, 200)
l3 = n_lanc()
s, r = call("POST", "/backend/v1/fechamento/estornar", {"id": fid1, "motivo": "teste de bloqueio"}, tok)
chk("5: estorno bloqueado por baixa", s, 400)
chk("5: mensagem orienta ajuste (nao pede estornar baixa)", "ajuste" in (r.get("message") or ""), True)
print("   mensagem:", r.get("message"))
chk("5: nada alterado no bloqueio", n_lanc(), l3)
chk("5: fechamento continua ativo", db().execute("select estornado from fechamentos_caixa where id=?", (fid1,)).fetchone()[0], 0)

# 6) estorno do fechamento sem baixa (Caixa 2 so dinheiro e o do credito 45 dias)
s, r = call("POST", "/backend/v1/fechamento/estornar", {"id": fid4, "motivo": "fita lancada errada"}, tok)
chk("6: estorno do fechamento so de credito ok", s, 200)
chk("6: 1 previsto cancelado", r.get("previstos_cancelados"), 1)
st = db().execute("select status from lancamentos where fechamento_id=?", (fid4,)).fetchall()
chk("6: previsto virou estornado", ",".join(x[0] for x in st), "estornado")
s, r = call("POST", "/backend/v1/fechamento/estornar", {"id": fid2, "motivo": "fita lancada errada"}, tok)
chk("6: estorno do fechamento so de dinheiro ok", s, 200)
chk("6: 1 estorno realizado criado", r.get("estornos"), 1)
x = db().execute("select count(*), sum(valor) from lancamentos where fechamento_id=? and estorno_de != ''", (fid2,)).fetchone()
chk("6: contra-lancamento de 500", (x[0], x[1]), (1, 500))
chk("6: fechamento marcado estornado", db().execute("select estornado from fechamentos_caixa where id=?", (fid2,)).fetchone()[0], 1)
s, _ = call("POST", "/backend/v1/fechamento/estornar", {"id": fid2, "motivo": "de novo"}, tok)
chk("6: segundo estorno recusado", s, 400)
s, _ = call("POST", "/backend/v1/fechamento/estornar", {"id": fid2, "motivo": "x"}, tok)
chk("6: motivo curto recusado", s, 400)
s, r = fech(caixa="Caixa 2", total_fita=500, maquineta_pix=0, maquineta_credito=0, maquineta_debito=0, despesas=[], dinheiro_contado=500)
chk("6: depois do estorno a fita pode ser registrada de novo", s, 200)

# 7) auditoria e seguranca
aud = db().execute("select acao, count(*) from auditoria where acao in ('fechamento_caixa','estorno_fechamento_caixa') group by acao").fetchall()
chk("7: auditoria do fechamento e do estorno", dict(aud).get("estorno_fechamento_caixa"), 2)
s, _ = call("POST", "/backend/v1/fechamento/estornar", {"id": fid1, "motivo": "sem login"}, None)
chk("7: estorno sem login recusado", s, [400, 401, 403])
s, _ = call("PATCH", f"/api/collections/fechamentos_caixa/records/{fid1}", {"estornado": True}, tok)
chk("7: fechamento continua imutavel pela API", s, [400, 403, 404])


# 8) categoria inativa recusada; despesas iguais ao dinheiro => esperado 0
s, ci = call("POST", "/api/collections/categorias/records", {"nome": "9.9 Inativa", "tipo": "despesa", "grupo_dre": "despesas_operacionais", "usuario_id": uid, "ativa": False}, tok)
s, _ = fech(numero_fita="8001", despesas=[{"descricao": "Categoria inativa", "categoria_id": ci["id"], "valor": 10}])
chk("8: categoria de despesa inativa recusada", s, 400)
s, ci2 = call("POST", "/api/collections/categorias/records", {"nome": "9.8 Receita inativa", "tipo": "receita", "grupo_dre": "receita_bruta", "usuario_id": uid, "ativa": False}, tok)
s, _ = fech(numero_fita="8002", categoria_id=ci2["id"])
chk("8: categoria de receita inativa recusada", s, 400)
s, r = fech(numero_fita="8003", total_fita=200, maquineta_pix=0, maquineta_credito=0, maquineta_debito=0, dinheiro_contado=0,
            despesas=[{"descricao": "Tudo em despesa", "categoria_id": c_d1, "valor": 200}])
chk("8: despesas = dinheiro recebido: aceito", s, 200)
chk("8: esperado na gaveta = 0", r.get("esperado_dinheiro"), 0)
chk("8: diferenca 0", r.get("diferenca"), 0)
s, r = fech(numero_fita="8004", total_fita=300, maquineta_pix=0, maquineta_credito=0, maquineta_debito=0, dinheiro_contado=285, despesas=[])
chk("8: contado menor: diferenca -15 registrada", r.get("diferenca"), -15)
n_dre = db().execute("select count(*) from lancamentos where fechamento_id=? and descricao like '%diferen%'", (r.get("id"),)).fetchone()[0]
chk("8: diferenca nao gera lancamento", n_dre, 0)


# 9) cargos: operador fecha mas nao estorna; leitura nao fecha
def novo_usuario(nome, papel, empresa=None):
    corpo = {"name": nome, "usuario": nome.lower(), "email": nome.lower() + "@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}
    s, u = call("POST", "/api/collections/users/records", corpo, tok)
    if s == 200:
        call("POST", f"/backend/v1/admin/usuarios/{u.get('id')}/role", {"role": papel, "empresa_id": empresa or eid}, tok)
    s2, j2 = call("POST", "/api/collections/users/auth-with-password", {"identity": nome.lower(), "password": "SenhaForte123"})
    return s, u, (j2.get("token") if s2 == 200 else None), (j2.get("record", {}) if s2 == 200 else {})


s, u, otok, orec = novo_usuario("Operador", "operador")
chk("9: operador criado", s, 200)
chk("9: operador herda a empresa", orec.get("empresa_id"), eid)
corpo_op = {"data": dia, "total_fita": 100, "caixa": "Caixa 3", "numero_fita": "7001", "categoria_id": c_rec, "conta": "Cofre", "maquineta_pix": 0, "maquineta_credito": 0, "maquineta_debito": 0, "dinheiro_contado": 100, "despesas": []}
s, rop = call("POST", "/api/collections/fechamentos_caixa/records", corpo_op, otok)
chk("9: operador pode fechar caixa", s, 200)
lop = lancs(rop.get("id"))
chk("9: responsavel do lancamento = operador", {x["usuario_id"] for x in lop}, {orec.get("id")})
s, _ = call("POST", "/backend/v1/fechamento/estornar", {"id": rop.get("id"), "motivo": "operador tenta estornar"}, otok)
chk("9: operador NAO pode estornar (servidor)", s, 403)
chk("9: nada foi estornado", db().execute("select estornado from fechamentos_caixa where id=?", (rop.get("id"),)).fetchone()[0], 0)

s, u, ltok, lrec = novo_usuario("Leitor", "leitura")
chk("9: leitor criado", s, 200)
corpo_op["numero_fita"] = "7002"
l_antes = n_lanc()
s, _ = call("POST", "/api/collections/fechamentos_caixa/records", corpo_op, ltok)
chk("9: leitura NAO pode fechar caixa", s, [400, 403])
chk("9: nada gravado pelo leitor", n_lanc(), l_antes)
s, _ = call("POST", "/backend/v1/fechamento/estornar", {"id": rop.get("id"), "motivo": "leitor tenta estornar"}, ltok)
chk("9: leitura NAO pode estornar", s, 403)

# 10) outra empresa nao estorna fechamento alheio
s, emp2 = call("POST", "/api/collections/empresas/records", {"nome": "Outra Empresa", "padrao": False, "usuario_id": uid}, tok)
chk("10: segunda empresa criada", s, 200)
s, u2, atok, arec = novo_usuario("Admoutra", "administrador", emp2.get("id"))
print("   admin da outra empresa:", s, arec.get("empresa_id") == emp2.get("id"), arec.get("role"))
if arec.get("empresa_id") == emp2.get("id") and arec.get("role") == "administrador":
    s, _ = call("POST", "/backend/v1/fechamento/estornar", {"id": rop.get("id"), "motivo": "outra empresa tenta"}, atok)
    chk("10: admin de outra empresa nao estorna fechamento alheio", s, 400)
    chk("10: fechamento alheio intacto", db().execute("select estornado from fechamentos_caixa where id=?", (rop.get("id"),)).fetchone()[0], 0)
else:
    print("   (nao foi possivel criar admin em outra empresa por esta via; a rota compara empresa do fechamento com a do usuario)")

# 11) concorrencia: 8 pedidos simultaneos da MESMA fita => exatamente 1 criado
import threading
res = []


def disparo(corpo, token):
    s_, r_ = call("POST", "/api/collections/fechamentos_caixa/records", corpo, token)
    res.append((s_, r_.get("id")))


corpo_c = {"data": dia, "total_fita": 1000, "caixa": "Caixa 1", "numero_fita": "5555", "categoria_id": c_rec, "conta": "Cofre",
           "maquineta_pix": 300, "maquineta_credito": 200, "maquineta_debito": 100, "dinheiro_contado": 350,
           "despesas": [{"descricao": "Compra de agua", "categoria_id": c_d1, "valor": 30}, {"descricao": "Cafe e coador", "categoria_id": c_d2, "valor": 20}]}
f_antes = n_fech()
ths = [threading.Thread(target=disparo, args=(corpo_c, tok)) for _ in range(8)]
[t.start() for t in ths]
[t.join() for t in ths]
criados = [x for x in res if x[0] == 200]
print("   respostas:", sorted(x[0] for x in res))
chk("11: exatamente 1 fechamento criado na corrida", len(criados), 1)
chk("11: so 1 registro novo no banco", n_fech() - f_antes, 1)
chk("11: so 6 lancamentos gerados (sem duplicar)", len(lancs(criados[0][1])) if criados else -1, 6)
chk("11: so 1 fechamento ativo da fita", db().execute("select count(*) from fechamentos_caixa where caixa='Caixa 1' and numero_fita='5555' and estornado=0").fetchone()[0], 1)

# 12) concorrencia no estorno: 6 pedidos simultaneos => 1 sucesso e 1 contra-lancamento
s, rr = fech(caixa="Caixa 9", numero_fita="6001", total_fita=400, maquineta_pix=0, maquineta_credito=0, maquineta_debito=0, dinheiro_contado=400, despesas=[])
fid_c = rr.get("id")
res.clear()


def disparo_est():
    s_, r_ = call("POST", "/backend/v1/fechamento/estornar", {"id": fid_c, "motivo": "corrida de estornos"}, tok)
    res.append((s_, r_.get("message")))


ths = [threading.Thread(target=disparo_est) for _ in range(6)]
[t.start() for t in ths]
[t.join() for t in ths]
print("   respostas:", sorted(x[0] for x in res))
chk("12: exatamente 1 estorno aceito na corrida", len([x for x in res if x[0] == 200]), 1)
chk("12: um unico contra-lancamento", db().execute("select count(*) from lancamentos where fechamento_id=? and estorno_de != ''", (fid_c,)).fetchone()[0], 1)

# 13) o fechamento nao pode ser alterado por nenhuma rota de escrita da API
for metodo in ("PATCH", "DELETE"):
    s, _ = call(metodo, f"/api/collections/fechamentos_caixa/records/{fid1}", {"estornado": True} if metodo == "PATCH" else None, tok)
    chk(f"13: {metodo} no fechamento recusado", s, [400, 403, 404])

print(f"=== RESUMO: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
