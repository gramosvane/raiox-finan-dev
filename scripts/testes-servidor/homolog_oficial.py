import json, os, secrets, sys, urllib.request, urllib.error, datetime

BASE = "http://127.0.0.1:18090"
RES = []


def call(m, p, b=None, tok=None):
    d = json.dumps(b).encode() if b is not None else None
    r = urllib.request.Request(BASE + p, data=d, method=m)
    r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", tok)
    try:
        with urllib.request.urlopen(r, timeout=30) as x:
            return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def chk(nome, obtido, esperado):
    ok = obtido in esperado if isinstance(esperado, (list, tuple, set)) else obtido == esperado
    RES.append(ok)
    print(("OK   " if ok else "FALHA"), nome, "| obtido:", obtido, "| esperado:", esperado)


s, st = call("GET", "/backend/v1/setup/status")
chk("status antes do primeiro acesso", st.get("inicializado"), False)
pw = secrets.token_urlsafe(14)
open("/home/master/.homolog_pw", "w").write(pw)
s, _ = call("POST", "/backend/v1/setup/administrador", {"name": "Admin Homolog", "usuario": "admhom", "email": "admhom@exemplo.test", "password": pw, "passwordConfirm": pw})
chk("primeiro acesso cria administrador", s, [200, 201])
s, _ = call("POST", "/backend/v1/setup/administrador", {"name": "Intruso", "usuario": "intruso", "email": "i@exemplo.test", "password": pw, "passwordConfirm": pw})
chk("segundo primeiro-acesso recusado", s, 403)
s, st = call("GET", "/backend/v1/setup/status")
chk("status depois", st.get("inicializado"), True)
s, _ = call("POST", "/api/collections/users/auth-with-password", {"identity": "admhom", "password": "senha-errada-123"})
chk("login com senha errada recusado", s, 400)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "admhom", "password": pw})
chk("login por usuario", s, 200)
tok = j["token"]; aid = j["record"]["id"]
chk("cargo do primeiro usuario", j["record"].get("role"), "administrador")

s, e = call("POST", "/api/collections/empresas/records", {"nome": "Empresa Homologacao", "padrao": True}, tok)
eid = e.get("id")
chk("admin cria empresa", s, 200)
call("POST", f"/backend/v1/admin/usuarios/{aid}/role", {"role": "administrador", "empresa_id": eid}, tok)
s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": "admhom", "password": pw}); tok = j["token"]

ids = {}
for papel, usr in [("operador", "ophom"), ("leitura", "leithom")]:
    s, j = call("POST", "/api/collections/users/records", {"name": papel.title(), "usuario": usr, "email": f"{usr}@exemplo.test", "password": pw, "passwordConfirm": pw}, tok)
    chk(f"admin cria usuario {papel}", s, 200)
    uid = j.get("id")
    if papel == "leitura":
        s, _ = call("POST", f"/backend/v1/admin/usuarios/{uid}/role", {"role": "leitura", "empresa_id": eid}, tok)
        chk("admin define cargo leitura", s, 200)
    else:
        call("POST", f"/backend/v1/admin/usuarios/{uid}/role", {"role": "operador", "empresa_id": eid}, tok)
    s, j = call("POST", "/api/collections/users/auth-with-password", {"identity": usr, "password": pw})
    chk(f"login {papel}", s, 200)
    ids[papel] = (j.get("token"), j["record"]["id"])
otok, oid = ids["operador"]; ltok, lid = ids["leitura"]

s, _ = call("POST", "/api/collections/users/records", {"name": "X", "usuario": "xhom", "email": "x@exemplo.test", "password": pw, "passwordConfirm": pw}, otok)
chk("operador nao cria usuario", s, [400, 403, 404])
s, _ = call("POST", f"/backend/v1/admin/usuarios/{oid}/role", {"role": "administrador", "empresa_id": eid}, otok)
chk("operador nao se promove", s, [400, 401, 403, 404])

# cadastros e permissoes do cargo
cats = {}
for nome, tipo, grupo in [("Mensalidades", "receita", "receita_bruta"), ("Aluguel", "despesa", "despesas_operacionais"), ("Retirada de socio", "despesa", "fora_resultado")]:
    s, c = call("POST", "/api/collections/categorias/records", {"nome": nome, "tipo": tipo, "grupo_dre": grupo, "usuario_id": aid}, tok)
    chk(f"admin cria categoria {nome}", s, 200)
    cats[nome] = c.get("id")
s, _ = call("POST", "/api/collections/departamentos/records", {"nome": "Dep op liberado", "usuario_id": oid}, otok)
chk("operador cria departamento (liberado)", s, 200)
s, pl = call("GET", "/api/collections/permissoes/records", tok=otok)
pid = next((i["id"] for i in pl.get("items", []) if i["chave"] == "operador_cadastros"), None)
chk("operador le permissoes", s, 200)
s, _ = call("PATCH", f"/api/collections/permissoes/records/{pid}", {"valor": "restrito"}, otok)
chk("operador nao altera permissao", s, [400, 403, 404])
s, _ = call("PATCH", f"/api/collections/permissoes/records/{pid}", {"valor": "restrito"}, tok)
chk("admin restringe operador", s, 200)
s, _ = call("POST", "/api/collections/departamentos/records", {"nome": "Dep op restrito", "usuario_id": oid}, otok)
chk("operador restrito nao cria departamento", s, [400, 403])
s, _ = call("POST", "/api/collections/categorias/records", {"nome": "Cat op restrito", "tipo": "despesa", "grupo_dre": "despesas_operacionais", "usuario_id": oid}, otok)
chk("operador restrito nao cria categoria", s, [400, 403])

s, _ = call("POST", "/api/collections/contas/records", {"nome": "Caixa", "tipo": "caixa", "saldo_inicial": 0, "usuario_id": aid}, tok)
chk("admin cadastra a conta Caixa (necessaria desde a Fase 1)", s, 200)
hoje = datetime.date.today()
comp = hoje.strftime("%Y-%m"); dia = hoje.isoformat()


def lanc(tok_, uid, desc, tipo, cat, val, st_="realizado"):
    b = {"tipo": tipo, "descricao": desc, "categoria": cat, "categoria_id": cats[cat], "valor": val, "competencia": comp,
         "data_lancamento": dia, "data_realizacao": dia, "status": st_, "empresa_id": eid, "usuario_id": uid, "conta": "Caixa"}
    return call("POST", "/api/collections/lancamentos/records", b, tok_)


s, _ = lanc(otok, oid, "Mensalidades do mes", "receita", "Mensalidades", 1000)
chk("operador restrito ainda lanca receita", s, 200)
s, _ = lanc(otok, oid, "Aluguel do mes", "despesa", "Aluguel", 300)
chk("operador restrito lanca despesa", s, 200)
s, _ = lanc(tok, aid, "Retirada", "despesa", "Retirada de socio", 500)
chk("admin lanca retirada fora do resultado", s, 200)
s, _ = lanc(ltok, lid, "Tentativa leitura", "receita", "Mensalidades", 10)
chk("leitura nao lanca", s, [400, 403])
s, l = call("GET", "/api/collections/lancamentos/records?perPage=50", tok=ltok)
chk("leitura le lancamentos", s, 200)
s, _ = call("POST", "/api/collections/fechamentos_caixa/records", {"data": dia, "maquineta_pix": 0, "maquineta_credito": 0, "maquineta_debito": 0, "despesas_dinheiro": 0, "dinheiro_contado": 1000}, ltok)
chk("leitura nao fecha caixa", s, [400, 403])

# fechamento de caixa
corpo = {"data": dia, "maquineta_pix": 300, "maquineta_credito": 400, "maquineta_debito": 100, "despesas_dinheiro": 0, "dinheiro_contado": 200,
         "total_sistema": 99999, "diferenca": 12345, "esperado_dinheiro": 1}
s, f = call("POST", "/api/collections/fechamentos_caixa/records", corpo, otok)
chk("operador fecha caixa", s, 200)
chk("total_sistema calculado pelo servidor", float(f.get("total_sistema", -1)), 1000.0)
chk("esperado = 1000-800-0", float(f.get("esperado_dinheiro", -1)), 200.0)
chk("diferenca zero", float(f.get("diferenca", -1)), 0.0)
s, _ = call("PATCH", f"/api/collections/fechamentos_caixa/records/{f.get('id')}", {"dinheiro_contado": 1}, tok)
chk("fechamento nao altera", s, [403, 404])
s, _ = call("DELETE", f"/api/collections/fechamentos_caixa/records/{f.get('id')}", tok=tok)
chk("fechamento nao exclui", s, [403, 404])

# orcamento
s, o = call("POST", "/api/collections/orcamentos/records", {"categoria_id": cats["Aluguel"], "competencia": comp, "valor": 1500}, tok)
chk("admin cria orcamento", s, 200)
s, _ = call("POST", "/api/collections/orcamentos/records", {"categoria_id": cats["Aluguel"], "competencia": comp, "valor": 1}, tok)
chk("orcamento duplicado recusado", s, 400)
s, _ = call("POST", "/api/collections/orcamentos/records", {"categoria_id": cats["Mensalidades"], "competencia": comp, "valor": 1}, otok)
chk("operador nao cria orcamento", s, [400, 403])
s, _ = call("PATCH", f"/api/collections/orcamentos/records/{o.get('id')}", {"valor": 1}, otok)
chk("operador nao altera orcamento", s, [403, 404])

# limite de despesa
s, _ = call("POST", "/api/collections/permissoes/records", {"chave": "limite_despesa", "valor": "100"}, otok)
chk("operador nao cria limite", s, [400, 403])
s, _ = call("POST", "/api/collections/permissoes/records", {"chave": "limite_despesa", "valor": "100"}, tok)
chk("admin cria limite", s, 200)

# depreciacao e recorrencia
mes3 = (datetime.date(hoje.year, hoje.month, 1) - datetime.timedelta(days=75)).isoformat()
bem = {"descricao": "Camara fria", "tipo_bem": "equipamento", "valor": 12000, "valor_residual": 0, "data_aquisicao": mes3, "vida_util_meses": 60, "troca_meses": 4, "ativo": True}
s, b = call("POST", "/api/collections/bens_depreciacao/records", bem, tok)
chk("admin cadastra bem", s, 200)
s, _ = call("POST", "/api/collections/bens_depreciacao/records", bem, otok)
chk("operador nao cadastra bem", s, [400, 403])
s, _ = call("POST", "/api/collections/bens_depreciacao/records", {**bem, "vida_util_meses": 0}, tok)
chk("vida util zero recusada", s, 400)
s, _ = call("DELETE", f"/api/collections/bens_depreciacao/records/{b.get('id')}", tok=tok)
chk("bem nao exclui", s, [403, 404])
rec = {"descricao": "Aluguel da sede", "tipo": "despesa", "categoria_id": cats["Aluguel"], "categoria_nome": "Aluguel", "valor": 2500,
       "frequencia": "mensal", "dia": 5, "inicio": comp + "-01", "ocorrencias": 6, "ativo": True}
s, _ = call("POST", "/api/collections/recorrencias/records", rec, tok)
chk("admin cadastra recorrencia", s, 200)
s, _ = call("POST", "/api/collections/recorrencias/records", {**rec, "dia": 31}, tok)
chk("dia 31 recusado", s, 400)
s, _ = call("POST", "/api/collections/recorrencias/records", rec, otok)
chk("operador nao cadastra recorrencia", s, [400, 403])

print("\nRESUMO: %d ok, %d falhas" % (sum(RES), len(RES) - sum(RES)))
