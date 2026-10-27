import datetime
import json
import random
import sqlite3
import string
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request

# Integridade do fechamento de caixa e do saldo inicial das contas (e-Audit rc.9, lote de integridade).
# Roda numa instancia ISOLADA e VAZIA, com um superusuario descartavel criado pelo rodar.sh.
B = sys.argv[1]
DB = sys.argv[2] + "/data.db"
falhas = 0


def call(m, p, b=None, t=None, h=None):
    r = urllib.request.Request(B + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    r.add_header("Content-Type", "application/json")
    if t:
        r.add_header("Authorization", t)
    for k, v in (h or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def chk(nome, obtido, esperado):
    global falhas
    ok = (obtido in esperado) if (isinstance(esperado, list) and not isinstance(obtido, list)) else obtido == esperado
    print(("OK    " if ok else "FALHA ") + f"{nome} | obtido: {obtido} | esperado: {esperado}")
    if not ok:
        falhas += 1


def db():
    return sqlite3.connect(DB, timeout=30)


def q1(sql, *a):
    return db().execute(sql, a).fetchone()[0]


def n_lanc():
    return q1("select count(*) from lancamentos")


hoje = (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).date()
dia = hoje.isoformat()
ontem = (hoje - datetime.timedelta(days=1)).isoformat()
amanha = (hoje + datetime.timedelta(days=1)).isoformat()
comp = dia[:7]

s, _ = call("POST", "/backend/v1/setup/administrador", {"name": "Dono", "usuario": "dono", "email": "dono@teste.com", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"})
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok, uid = j["token"], j["record"]["id"]
s, emp = call("POST", "/api/collections/empresas/records", {"nome": "Funeraria Teste", "padrao": True, "usuario_id": uid}, tok)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok = j["token"]
eid = j["record"]["empresa_id"]
s, js = call("POST", "/api/collections/_superusers/auth-with-password", {"identity": "su@teste.local", "password": "SenhaSuper12345"})
stok = js.get("token")
chk("superusuario de teste disponivel (rodar.sh cria)", bool(stok), True)


def cat(nome, tipo, grupo):
    s, c = call("POST", "/api/collections/categorias/records", {"nome": nome, "tipo": tipo, "grupo_dre": grupo, "usuario_id": uid, "ativa": True}, tok)
    assert s == 200, (nome, s, c)
    return c["id"]


c_rec = cat("1.1 Mensalidades de planos", "receita", "receita_bruta")
c_d1 = cat("4.4 Agua, energia, telefone e internet", "despesa", "despesas_operacionais")
c_d2 = cat("4.5 Manutencao e conservacao", "despesa", "despesas_operacionais")
for nome_c, tipo_c in [("Cofre", "caixa"), ("Itaú", "banco")]:
    s_c, r_c = call("POST", "/api/collections/contas/records", {"nome": nome_c, "tipo": tipo_c, "saldo_inicial": 0, "usuario_id": uid}, tok)
    assert s_c == 200, (nome_c, s_c, r_c)


def novo_usuario(nome, papel, empresa=None):
    corpo = {"name": nome, "usuario": nome.lower(), "email": nome.lower() + "@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}
    s, u = call("POST", "/api/collections/users/records", corpo, tok)
    if s == 200:
        call("POST", f"/backend/v1/admin/usuarios/{u.get('id')}/role", {"role": papel, "empresa_id": empresa or eid}, tok)
    s2, j2 = call("POST", "/api/collections/users/auth-with-password", {"identity": nome.lower(), "password": "SenhaForte123"})
    return s, (j2.get("token") if s2 == 200 else None), (j2.get("record", {}) if s2 == 200 else {})


contador = [0]


def fech(**kw):
    contador[0] += 1
    corpo = {"data": dia, "total_fita": 1000, "caixa": "Caixa 1", "numero_fita": f"I{contador[0]}", "categoria_id": c_rec, "conta": "Cofre",
             "maquineta_pix": 300, "maquineta_credito": 200, "maquineta_debito": 100, "dinheiro_contado": 350,
             "despesas": [{"descricao": "Compra de agua", "categoria_id": c_d1, "valor": 30},
                          {"descricao": "Cafe e coador", "categoria_id": c_d2, "valor": 20}]}
    corpo.update(kw)
    return call("POST", "/api/collections/fechamentos_caixa/records", corpo, tok)


def linhas(fid):
    con = db()
    con.row_factory = sqlite3.Row
    rows = con.execute("select * from lancamentos where fechamento_id=? order by created", (fid,)).fetchall()
    con.close()
    return [dict(r) for r in rows]


def originais(fid):
    return [r for r in linhas(fid) if not r["estorno_de"]]


def por_tipo(fid):
    d = {}
    for r in originais(fid):
        if r["tipo"] == "receita":
            d[r["descricao"].split(" - ")[-1]] = r
    return d


def snapshot(fid):
    return [(r["id"], r["valor"], r["status"], r["conta"], r["data_realizacao"], r["descricao"]) for r in originais(fid)]


def estornar(fid, motivo="fita lancada errada"):
    return call("POST", "/backend/v1/fechamento/estornar", {"id": fid, "motivo": motivo}, tok)


MSG_FECH = "gerada por um fechamento"

# ===== 1) linhas de fechamento nao se editam nem se estornam a mao =====
s, r = fech()
chk("1: fechamento A criado", s, 200)
fa = r.get("id")
pa = por_tipo(fa)
din_a, pix_a = pa["dinheiro"], pa["PIX"]
chk("1: 6 linhas geradas (3 receitas formas + dinheiro + 2 despesas)", len(originais(fa)), 6)
snap_a = snapshot(fa)

s, r = call("POST", f"/backend/v1/lancamentos/{din_a['id']}/editar", {"motivo": "tentativa de edicao", "valor": 399}, tok)
chk("1a: editar o dinheiro do fechamento pela edicao controlada: recusado (400, nao 500)", s, 400)
chk("1a: a mensagem manda estornar o fechamento", MSG_FECH in str(r.get("message")) and "estorne o fechamento" in str(r.get("message")), True)
s, r = call("POST", f"/backend/v1/lancamentos/{pix_a['id']}/editar", {"motivo": "tentativa de edicao", "valor": 301}, tok)
chk("1b: editar o PIX previsto do fechamento: recusado", s, 400)
s, r = call("PATCH", f"/api/collections/lancamentos/records/{din_a['id']}", {"descricao": "dinheiro alterado pelo superusuario"}, stok)
chk("1c: superusuario NAO edita linha de fechamento", s, 400)
chk("1c: a recusa cita o fechamento", MSG_FECH in str(r.get("message")), True)
s, r = call("PATCH", f"/api/collections/lancamentos/records/{pix_a['id']}", {"status": "estornado"}, stok)
chk("1d: superusuario NAO cancela previsto de fechamento por fora da rota de estorno", s, 400)
s, r = call("PATCH", f"/api/collections/lancamentos/records/{din_a['id']}", {"fechamento_id": ""}, stok)
chk("1d2: nem limpando o vinculo com o fechamento", s, 400)

# o vinculo com o fechamento e definido SO pelo servidor: lancamento criado a mao com fechamento_id e recusado
forja = {"tipo": "despesa", "descricao": "Despesa com vinculo forjado", "categoria": "4.4 Agua, energia, telefone e internet", "categoria_id": c_d1, "valor": 12, "competencia": comp, "data_lancamento": dia, "data_realizacao": dia, "status": "realizado", "conta": "Cofre", "fechamento_id": fa, "empresa_id": eid, "usuario_id": uid}
n0 = n_lanc()
s, r = call("POST", "/api/collections/lancamentos/records", forja, tok)
chk("1d3: criar lancamento com fechamento_id forjado recusado (usuario)", s, 400)
chk("1d3: a mensagem diz que o vinculo e so do servidor", "só pelo servidor" in str(r.get("message")), True)
s, r = call("POST", "/api/collections/lancamentos/records", dict(forja, fechamento_id="idinventado0001"), stok)
chk("1d4: nem o superusuario cria lancamento com fechamento_id", s, 400)
chk("1d3: nada gravado", n_lanc(), n0)

# controle: lancamento comum continua editavel e estornavel
s, comum = call("POST", "/api/collections/lancamentos/records", {"tipo": "receita", "descricao": "Receita comum", "categoria": "1.1 Mensalidades de planos", "categoria_id": c_rec, "valor": 80, "competencia": comp, "data_lancamento": dia, "data_realizacao": dia, "status": "realizado", "conta": "Itaú", "empresa_id": eid, "usuario_id": uid}, tok)
chk("1e: controle: lancamento comum criado", s, 200)
s, r = call("POST", f"/backend/v1/lancamentos/{comum.get('id')}/editar", {"motivo": "controle de regressao", "descricao": "Receita comum editada"}, tok)
chk("1e: controle: edicao controlada de lancamento comum funciona", s, 200)
s, r = call("PATCH", f"/api/collections/lancamentos/records/{comum.get('id')}", {"observacoes": "superusuario edita comum"}, stok)
chk("1e: controle: superusuario edita lancamento comum", s, 200)

estorno_corpo = lambda orig, valor: {"tipo": orig["tipo"], "descricao": "Estorno manual", "categoria": orig["categoria"], "categoria_id": orig["categoria_id"], "valor": valor, "competencia": orig["competencia"], "data_lancamento": dia, "data_realizacao": dia, "status": "realizado", "conta": orig["conta"], "estorno_de": orig["id"], "empresa_id": orig["empresa_id"], "usuario_id": uid}
n0 = n_lanc()
s, r = call("POST", "/api/collections/lancamentos/records", estorno_corpo(din_a, din_a["valor"]), tok)
chk("1f: estorno MANUAL do dinheiro do fechamento: recusado", s, 400)
chk("1f: a mensagem manda estornar o fechamento inteiro", "estorne o fechamento" in str(r.get("message")), True)
s, r = call("POST", "/api/collections/lancamentos/records", estorno_corpo(din_a, din_a["valor"]), stok)
chk("1g: superusuario tambem NAO estorna a mao linha de fechamento", s, 400)
chk("1g: nada gravado nas recusas", n_lanc(), n0)
comum_row = db().execute("select tipo, categoria, categoria_id, competencia, conta, empresa_id, valor, id from lancamentos where id=?", (comum.get("id"),)).fetchone()
orig_c = {"tipo": comum_row[0], "categoria": comum_row[1], "categoria_id": comum_row[2], "competencia": comum_row[3], "conta": comum_row[4], "empresa_id": comum_row[5], "id": comum_row[7]}
s, r = call("POST", "/api/collections/lancamentos/records", estorno_corpo(orig_c, comum_row[6]), tok)
chk("1h: controle: estorno manual de lancamento comum continua funcionando", s, 200)
chk("1i: as linhas do fechamento A continuam exatamente como nasceram", snapshot(fa), snap_a)

# ===== 2) estorno do fechamento sem estorno em dobro (legado: estorno manual feito antes da protecao) =====
con = db()
con.row_factory = sqlite3.Row
row = dict(con.execute("select * from lancamentos where id=?", (din_a["id"],)).fetchone())
con.close()
novo_id = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(15))
row.update({"id": novo_id, "descricao": "[ESTORNO] dinheiro feito a mao (legado)", "estorno_de": din_a["id"], "fechamento_id": "", "created": "2026-01-01 10:00:00.000Z", "updated": "2026-01-01 10:00:00.000Z", "data_realizacao": dia, "data_lancamento": dia})
con = db()
cols = list(row.keys())
con.execute(f"insert into lancamentos ({','.join(cols)}) values ({','.join('?' for _ in cols)})", [row[c] for c in cols])
con.commit()
con.close()
chk("2: (legado simulado) o dinheiro de A ja tem um estorno manual", q1("select count(*) from lancamentos where estorno_de=?", din_a["id"]), 1)
n_antes = n_lanc()
s, r = estornar(fa)
chk("2: estornar o fechamento A funciona", s, 200)
chk("2: o resumo conta 1 linha ja estornada", r.get("ja_estornados"), 1)
chk("2: a mensagem avisa das linhas ja estornadas", "já tinham sido estornadas" in str(r.get("message")), True)
chk("2: o dinheiro NAO foi estornado em dobro (continua 1 estorno)", q1("select count(*) from lancamentos where estorno_de=?", din_a["id"]), 1)
desp_a = [x for x in originais(fa) if x["tipo"] == "despesa"]
chk("2: cada despesa do caixa ganhou exatamente 1 estorno", sorted(q1("select count(*) from lancamentos where estorno_de=?", x["id"]) for x in desp_a), [1, 1])
chk("2: os 3 previstos viraram estornado", sorted(x["status"] for x in originais(fa) if x["status"] != "realizado"), ["estornado"] * 3)
chk("2: 2 estornos novos criados (so as despesas)", n_lanc() - n_antes, 2)
chk("2: fechamento A marcado como estornado", q1("select estornado from fechamentos_caixa where id=?", fa), 1)
aud = db().execute("select detalhes, referencia_id from auditoria where acao='estorno_fechamento_caixa' and referencia_id=?", (fa,)).fetchall()
chk("2: auditoria do estorno gravada 1 vez, com ja_estornados=1", (len(aud), json.loads(aud[0][0]).get("ja_estornados") if aud else None), (1, 1))
est_a = db().execute("select fechamento_id, conta, estorno_de from lancamentos where fechamento_id=? and estorno_de!=''", (fa,)).fetchall()
chk("2: estornos novos mantem o vinculo com o fechamento e a conta Cofre", {(x[0], x[1]) for x in est_a}, {(fa, "Cofre")})
s, r = estornar(fa, "de novo")
chk("2: estornar de novo o mesmo fechamento recusado", s, 400)

# ===== 3) concorrencia: oito pedidos iguais, um unico estorno =====
s, r = fech(caixa="Caixa 2")
fb = r.get("id")
res = []


def disparo():
    res.append(estornar(fb, "disparo concorrente")[0])


ths = [threading.Thread(target=disparo) for _ in range(8)]
for t in ths:
    t.start()
for t in ths:
    t.join()
chk("3: oito estornos simultaneos: exatamente 1 aceito", sorted(res).count(200), 1)
ids_b = [x["id"] for x in originais(fb)]
tot_est = sum(q1("select count(*) from lancamentos where estorno_de=?", i) for i in ids_b)
chk("3: so 3 contra-lancamentos existem (dinheiro + 2 despesas), nenhum em dobro", tot_est, 3)
chk("3: uma unica auditoria de estorno do fechamento", q1("select count(*) from auditoria where acao='estorno_fechamento_caixa' and referencia_id=?", fb), 1)

# ===== 4) fechamento com baixa nao se estorna (regra mantida) =====
s, r = fech(caixa="Caixa 3")
fc = r.get("id")
pc = por_tipo(fc)
pix_c = pc["PIX"]
s, r = call("POST", "/api/collections/lancamentos/records", {"tipo": "receita", "descricao": pix_c["descricao"], "categoria": pix_c["categoria"], "categoria_id": pix_c["categoria_id"], "valor": pix_c["valor"], "competencia": pix_c["competencia"], "data_lancamento": dia, "data_realizacao": dia, "status": "realizado", "conta": "Itaú", "liquidacao_de": pix_c["id"], "empresa_id": eid, "usuario_id": uid}, tok)
chk("4: baixa do PIX do fechamento C funciona (Receber)", s, 200)
n_antes = n_lanc()
snap_c = snapshot(fc)
s, r = estornar(fc)
chk("4: estorno do fechamento com PIX ja baixado: recusado", s, 400)
chk("4: a mensagem fala do recebimento baixado", "baixado" in str(r.get("message")), True)
chk("4: nada foi estornado nem criado", (n_lanc(), snapshot(fc), q1("select estornado from fechamentos_caixa where id=?", fc)), (n_antes, snap_c, 0))

# ===== 5) falha no meio da operacao: nada fica pela metade =====
s, r = fech(caixa="Caixa 4")
fd = r.get("id")
snap_d = snapshot(fd)
n_antes = n_lanc()
con = db()
con.execute("CREATE TRIGGER falha_teste_auditoria BEFORE INSERT ON auditoria WHEN NEW.acao = 'estorno_fechamento_caixa' BEGIN SELECT RAISE(ABORT, 'falha injetada'); END")
con.commit()
con.close()
s, r = estornar(fd)
chk("5: falha na auditoria => estorno recusado (nao 200)", s != 200, True)
chk("5: falha na auditoria => NADA criado nem alterado (sem estorno pela metade)", (n_lanc(), snapshot(fd), q1("select estornado from fechamentos_caixa where id=?", fd)), (n_antes, snap_d, 0))
con = db()
con.execute("DROP TRIGGER falha_teste_auditoria")
con.commit()
con.close()
s, r = estornar(fd)
chk("5: sem a falha, o estorno funciona", s, 200)
est_d = db().execute("select e.estorno_de, e.fechamento_id, e.conta, e.valor from lancamentos e where e.fechamento_id=? and e.estorno_de!=''", (fd,)).fetchall()
orig_d = {x["id"]: x for x in originais(fd)}
chk("5: vinculos preservados: cada estorno aponta para uma linha do fechamento, mesmo valor e conta", all(x[0] in orig_d and x[1] == fd and x[2] == "Cofre" and abs(x[3] - orig_d[x[0]]["valor"]) < 0.001 for x in est_d) and len(est_d) == 3, True)
chk("5: as linhas originais continuam intactas (so o previsto virou estornado)", [(x["valor"], x["conta"]) for x in originais(fd)], [(x[1], x[3]) for x in [(a[0], a[1], a[2], a[3]) for a in snap_d]])
chk("5: auditoria do estorno gravada", q1("select count(*) from auditoria where acao='estorno_fechamento_caixa' and referencia_id=?", fd), 1)

# ===== 6) data futura =====
n_antes = n_lanc()
f_antes = q1("select count(*) from fechamentos_caixa")
s, r = fech(data=amanha)
chk("6: fechamento com data de amanha recusado", s, 400)
chk("6: a mensagem cita data futura", "futura" in str(r.get("message")), True)
s, r = fech(data="2026-02-31")
chk("6: fechamento com data inexistente (31/02) recusado", s, 400)
chk("6: nada gravado nas recusas", (n_lanc(), q1("select count(*) from fechamentos_caixa")), (n_antes, f_antes))
s, r = fech(data=ontem, caixa="Caixa 5")
chk("6: fechamento de ontem aceito", s, 200)
chk("6: dinheiro realizado com a data de ontem", sorted({str(x["data_realizacao"])[:10] for x in originais(r.get("id")) if x["status"] == "realizado"}), [ontem])
base = {"tipo": "receita", "descricao": "Realizado direto", "categoria": "1.1 Mensalidades de planos", "categoria_id": c_rec, "valor": 5, "competencia": comp, "data_lancamento": dia, "status": "realizado", "conta": "Cofre", "empresa_id": eid, "usuario_id": uid}
s, r = call("POST", "/api/collections/lancamentos/records", dict(base, data_realizacao=amanha), stok)
chk("6: rota interna (superusuario nao passa pelo gancho de requisicao): realizado com data futura recusado pelo gancho de modelo", s, 400)
chk("6: a mensagem cita data futura", "data futura" in str(r.get("message")), True)
s, r = call("POST", "/api/collections/lancamentos/records", dict(base, data_realizacao=ontem), stok)
chk("6: controle: realizado com data passada pelo mesmo caminho aceito", s, 200)
s, r2 = call("POST", "/api/collections/lancamentos/records", dict(base, status="previsto", data_realizacao="", data_vencimento=amanha, conta=""), stok)
chk("6: controle: PREVISTO com vencimento futuro aceito", s, 200)
s, r3 = call("POST", "/api/collections/lancamentos/records", dict(base, descricao="Realizado para o teste de atualizacao", data_realizacao=ontem), stok)
rid = r3.get("id")
s, r = call("PATCH", f"/api/collections/lancamentos/records/{rid}", {"data_realizacao": amanha}, stok)
chk("6: ATUALIZAR um realizado para data futura (rota interna) recusado pelo gancho de modelo", s, 400)
s, r = call("PATCH", f"/api/collections/lancamentos/records/{rid}", {"observacoes": "controle sem mexer na data"}, stok)
chk("6: controle: atualizar sem mexer na data continua funcionando", s, 200)

# fechamento em modo conferencia (sem categoria): campos reservados do cliente sao descartados (sem 'fechamento fantasma')
conf = {"data": dia, "total_fita": 0, "dinheiro_contado": 10, "maquineta_pix": 0, "maquineta_credito": 0, "maquineta_debito": 0, "caixa": "Caixa 9", "numero_fita": "9999", "estornado": True, "conta": "Cofre"}
conf.pop("total_fita")
s, r = call("POST", "/api/collections/fechamentos_caixa/records", conf, tok)
chk("6: modo conferencia (sem categoria) aceito", s, 200)
fx = db().execute("select caixa, numero_fita, estornado, conta, categoria_id from fechamentos_caixa where id=?", (r.get("id"),)).fetchone() if r.get("id") else None
chk("6: caixa, fita, conta, categoria e estorno do cliente foram descartados", (fx[0], fx[1], fx[2], fx[3], fx[4]) if fx else None, ("", "", 0, "", ""))
s, r = fech(caixa="Caixa 9", numero_fita="9999")
chk("6: a fita 9999 do Caixa 9 continua livre para o fechamento de verdade", s, 200)

# ===== 7) saldo inicial: data de corte e trilha de auditoria =====
def conta_row(nome):
    con = db()
    con.row_factory = sqlite3.Row
    r = con.execute("select * from contas where nome=?", (nome,)).fetchone()
    con.close()
    return dict(r) if r else None


def audits_conta(cid):
    con = db()
    rows = con.execute("select detalhes, descricao from auditoria where acao='saldo_inicial_conta' and referencia_id=? order by created", (cid,)).fetchall()
    con.close()
    return [(json.loads(a), b) for a, b in rows]


s, r = call("POST", "/api/collections/contas/records", {"nome": "Sicredi", "tipo": "banco", "saldo_inicial": 1000, "usuario_id": uid}, tok)
chk("7: conta criada com saldo inicial 1000 e sem data informada", s, 200)
cs = conta_row("Sicredi")
chk("7: a data de corte assume hoje", str(cs["saldo_inicial_data"])[:10], dia)
au = audits_conta(cs["id"])
chk("7: a criacao com saldo diferente de zero foi auditada", (len(au), au[0][0].get("saldo_novo") if au else None, au[0][0].get("motivo") if au else None), (1, 1000, "Criação da conta"))
con = db()
con.execute("CREATE TRIGGER falha_teste_auditoria BEFORE INSERT ON auditoria WHEN NEW.acao = 'saldo_inicial_conta' BEGIN SELECT RAISE(ABORT, 'falha injetada'); END")
con.commit()
con.close()
s, r = call("POST", "/api/collections/contas/records", {"nome": "ComFalhaDeAuditoria", "tipo": "banco", "saldo_inicial": 5, "usuario_id": uid}, tok)
chk("7: falha na auditoria da CRIACAO: a conta nao fica gravada sem trilha (atomico)", (s != 200, conta_row("ComFalhaDeAuditoria")), (True, None))
con = db()
con.execute("DROP TRIGGER falha_teste_auditoria")
con.commit()
con.close()
s, r = call("POST", "/api/collections/contas/records", {"nome": "Bradesco", "tipo": "banco", "saldo_inicial": 0, "usuario_id": uid}, tok)
chk("7: conta com saldo zero criada", s, 200)
chk("7: saldo zero nao gera auditoria", len(audits_conta(conta_row("Bradesco")["id"])), 0)
n_c = q1("select count(*) from contas")
s, r = call("POST", "/api/collections/contas/records", {"nome": "Futura", "tipo": "banco", "saldo_inicial": 10, "saldo_inicial_data": amanha, "usuario_id": uid}, tok)
chk("7: criar conta com data de corte futura recusado", s, 400)
chk("7: nada gravado na recusa da data futura", q1("select count(*) from contas"), n_c)
s, r = call("POST", "/api/collections/contas/records", {"nome": "Invalida", "tipo": "banco", "saldo_inicial": 10, "saldo_inicial_data": "2026-02-31", "usuario_id": uid}, tok)
ci = conta_row("Invalida")
chk("7: data de corte inexistente (31/02) nunca e gravada como digitada (PocketBase a esvazia: recusada ou vira hoje)", (s == 400) or (s == 200 and str(ci["saldo_inicial_data"])[:10] == dia), True)
s, r = call("POST", "/api/collections/contas/records", {"nome": "Restaurada", "tipo": "banco", "saldo_inicial": 50, "usuario_id": uid}, tok, {"X-Restauracao-Backup": "1"})
chk("7: restauracao de backup (administrador) cria conta sem data de corte", (s, str(conta_row("Restaurada")["saldo_inicial_data"] or "")[:10]), (200, ""))

s, r = call("PATCH", f"/api/collections/contas/records/{cs['id']}", {"saldo_inicial": 2000}, tok)
chk("7: alterar o saldo inicial pela API comum recusado", s, 400)
chk("7: a mensagem aponta a funcao Alterar saldo inicial", "Alterar saldo inicial" in str(r.get("message")), True)
s, r = call("PATCH", f"/api/collections/contas/records/{cs['id']}", {"saldo_inicial_data": ontem}, tok)
chk("7: alterar so a data de corte pela API comum recusado", s, 400)
s, r = call("PATCH", f"/api/collections/contas/records/{cs['id']}", {"saldo_inicial": 2000}, stok)
chk("7: superusuario tambem nao altera o saldo inicial pela API", s, 400)
s, r = call("PATCH", f"/api/collections/contas/records/{conta_row('Bradesco')['id']}", {"nome": "Bradesco PJ"}, tok)
chk("7: controle: renomear conta sem movimento continua funcionando", s, 200)
chk("7: saldo inicial intacto depois das recusas", (conta_row("Sicredi")["saldo_inicial"], str(conta_row("Sicredi")["saldo_inicial_data"])[:10]), (1000, dia))

rota = lambda corpo, token=tok: call("POST", "/backend/v1/conta/saldo-inicial", corpo, token)
s, _ = rota({"id": cs["id"], "valor": 1, "data_corte": dia, "motivo": "sem login"}, None)
chk("7: rota sem login recusada", s, [400, 401])
s, otok, orec = novo_usuario("Operador", "operador")
s, ltok, lrec = novo_usuario("Leitor", "leitura")
s, _ = rota({"id": cs["id"], "valor": 1, "data_corte": dia, "motivo": "operador tenta"}, otok)
chk("7: operador NAO altera o saldo inicial (servidor)", s, 403)
s, _ = rota({"id": cs["id"], "valor": 1, "data_corte": dia, "motivo": "leitor tenta"}, ltok)
chk("7: leitura NAO altera o saldo inicial (servidor)", s, 403)
s, r = rota({"id": cs["id"], "valor": 1500.5, "data_corte": ontem, "motivo": "ab"})
chk("7: motivo curto recusado", s, 400)
s, r = rota({"id": cs["id"], "valor": "abc", "data_corte": ontem, "motivo": "valor invalido"})
chk("7: valor que nao e numero recusado", s, 400)
s, r = rota({"id": cs["id"], "valor": 10, "data_corte": amanha, "motivo": "data futura"})
chk("7: data de corte futura recusada", s, 400)
s, r = rota({"id": cs["id"], "valor": 10, "data_corte": "2026-02-31", "motivo": "data inexistente"})
chk("7: data de corte inexistente recusada", s, 400)
s, r = rota({"id": cs["id"], "valor": 10, "motivo": "sem data de corte"})
chk("7: sem data de corte recusado", s, 400)
s, r = rota({"id": "naoexiste12345", "valor": 10, "data_corte": ontem, "motivo": "conta inexistente"})
chk("7: conta inexistente recusada", s, 400)
chk("7: nada mudou nas recusas (nem auditoria nova)", (conta_row("Sicredi")["saldo_inicial"], len(audits_conta(cs["id"]))), (1000, 1))
s, r = rota({"id": cs["id"], "valor": 1500.5, "data_corte": ontem, "motivo": "Saldo conferido no extrato"})
chk("7: administrador altera o saldo inicial", s, 200)
chk("7: saldo e data de corte gravados", (conta_row("Sicredi")["saldo_inicial"], str(conta_row("Sicredi")["saldo_inicial_data"])[:10]), (1500.5, ontem))
au = audits_conta(cs["id"])
d = au[-1][0] if au else {}
chk("7: auditoria com valor anterior, novo, data anterior, nova, motivo e quem", (len(au), d.get("saldo_anterior"), d.get("saldo_novo"), d.get("data_corte_anterior"), d.get("data_corte_nova"), d.get("motivo"), d.get("usuario_id")), (2, 1000, 1500.5, dia, ontem, "Saldo conferido no extrato", uid))
s, r = rota({"id": cs["id"], "valor": 1500.5, "data_corte": ontem, "motivo": "igual ao atual"})
chk("7: repetir o mesmo valor e data recusado (nada mudou)", s, 400)
s, r = rota({"id": cs["id"], "valor": -200, "data_corte": ontem, "motivo": "conta no cheque especial"})
chk("7: saldo inicial negativo aceito (conta no limite)", s, 200)

con = db()
con.execute("CREATE TRIGGER falha_teste_auditoria BEFORE INSERT ON auditoria WHEN NEW.acao = 'saldo_inicial_conta' BEGIN SELECT RAISE(ABORT, 'falha injetada'); END")
con.commit()
con.close()
s, r = rota({"id": cs["id"], "valor": 777, "data_corte": ontem, "motivo": "com falha de auditoria"})
chk("7: falha na auditoria => alteracao recusada", s != 200, True)
chk("7: falha na auditoria => saldo inicial NAO mudou", conta_row("Sicredi")["saldo_inicial"], -200)
con = db()
con.execute("DROP TRIGGER falha_teste_auditoria")
con.commit()
con.close()

s, emp2 = call("POST", "/api/collections/empresas/records", {"nome": "Outra Empresa", "padrao": False, "usuario_id": uid}, tok)
s, atok, arec = novo_usuario("Admoutra", "administrador", emp2.get("id"))
if arec.get("empresa_id") == emp2.get("id") and arec.get("role") == "administrador":
    s, r = rota({"id": cs["id"], "valor": 1, "data_corte": ontem, "motivo": "outra empresa tenta"}, atok)
    chk("7: administrador de OUTRA empresa nao altera a conta (mensagem generica)", (s, conta_row("Sicredi")["saldo_inicial"]), (400, -200))
else:
    chk("7: administrador da outra empresa disponivel para o teste", False, True)

# ===== 8) legado: depositos continuam funcionando sobre linhas geradas por fechamento (com as protecoes ligadas) =====
c_taxa = cat("5.7 Taxas de maquineta e cartao", "despesa", "despesa_financeira")
s, _ = call("POST", "/api/collections/permissoes/records", {"chave": "categoria_taxa_id", "valor": c_taxa}, tok)
chk("8: categoria da taxa configurada", s, 200)
s, r = fech(caixa="Caixa 6", maquineta_pix=300, maquineta_credito=0, maquineta_debito=100, total_fita=900, dinheiro_contado=500,
            despesas=[{"descricao": "Compra de agua", "categoria_id": c_d1, "valor": 50}])
fe = r.get("id")
pe = por_tipo(fe)
chk("8: fechamento E criado com PIX e debito previstos", (s, pe["PIX"]["status"], pe["cartão de débito"]["status"]), (200, "previsto", "previsto"))
corpo_dep = {"chave": "k8" + "".join(random.choice(string.ascii_lowercase) for _ in range(12)), "data_deposito": dia, "conta": "Itaú",
             "titulos": [pe["PIX"]["id"], pe["cartão de débito"]["id"]], "linhas": [{"rotulo": "Extrato Itau", "valor": 395}], "bruto_conferido": 400}
s, r = call("POST", "/backend/v1/deposito/registrar", corpo_dep, tok)
chk("8: deposito sobre as linhas do fechamento aceito (bruto 400, caiu 395, taxa 5)", (s, r.get("bruto"), r.get("liquido"), r.get("taxa")), (200, 400, 395, 5))
chk("8: os dois previstos do fechamento receberam baixa pelo bruto", q1("select count(*) from lancamentos where liquidacao_de in (?,?) and status='realizado'", pe["PIX"]["id"], pe["cartão de débito"]["id"]), 2)
chk("8: as linhas originais do fechamento continuam intactas (previsto segue previsto)", [(x["valor"], x["status"]) for x in originais(fe) if x["tipo"] == "receita" and x["status"] != "realizado"], [(300, "previsto"), (100, "previsto")])
s, r = estornar(fe)
chk("8: fechamento com PIX/debito baixados pelo deposito nao se estorna", s, 400)
n_antes = n_lanc()
s, r = call("POST", f"/backend/v1/lancamentos/{pe['PIX']['id']}/editar", {"motivo": "tentativa de edicao", "valor": 301}, tok)
chk("8: previsto baixado do fechamento nao se edita", s, 400)
chk("8: nada mudou", n_lanc(), n_antes)

print(f"RESUMO: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
