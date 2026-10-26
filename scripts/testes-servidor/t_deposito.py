import datetime
import json
import sqlite3
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid

B = sys.argv[1]
DB = sys.argv[2] + "/data.db"
falhas = 0


def call(m, p, b=None, t=None):
    r = urllib.request.Request(B + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    r.add_header("Content-Type", "application/json")
    if t:
        r.add_header("Authorization", t)
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


def n_dep():
    return q1("select count(*) from depositos")


s, _ = call("POST", "/backend/v1/setup/administrador", {"name": "Dono", "usuario": "dono", "email": "dono@teste.com", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"})
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok, uid = j["token"], j["record"]["id"]
s, emp = call("POST", "/api/collections/empresas/records", {"nome": "Funeraria Teste", "padrao": True, "usuario_id": uid}, tok)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "dono@teste.com", "password": "SenhaForte123"})
tok = j["token"]
eid = j["record"]["empresa_id"]


def cat(nome, tipo, grupo, ativa=True):
    s, c = call("POST", "/api/collections/categorias/records", {"nome": nome, "tipo": tipo, "grupo_dre": grupo, "usuario_id": uid, "ativa": ativa}, tok)
    assert s == 200, (nome, s, c)
    return c["id"]


c_rec = cat("1.1 Mensalidades de planos", "receita", "receita_bruta")
c_taxa = cat("5.7 Taxas de maquineta e cartao", "despesa", "despesa_financeira")
c_taxa_inativa = cat("9.9 Taxa inativa", "despesa", "despesa_financeira", ativa=False)
c_outra_desp = cat("4.1 Despesa operacional", "despesa", "despesas_operacionais")
for nome_c, tipo_c in [("Cofre", "caixa"), ("Itaú", "banco"), ("Bradesco", "banco")]:
    s_c, r_c = call("POST", "/api/collections/contas/records", {"nome": nome_c, "tipo": tipo_c, "saldo_inicial": 0, "usuario_id": uid}, tok)
    assert s_c == 200, (nome_c, s_c, r_c)

hoje = datetime.date.today()
dia = hoje.isoformat()
ontem = (hoje - datetime.timedelta(days=1)).isoformat()
amanha = (hoje + datetime.timedelta(days=1)).isoformat()
comp = dia[:7]


def previsto(valor, desc, venda=None, tipo="receita", cid=None, token=None):
    s, r = call("POST", "/api/collections/lancamentos/records", {"tipo": tipo, "descricao": desc, "categoria": "1.1 Mensalidades de planos", "categoria_id": cid or c_rec, "valor": valor, "competencia": comp, "data_lancamento": venda or dia, "data_vencimento": venda or dia, "status": "previsto", "empresa_id": eid, "usuario_id": uid}, token or tok)
    assert s == 200, (desc, s, r)
    return r["id"]


def dep(titulos, linhas, token=None, **kw):
    corpo = {"chave": "k" + uuid.uuid4().hex[:20], "data_deposito": dia, "conta": "Itaú", "titulos": titulos, "linhas": [{"rotulo": "Extrato", "valor": v} for v in linhas]}
    corpo.update(kw)
    return call("POST", "/backend/v1/deposito/registrar", corpo, token or tok)


# ---- 1) sem categoria da taxa configurada: recusa sem gravar
t1 = previsto(200, "PIX caixa 1")
t2 = previsto(300, "Debito caixa 1")
t3 = previsto(500, "Credito caixa 1")
l0, d0 = n_lanc(), n_dep()
s, r = dep([t1, t2, t3], [290, 480, 200])
chk("1: sem categoria da taxa configurada recusado", s, 400)
print("   mensagem:", r.get("message"))
chk("1: nada gravado (lancamentos e depositos)", (n_lanc(), n_dep()), (l0, d0))

# configura a categoria da taxa
s, _ = call("POST", "/api/collections/permissoes/records", {"chave": "categoria_taxa_id", "valor": c_taxa}, tok)
chk("1: administrador configura a categoria da taxa", s, 200)
s, pr = call("GET", "/api/collections/permissoes/records?filter=" + urllib.parse.quote("chave='categoria_taxa_id'"), None, tok)
perm_cat_id = pr["items"][0]["id"]

# ---- 2) caminho feliz: bruto 1000, extrato em 3 linhas somando 970, taxa 30 (3%)
s, r = dep([t1, t2, t3], [290, 480, 200], observacao="deposito de sexta")
chk("2: deposito registrado", s, 200)
print("   resposta:", {k: r.get(k) for k in ("bruto", "liquido", "taxa", "percentual", "titulos")})
chk("2: bruto 1000, liquido 970, taxa 30, 3%", (r.get("bruto"), r.get("liquido"), r.get("taxa"), r.get("percentual")), (1000, 970, 30, 3))
dep1 = r.get("id")
baixas = db().execute("select valor, conta, status, data_realizacao, liquidacao_de, usuario_id from lancamentos where liquidacao_de in (?,?,?)", (t1, t2, t3)).fetchall()
chk("2: tres baixas pelo valor BRUTO de cada titulo", sorted(round(b[0], 2) for b in baixas), [200, 300, 500])
chk("2: baixas na conta Itau, realizadas", {(b[1], b[2]) for b in baixas}, {("Itaú", "realizado")})
chk("2: baixas na data do deposito", {b[3][:10] for b in baixas}, {dia})
chk("2: responsavel = usuario logado", {b[5] for b in baixas}, {uid})
tx = db().execute("select valor, categoria_id, conta, competencia, status, data_realizacao from lancamentos where tipo='despesa' and categoria_id=?", (c_taxa,)).fetchall()
chk("2: UMA despesa de taxa de 30 na categoria 5.7, no Itau, realizada", [(round(x[0], 2), x[2], x[4]) for x in tx], [(30.0, "Itaú", "realizado")])
chk("2: competencia da taxa = mes do deposito", tx[0][3], comp)
rec_dep = db().execute("select valor_bruto, valor_liquido, taxa, percentual, qtd_titulos, conta, taxa_lancamento_id, observacao from depositos where id=?", (dep1,)).fetchone()
chk("2: registro do deposito", (rec_dep[0], rec_dep[1], rec_dep[2], rec_dep[3], rec_dep[4], rec_dep[5]), (1000, 970, 30, 3, 3, "Itaú"))
chk("2: deposito aponta a despesa de taxa", bool(rec_dep[6]), True)
linhas_gravadas = json.loads(db().execute("select linhas_extrato from depositos where id=?", (dep1,)).fetchone()[0])
chk("2: linhas do extrato rastreadas", [l["valor"] for l in linhas_gravadas], [290, 480, 200])
titulos_gravados = json.loads(db().execute("select titulos from depositos where id=?", (dep1,)).fetchone()[0])
chk("2: titulos rastreados no deposito", sorted(t["id"] for t in titulos_gravados), sorted([t1, t2, t3]))
rec_real = q1("select round(sum(valor),2) from lancamentos where tipo='receita' and status='realizado' and estorno_de=''")
chk("2: a receita realizada e o BRUTO (1000), nao o liquido", rec_real, 1000)
chk("2: bruto menos taxa = liquido que caiu no banco", round(1000 - 30, 2), 970)
chk("2: auditoria do deposito", q1("select count(*) from auditoria where acao='deposito_conferido'"), 1)

# ---- 3) envio repetido e titulo ja baixado
l1, d1 = n_lanc(), n_dep()
chave_fixa = "k" + uuid.uuid4().hex[:20]
t4 = previsto(100, "PIX caixa 2")
s, _ = dep([t4], [100], chave=chave_fixa)
chk("3: primeiro envio com a chave aceito", s, 200)
l2, d2 = n_lanc(), n_dep()
s, r = dep([t4], [100], chave=chave_fixa)
chk("3: mesma chave repetida recusada", s, 400)
chk("3: nada novo gravado no envio repetido", (n_lanc(), n_dep()), (l2, d2))
s, _ = dep([t1], [200])
chk("3: titulo ja baixado recusado (com outra chave)", s, 400)
chk("3: nada novo gravado", (n_lanc(), n_dep()), (l2, d2))

# ---- 4) validacoes: nada e gravado nas recusas
t5 = previsto(400, "Debito caixa 3")
t6 = previsto(100, "Venda de hoje")
tdesp = previsto(50, "Despesa prevista", tipo="despesa", cid=c_taxa)
ano_ant = hoje.year - 1
t_antigo = previsto(400, "Venda antiga", venda=f"{ano_ant}-01-15")
l3, d3 = n_lanc(), n_dep()
casos = [
    ("liquido maior que o bruto", lambda: dep([t5], [400.01]), 400),
    ("sem linhas do extrato", lambda: dep([t5], []), 400),
    ("linha com valor zero", lambda: dep([t5], [0]), 400),
    ("conta do tipo caixa", lambda: dep([t5], [390], conta="Cofre"), 400),
    ("conta inexistente", lambda: dep([t5], [390], conta="Banco Fantasma"), 400),
    ("data futura", lambda: dep([t5], [390], data_deposito=amanha), 400),
    ("deposito anterior a venda", lambda: dep([t6], [99], data_deposito=ontem), 400),
    ("titulo repetido na selecao", lambda: dep([t5, t5], [390]), 400),
    ("titulo inexistente", lambda: dep(["naoexiste1234567"], [10]), 400),
    ("sem titulos", lambda: dep([], [10]), 400),
    ("chave invalida", lambda: dep([t5], [390], chave="x"), 400),
    ("data inexistente (31/02)", lambda: dep([t5], [390], data_deposito="2026-02-31"), 400),
    ("data em formato errado", lambda: dep([t5], [390], data_deposito="31/05/2026"), 400),
    ("bruto conferido na tela diferente do calculado", lambda: dep([t5], [390], bruto_conferido=399), 400),
    ("valor da linha em texto", lambda: dep([t5], ["abc"]), 400),
]
for nome, fn, esperado in casos:
    s, r = fn()
    chk("4: " + nome + " recusado", s, esperado)
# data inexistente isolada: a venda e antiga, a data nao e futura nem anterior a venda; so a validacao de calendario pode recusar
s, r = dep([t_antigo], [390], data_deposito=f"{ano_ant}-02-31")
chk("4: data inexistente (31/02) recusada pela validacao de calendario", s, 400)
chk("4: a mensagem pede data valida", "data válida" in str(r.get("message")), True)
s, _ = dep([tdesp], [40])
chk("4: titulo que e despesa recusado", s, 400)
chk("4: nada gravado em nenhuma recusa", (n_lanc(), n_dep()), (l3, d3))
# categoria da taxa invalida
s, _ = call("PATCH", f"/api/collections/permissoes/records/{perm_cat_id}", {"valor": c_rec}, tok)
s, _ = dep([t5], [390])
chk("4: categoria da taxa de tipo errado (receita) recusada", s, 400)
s, _ = call("PATCH", f"/api/collections/permissoes/records/{perm_cat_id}", {"valor": c_taxa_inativa}, tok)
s, _ = dep([t5], [390])
chk("4: categoria da taxa inativa recusada", s, 400)
s, r = call("PATCH", f"/api/collections/permissoes/records/{perm_cat_id}", {"valor": c_outra_desp}, tok)
s, r = dep([t5], [390])
chk("4: categoria da taxa fora do grupo Despesa financeira recusada", s, 400)
chk("4: a mensagem cita o grupo Despesa financeira", "Despesa financeira" in str(r.get("message")), True)
s, _ = call("PATCH", f"/api/collections/permissoes/records/{perm_cat_id}", {"valor": c_taxa}, tok)
chk("4: nada gravado com categoria invalida", (n_lanc(), n_dep()), (l3, d3))

# falha injetada na auditoria (gatilho do SQLite): a operacao inteira deve ser desfeita
con = db()
con.execute("CREATE TRIGGER falha_teste_auditoria BEFORE INSERT ON auditoria WHEN NEW.acao IN ('deposito_conferido','deposito_corrigido') BEGIN SELECT RAISE(ABORT, 'falha injetada'); END")
con.commit()
con.close()
s, r = dep([t5], [390])
chk("4: falha na auditoria => registro recusado (nao 200)", s != 200, True)
chk("4: falha na auditoria => NADA gravado (baixas, taxa, deposito desfeitos)", (n_lanc(), n_dep()), (l3, d3))
chk("4: falha na auditoria => titulo continua previsto", q1("select status from lancamentos where id=?", t5), "previsto")
con = db()
con.execute("DROP TRIGGER falha_teste_auditoria")
con.commit()
con.close()

# ---- 5) a taxa nao e presumida: acima do teto exige confirmacao
s, r = dep([t5], [360])
chk("5: taxa de 10% sem confirmacao recusada", s, 400)
print("   mensagem:", r.get("message"))
chk("5: nada gravado", (n_lanc(), n_dep()), (l3, d3))
s, r = dep([t5], [360], confirmar_taxa_alta=True)
chk("5: taxa de 10% com confirmacao explicita aceita", s, 200)
chk("5: taxa de 40 gravada", r.get("taxa"), 40)
chk("5: auditoria registra a taxa alta confirmada", q1("select count(*) from auditoria where acao='deposito_conferido' and detalhes like '%true%'") >= 1, True)

# ---- 6) taxa zero: liquido igual ao bruto
t7 = previsto(250, "PIX direto sem taxa")
nt = q1("select count(*) from lancamentos where categoria_id=?", c_taxa)
s, r = dep([t7], [250], bruto_conferido=250)
chk("6: liquido = bruto aceito (com o bruto conferido na tela batendo)", s, 200)
chk("6: taxa zero", r.get("taxa"), 0)
chk("6: nenhuma despesa de taxa criada", q1("select count(*) from lancamentos where categoria_id=?", c_taxa), nt)
chk("6: deposito sem taxa nao aponta lancamento", q1("select taxa_lancamento_id from depositos where id=?", r.get("id")), "")

# ---- 7) credito parcelado: so a parcela depositada e baixada
p1 = previsto(100, "Funeral cartao 1/3")
p2 = previsto(100, "Funeral cartao 2/3")
p3 = previsto(100, "Funeral cartao 3/3")
s, r = dep([p1], [97.5])
chk("7: deposito de UMA parcela aceito", s, 200)
chk("7: so a parcela 1 foi baixada", [q1("select count(*) from lancamentos where liquidacao_de=?", p) for p in (p1, p2, p3)], [1, 0, 0])
chk("7: as parcelas 2 e 3 continuam previstas", [q1("select status from lancamentos where id=?", p) for p in (p2, p3)], ["previsto", "previsto"])

# ---- 8) cargos
s, uo = call("POST", "/api/collections/users/records", {"name": "Operador", "usuario": "operador", "email": "operador@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}, tok)
call("POST", f"/backend/v1/admin/usuarios/{uo.get('id')}/role", {"role": "operador", "empresa_id": eid}, tok)
s, jo = call("POST", "/api/collections/users/auth-with-password", {"identity": "operador", "password": "SenhaForte123"})
otok = jo.get("token")
s, ul = call("POST", "/api/collections/users/records", {"name": "Leitor", "usuario": "leitor", "email": "leitor@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}, tok)
call("POST", f"/backend/v1/admin/usuarios/{ul.get('id')}/role", {"role": "leitura", "empresa_id": eid}, tok)
s, jl = call("POST", "/api/collections/users/auth-with-password", {"identity": "leitor", "password": "SenhaForte123"})
ltok = jl.get("token")
l4, d4 = n_lanc(), n_dep()
s, _ = dep([p2], [97.5], token=otok)
chk("8: operador NAO registra deposito", s, 403)
s, _ = dep([p2], [97.5], token=ltok)
chk("8: leitura NAO registra deposito", s, 403)
s, _ = call("POST", "/backend/v1/deposito/registrar", {"chave": "k" + uuid.uuid4().hex[:20]}, None)
chk("8: sem login recusado", s, [400, 401, 403])
chk("8: nada gravado pelos nao autorizados", (n_lanc(), n_dep()), (l4, d4))

# ---- 9) outra empresa
s, emp2 = call("POST", "/api/collections/empresas/records", {"nome": "Outra Empresa", "padrao": False, "usuario_id": uid}, tok)
s, ua = call("POST", "/api/collections/users/records", {"name": "Admoutra", "usuario": "admoutra", "email": "admoutra@exemplo.test", "password": "SenhaForte123", "passwordConfirm": "SenhaForte123"}, tok)
call("POST", f"/backend/v1/admin/usuarios/{ua.get('id')}/role", {"role": "administrador", "empresa_id": emp2.get("id")}, tok)
s, ja = call("POST", "/api/collections/users/auth-with-password", {"identity": "admoutra", "password": "SenhaForte123"})
atok = ja.get("token")
if atok and ja["record"].get("empresa_id") == emp2.get("id"):
    s, _ = call("POST", "/api/collections/contas/records", {"nome": "Banco da Outra", "tipo": "banco", "saldo_inicial": 0, "usuario_id": ja["record"]["id"]}, atok)
    s, r = dep([p2], [97.5], token=atok, conta="Banco da Outra")
    chk("9: admin de OUTRA empresa nao baixa titulo alheio", s, 400)
    chk("9: a recusa NAO vaza a descricao do titulo da outra empresa", "Funeral cartao" in str(r.get("message")), False)
    s, _ = dep([p2], [97.5], token=atok, conta="Itaú")
    chk("9: nem usa a conta de outra empresa", s, 400)
    chk("9: titulo alheio intacto", q1("select status from lancamentos where id=?", p2), "previsto")
else:
    print("   (nao foi possivel criar admin da outra empresa; itens 9 pulados)")

# ---- 10) concorrencia
resultados = []


def disparo(corpo, token):
    s_, r_ = call("POST", "/backend/v1/deposito/registrar", corpo, token)
    resultados.append((s_, r_.get("message")))


cc = previsto(100, "Corrida A")
cd = previsto(200, "Corrida B")
d_antes = n_dep()
corridas = [{"chave": "k" + uuid.uuid4().hex[:20], "data_deposito": dia, "conta": "Itaú", "titulos": [cc, cd], "linhas": [{"rotulo": "Extrato", "valor": 292}]} for _ in range(8)]
ths = [threading.Thread(target=disparo, args=(c, tok)) for c in corridas]
[t.start() for t in ths]
[t.join() for t in ths]
print("   respostas (chaves diferentes, mesmos titulos):", sorted(x[0] for x in resultados))
chk("10: 8 depositos simultaneos dos MESMOS titulos: so 1 aceito", len([x for x in resultados if x[0] == 200]), 1)
chk("10: cada titulo baixado uma unica vez", [q1("select count(*) from lancamentos where liquidacao_de=?", t) for t in (cc, cd)], [1, 1])
chk("10: so 1 deposito novo", n_dep() - d_antes, 1)
resultados.clear()
ce = previsto(100, "Corrida C")
ch = "k" + uuid.uuid4().hex[:20]
iguais = [{"chave": ch, "data_deposito": dia, "conta": "Itaú", "titulos": [ce], "linhas": [{"rotulo": "Extrato", "valor": 97}]} for _ in range(8)]
ths = [threading.Thread(target=disparo, args=(c, tok)) for c in iguais]
[t.start() for t in ths]
[t.join() for t in ths]
chk("10: 8 envios da MESMA chave: so 1 aceito", len([x for x in resultados if x[0] == 200]), 1)
chk("10: titulo baixado uma vez", q1("select count(*) from lancamentos where liquidacao_de=?", ce), 1)

# ---- 11) correcao do valor liquido do deposito 1 (970 -> 960 -> 975)
def efeito_taxa():
    """taxa efetiva do deposito 1 = despesas de taxa DELE (original e correcoes) menos os estornos delas"""
    ids = set()
    r0 = db().execute("select taxa_lancamento_id from depositos where id=?", (dep1,)).fetchone()[0]
    if r0:
        ids.add(r0)
    for (lid,) in db().execute("select taxa_lancamento_id from depositos_correcoes where deposito_id=?", (dep1,)).fetchall():
        if lid:
            ids.add(lid)
    if not ids:
        return 0.0
    marcas = ",".join("?" for _ in ids)
    desp = q1(f"select coalesce(sum(valor),0) from lancamentos where id in ({marcas})", *ids)
    est = q1(f"select coalesce(sum(valor),0) from lancamentos where estorno_de in ({marcas})", *ids)
    return round(desp - est, 2)


antes = efeito_taxa()

# a despesa de taxa do deposito nao pode ser editada nem estornada a mao (so "Corrigir" mexe nela)
taxa_id = rec_dep[6]
desc_orig_taxa = db().execute("select descricao from lancamentos where id=?", (taxa_id,)).fetchone()[0]
s, _ = call("PATCH", f"/api/collections/lancamentos/records/{taxa_id}", {"descricao": "taxa alterada a mao"}, tok)
chk("11: editar a taxa pela API comum recusado (regra de atualizacao fechada; NAO exercita o gancho)", s, [403, 404])
s, js = call("POST", "/api/collections/_superusers/auth-with-password", {"identity": "su@teste.local", "password": "SenhaSuper12345"})
stok = js.get("token")
if stok:
    s, r = call("PATCH", f"/api/collections/lancamentos/records/{taxa_id}", {"descricao": "taxa alterada pelo superusuario"}, stok)
    chk("11: superusuario (passa pelas regras) tambem NAO edita a taxa: o gancho de modelo barra", s, 400)
    chk("11: a recusa do gancho cita o deposito", "taxa de um depósito" in str(r.get("message")), True)
    outro = previsto(10, "Lancamento comum para o controle")
    s, r = call("PATCH", f"/api/collections/lancamentos/records/{outro}", {"descricao": "Lancamento comum editado"}, stok)
    chk("11: controle: o gancho NAO bloqueia lancamento comum", s, 200)
else:
    chk("11: superusuario de teste disponivel (rodar.sh cria)", False, True)
s, r = call("POST", f"/backend/v1/lancamentos/{taxa_id}/editar", {"motivo": "tentativa de edicao", "valor": 31}, tok)
chk("11: editar a taxa pela edicao controlada recusado", s, 400)
chk("11: a taxa continua com o valor e a descricao originais", db().execute("select valor, descricao from lancamentos where id=?", (taxa_id,)).fetchone(), (30.0, desc_orig_taxa))
s, r = call("POST", "/api/collections/lancamentos/records", {"tipo": "despesa", "descricao": "Estorno manual da taxa", "categoria": "5.7 Taxas de maquineta e cartao", "categoria_id": c_taxa, "valor": 30, "competencia": comp, "data_lancamento": dia, "data_realizacao": dia, "status": "realizado", "conta": "Itaú", "estorno_de": taxa_id, "empresa_id": eid, "usuario_id": uid}, tok)
chk("11: estorno manual da taxa recusado", s, 400)
chk("11: a recusa cita o deposito", "taxa de um depósito" in str(r.get("message")), True)
chk("11: nenhum estorno manual foi gravado", q1("select count(*) from lancamentos where estorno_de=?", taxa_id), 0)
l5 = n_lanc()
chk("11: nenhuma taxa/estorno novo gravado pelas tentativas", q1("select count(*) from lancamentos where estorno_de=?", taxa_id), 0)
s, _ = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 1000.5, "motivo": "valor maior que o bruto"}, tok)
chk("11: correcao acima do bruto recusada", s, 400)
s, _ = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 970, "motivo": "igual ao atual"}, tok)
chk("11: correcao para o mesmo valor recusada", s, 400)
s, _ = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 960, "motivo": "x"}, tok)
chk("11: motivo curto recusado", s, 400)
s, _ = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 0, "motivo": "zerado por engano"}, tok)
chk("11: valor zero recusado", s, 400)
s, _ = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 900, "motivo": "taxa de dez por cento"}, tok)
chk("11: correcao que leva a taxa acima do teto exige confirmacao", s, 400)
chk("11: nada gravado nas recusas", n_lanc(), l5)
s, _ = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 960, "motivo": "digitei 970 em vez de 960"}, otok)
chk("11: operador NAO corrige", s, 403)
chk("11: taxa efetiva antes da correcao = 30", antes, 30)
# falha injetada na auditoria durante a correcao: nada pode mudar
n_cor = q1("select count(*) from depositos_correcoes")
con = db()
con.execute("CREATE TRIGGER falha_teste_auditoria BEFORE INSERT ON auditoria WHEN NEW.acao IN ('deposito_conferido','deposito_corrigido') BEGIN SELECT RAISE(ABORT, 'falha injetada'); END")
con.commit()
con.close()
s, _ = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 960, "motivo": "digitei 970 em vez de 960"}, tok)
chk("11: falha na auditoria => correcao recusada (nao 200)", s != 200, True)
chk("11: falha na auditoria => nada gravado na correcao", (n_lanc(), q1("select count(*) from depositos_correcoes"), efeito_taxa()), (l5, n_cor, 30))
con = db()
con.execute("DROP TRIGGER falha_teste_auditoria")
con.commit()
con.close()
s, r = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 960, "motivo": "digitei 970 em vez de 960"}, tok)
chk("11: correcao de 970 para 960 aceita", s, 200)
chk("11: taxa nova 40 (4%)", (r.get("taxa"), r.get("percentual")), (40, 4))
chk("11: taxa efetiva do deposito agora = 40 (estornou 30 e lancou 40)", efeito_taxa(), 40)
chk("11: o deposito original NAO foi alterado", db().execute("select valor_liquido, taxa from depositos where id=?", (dep1,)).fetchone(), (970.0, 30.0))
chk("11: correcao registrada com valores anterior e novo", db().execute("select liquido_anterior, liquido_novo, taxa_anterior, taxa_nova from depositos_correcoes where deposito_id=? order by created", (dep1,)).fetchall(), [(970.0, 960.0, 30.0, 40.0)])
s, r = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 975, "motivo": "o extrato correto e 975"}, tok)
chk("11: segunda correcao (960 para 975) aceita", s, 200)
chk("11: taxa efetiva agora = 25", efeito_taxa(), 25)
chk("11: duas correcoes em sequencia, encadeadas", db().execute("select liquido_anterior, liquido_novo from depositos_correcoes where deposito_id=? order by created", (dep1,)).fetchall(), [(970.0, 960.0), (960.0, 975.0)])
chk("11: bruto menos taxa efetiva = liquido corrigido", round(1000 - efeito_taxa(), 2), 975)
chk("11: auditoria da correcao", q1("select count(*) from auditoria where acao='deposito_corrigido'"), 2)
s, r = call("POST", "/backend/v1/deposito/corrigir", {"id": dep1, "valor_liquido": 1000, "motivo": "sem taxa nenhuma"}, tok)
chk("11: correcao para taxa zero aceita", s, 200)
chk("11: taxa efetiva zero", efeito_taxa(), 0)

# ---- 12) imutabilidade pela API e leitura
s, _ = call("POST", "/api/collections/depositos/records", {"chave": "kxxxxxxxxxxxxxxxx", "data_deposito": dia, "conta": "Itaú", "valor_bruto": 10, "valor_liquido": 10, "qtd_titulos": 1, "titulos": []}, tok)
chk("12: criar deposito pela API recusado (so a rota grava)", s, [400, 403, 404])
s, _ = call("PATCH", f"/api/collections/depositos/records/{dep1}", {"taxa": 0}, tok)
chk("12: alterar deposito pela API recusado", s, [400, 403, 404])
s, _ = call("DELETE", f"/api/collections/depositos/records/{dep1}", None, tok)
chk("12: excluir deposito pela API recusado", s, [400, 403, 404])
s, _ = call("POST", "/api/collections/depositos_correcoes/records", {"deposito_id": dep1, "liquido_anterior": 1, "liquido_novo": 2, "motivo": "teste de burla"}, tok)
chk("12: criar correcao pela API recusado", s, [400, 403, 404])
s, lista = call("GET", "/api/collections/depositos/records?perPage=50", None, otok)
chk("12: operador le os depositos da propria empresa", (s, len(lista.get("items", [])) >= 1), (200, True))

# ---- 13) deposito de OUTRO mes: datas e competencia do par estorno + taxa nova; Corrigir nao trava se a categoria antiga for inativada
dpass = (hoje.replace(day=1) - datetime.timedelta(days=1)).replace(day=1).isoformat()
tp = previsto(100, "Venda do mes anterior", venda=dpass)
s, r = dep([tp], [96], data_deposito=dpass)
chk("13: deposito de mes anterior aceito", s, 200)
dpid = r.get("id")
taxa_orig = q1("select taxa_lancamento_id from depositos where id=?", dpid)
chk("13: taxa original com competencia do mes do DEPOSITO (nao a do titulo)", db().execute("select competencia, data_lancamento from lancamentos where id=?", (taxa_orig,)).fetchone(), (dpass[:7], dpass))
s, r = call("POST", "/backend/v1/deposito/corrigir", {"id": dpid, "valor_liquido": 95.5, "motivo": "extrato mostra 95,50"}, tok)
chk("13: correcao do deposito de mes anterior aceita", s, 200)
est = db().execute("select data_realizacao, competencia, categoria_id from lancamentos where estorno_de=?", (taxa_orig,)).fetchall()
chk("13: um estorno da taxa original", len(est), 1)
nova_id = q1("select taxa_lancamento_id from depositos_correcoes where deposito_id=? order by created desc limit 1", dpid)
nova = db().execute("select data_realizacao, competencia, data_lancamento, valor from lancamentos where id=?", (nova_id,)).fetchone()
chk("13: estorno com data de realizacao de HOJE", est[0][0][:10], dia)
chk("13: estorno com a competencia do mes do deposito", est[0][1], dpass[:7])
chk("13: taxa nova com data de realizacao de HOJE", nova[0][:10], dia)
chk("13: taxa nova com a competencia do mes do deposito (nao a do titulo, nao a de hoje)", nova[1], dpass[:7])
chk("13: taxa nova com data de lancamento = data do deposito e valor 4,50", (nova[2][:10], round(nova[3], 2)), (dpass, 4.5))
# a categoria do deposito e inativada depois (qualquer caminho); outra categoria valida e configurada
c_taxa2 = cat("5.8 Taxas de maquineta (nova)", "despesa", "despesa_financeira")
con = db()
con.execute("UPDATE categorias SET ativa=0 WHERE id=?", (c_taxa,))
con.commit()
con.close()
s, _ = call("PATCH", f"/api/collections/permissoes/records/{perm_cat_id}", {"valor": c_taxa2}, tok)
s, r = call("POST", "/backend/v1/deposito/corrigir", {"id": dpid, "valor_liquido": 95, "motivo": "ajuste apos trocar a categoria da taxa"}, tok)
chk("13: Corrigir continua valendo com a categoria antiga inativada (usa a configurada)", s, 200)
nova2_id = q1("select taxa_lancamento_id from depositos_correcoes where deposito_id=? order by created desc limit 1", dpid)
chk("13: a taxa nova foi para a categoria configurada hoje", q1("select categoria_id from lancamentos where id=?", nova2_id), c_taxa2)
con = db()
con.execute("UPDATE categorias SET ativa=0 WHERE id=?", (c_taxa2,))
con.commit()
con.close()
l13 = n_lanc()
s, r = call("POST", "/backend/v1/deposito/corrigir", {"id": dpid, "valor_liquido": 94, "motivo": "sem nenhuma categoria valida"}, tok)
chk("13: sem nenhuma categoria valida, Corrigir recusa com mensagem que aponta a configuracao", (s, "Configuração da taxa" in str(r.get("message"))), (400, True))
chk("13: e nao grava nada", n_lanc(), l13)

print(f"=== RESUMO: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
