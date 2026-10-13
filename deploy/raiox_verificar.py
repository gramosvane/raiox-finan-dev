#!/usr/bin/env python3
"""Raio-X Financeiro - verificação de banco do PocketBase (somente leitura).

Uso:
  raiox_verificar.py resumo  CAMINHO/data.db
  raiox_verificar.py comparar CAMINHO_A/data.db CAMINHO_B/data.db

O resumo lista, por coleção: quantidade de registros, soma do campo "valor" (ou "saldo_inicial")
(quando existir) e quantidade de relações sem destino (órfãs).
O banco é aberto somente para leitura; nada é alterado.
"""
import json
import sqlite3
import sys


def abrir(caminho):
    return sqlite3.connect("file:%s?mode=ro" % caminho, uri=True)


def resumo(caminho):
    db = abrir(caminho)
    colecoes = db.execute(
        "SELECT id, name, type, fields FROM _collections "
        "WHERE system = 0 AND type != 'view' ORDER BY name"
    ).fetchall()
    nomes = {cid: nome for cid, nome, _, _ in colecoes}
    nomes["_pb_users_auth_"] = nomes.get("_pb_users_auth_", "users")
    linhas = {}
    for cid, nome, _tipo, campos_json in colecoes:
        campos = json.loads(campos_json)
        colunas = {c["name"] for c in campos}
        qtd = db.execute('SELECT COUNT(*) FROM "%s"' % nome).fetchone()[0]
        soma = None
        for campo in ("valor", "saldo_inicial"):
            if campo in colunas:
                soma = db.execute(
                    'SELECT ROUND(COALESCE(SUM("%s"), 0), 2) FROM "%s"' % (campo, nome)
                ).fetchone()[0]
                break
        orfas = 0
        for c in campos:
            if c.get("type") != "relation":
                continue
            destino = nomes.get(c.get("collectionId"))
            if not destino:
                continue
            for (valor,) in db.execute(
                'SELECT "%s" FROM "%s" WHERE "%s" IS NOT NULL AND "%s" != \'\''
                % (c["name"], nome, c["name"], c["name"])
            ):
                ids = []
                if isinstance(valor, str) and valor.startswith("["):
                    try:
                        ids = [i for i in json.loads(valor) if i]
                    except ValueError:
                        ids = [valor]
                else:
                    ids = [valor]
                for i in ids:
                    existe = db.execute(
                        'SELECT 1 FROM "%s" WHERE id = ?' % destino, (i,)
                    ).fetchone()
                    if not existe:
                        orfas += 1
        linhas[nome] = (qtd, soma, orfas)
    db.close()
    return linhas


def imprimir(titulo, linhas):
    print(titulo)
    print("  %-22s %10s %16s %8s" % ("colecao", "registros", "soma valor/saldo", "orfas"))
    for nome in sorted(linhas):
        qtd, soma, orfas = linhas[nome]
        s = "-" if soma is None else "%.2f" % soma
        print("  %-22s %10d %16s %8d" % (nome, qtd, s, orfas))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "resumo":
        imprimir("RESUMO: " + sys.argv[2], resumo(sys.argv[2]))
        return 0
    if len(sys.argv) == 4 and sys.argv[1] == "comparar":
        a, b = resumo(sys.argv[2]), resumo(sys.argv[3])
        imprimir("ORIGINAL: " + sys.argv[2], a)
        imprimir("RESTAURADO: " + sys.argv[3], b)
        diferencas = [n for n in sorted(set(a) | set(b)) if a.get(n) != b.get(n)]
        if diferencas:
            print("RESULTADO: DIFERENTE em: " + ", ".join(diferencas))
            return 1
        print("RESULTADO: CONFERE (registros, somas e relacoes; nao compara campo a campo)")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())