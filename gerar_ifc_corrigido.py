# -*- coding: utf-8 -*-
"""Gera um IFC novo com as correções das conexões (as mesmas que o leitor aplica).

    python gerar_ifc_corrigido.py [saida.ifc]

Lê o IFC embutido em `modelo.json` (R02 da piscina) e grava outro arquivo STEP com:

  * as 2 buchas de redução 75x50 modeladas erradas retiradas, junto com as portas
    e as relações que só falavam delas;
  * os 2 tês sem descrição passando a "Tê, DN75mm" (parâmetro `Tamanho` em
    Ø75-Ø75-Ø75 e `Descrição do Material` preenchida);
  * 2 buchas de redução 75x60 novas nas bocas de DN60 do tê do ralo lateral,
    cada uma como um cilindro extrudado de Ø75 mm por 36 mm, assentado na porta.

O arquivo original não é tocado. A geometria das buchas novas é aproximada: serve
para ver e para contar, não veio do projeto.
"""
import base64, gzip, json, re, sys, uuid

FONTE = 'modelo.json'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else 'ARTST-CHI-PIS-EX-0001-MOD-PISCINA_COMPLETA-R02-corrigido.ifc'

BUCHAS_FORA = ['2AKpYMvzT3BvWJBXEUP1fS', '2AKpYMvzT3BvWJBXEUP1fU']
TES = ['38a4Zab8v5iRZIBSWafNVP', '0uh82hoVn9RxUDRnHr2yl9']
TE_RALO = '38a4Zab8v5iRZIBSWafNVP'
TAMANHO_TE = 'Ø75-Ø75-Ø75'
DESC_TE = 'Tê, DN75mm, PVC Marrom Soldável, conforme NBR 5648'
FAMILIA_BUCHA = 'PVC Marrom Soldável_Bucha de Reducão Curta:Bucha de Redução Curta'
DESC_BUCHA = 'Bucha de Redução Curta, DN75x60mm, PVC Marrom Soldável, conforme NBR 5648'
TAMANHO_BUCHA = 'Ø75-Ø60'
RAIO_CM = 3.75      # Ø75 mm, no mesmo centímetro do modelo
COMPR_CM = 3.6      # bucha curta


# ---------------------------------------------------------------- utilidades
def esc(s):
    """texto -> literal STEP com os acentos no mesmo \\X\\xx do arquivo"""
    return ''.join(c if ord(c) < 128 else '\\X\\%02X' % ord(c) for c in s)


def guid_ifc():
    """GUID de 22 caracteres na base 64 do IFC"""
    alfabeto = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
    n = uuid.uuid4().int
    saida = ''
    for _ in range(22):
        n, r = divmod(n, 64)
        saida = alfabeto[r] + saida
    return saida


def ler_ifc():
    pacote = json.load(open(FONTE, encoding='utf-8'))
    return gzip.decompress(base64.b64decode(pacote['gz'])).decode('latin1')


# --------------------------------------------------------------------- carga
texto = ler_ifc()
linhas = texto.split('\n')
onde = {}                      # id da entidade -> índice da linha
for i, l in enumerate(linhas):
    m = re.match(r'#(\d+)=', l)
    if m:
        onde[int(m.group(1))] = i

ids = lambda s: [int(x) for x in re.findall(r'#(\d+)', s)]
corpo = lambda i: linhas[onde[i]]
tipo = lambda i: re.match(r'#\d+=([A-Z0-9]+)\(', corpo(i)).group(1)

por_guid = {}
for i, l in enumerate(linhas):
    m = re.match(r"#(\d+)=IFC[A-Z]+\('([^']{22})'", l)
    if m:
        por_guid[m.group(2)] = int(m.group(1))

proximo = [max(onde) + 1]
novas = []                     # linhas novas, entram antes de ENDSEC


def nova(texto_entidade):
    i = proximo[0]
    proximo[0] += 1
    novas.append('#%d=%s;' % (i, texto_entidade))
    return i


# --------------------------------------------- 1. retirar as buchas erradas
apagar = set()
for g in BUCHAS_FORA:
    el = por_guid[g]
    apagar.add(el)
    for i, l in enumerate(linhas):
        if 'IFCRELCONNECTSPORTTOELEMENT' in l and l.rstrip().endswith(',#%d);' % el):
            apagar.add(int(re.match(r'#(\d+)=', l).group(1)))
            porta = ids(l)[-2]
            apagar.add(porta)
            for j, lj in enumerate(linhas):          # a ligação entre as duas portas
                if 'IFCRELCONNECTSPORTS' in lj and ('#%d,' % porta in lj or '#%d)' % porta in lj):
                    apagar.add(int(re.match(r'#(\d+)=', lj).group(1)))

print('retirando %d entidades (peças, portas e ligações)' % len(apagar))

# tira as referências às peças apagadas de dentro das listas das relações
alvos = {'#%d' % i for i in apagar}
for i, l in enumerate(linhas):
    if not l.startswith('#') or int(re.match(r'#(\d+)=', l).group(1)) in apagar:
        continue
    if not any(a + ',' in l or a + ')' in l for a in alvos):
        continue
    def limpa(m):
        itens = [x for x in m.group(1).split(',') if x.strip() not in alvos]
        return '(' + ','.join(itens) + ')'
    novo = re.sub(r'\(((?:#\d+,)+#\d+|#\d+)\)', limpa, l)
    if '()' in novo:                 # a relação ficou sem ninguém: sai também
        apagar.add(int(re.match(r'#(\d+)=', l).group(1)))
    else:
        linhas[i] = novo


# ------------------------------------------------- 2. corrigir os dois tês
def pset_do_elemento(el, nome_pset):
    """id do IfcPropertySet com esse nome ligado ao elemento"""
    for l in linhas:
        if 'IFCRELDEFINESBYPROPERTIES' not in l:
            continue
        lista = re.search(r'\(((?:#\d+,?)+)\)', l)
        if not lista or ('#%d' % el) not in [x.strip() for x in lista.group(1).split(',')]:
            continue
        ps = ids(l)[-1]
        if re.search(r"IFCPROPERTYSET\('[^']*',#\d+,'%s'" % re.escape(esc(nome_pset)), corpo(ps)):
            return ps
    return None


def troca_propriedade(pset, nome, valor):
    """reescreve (ou cria) um IfcPropertySingleValue de texto dentro do pset"""
    for p in ids(corpo(pset))[1:]:
        if p in onde and re.match(r"#\d+=IFCPROPERTYSINGLEVALUE\('%s'" % re.escape(esc(nome)), corpo(p)):
            linhas[onde[p]] = "#%d=IFCPROPERTYSINGLEVALUE('%s',$,IFCTEXT('%s'),$);" % (p, esc(nome), esc(valor))
            return p
    p = nova("IFCPROPERTYSINGLEVALUE('%s',$,IFCTEXT('%s'),$)" % (esc(nome), esc(valor)))
    linhas[onde[pset]] = re.sub(r'\(((?:#\d+,?)+)\)\);$', lambda m: '(%s,#%d));' % (m.group(1), p), corpo(pset))
    return p


for g in TES:
    el = por_guid[g]
    cotas = pset_do_elemento(el, 'Cotas')
    troca_propriedade(cotas, 'Tamanho', TAMANHO_TE)
    # é em "Dados de identidade" que o Revit grava a descrição (e é lá que o leitor procura)
    mat = pset_do_elemento(el, 'Dados de identidade') or pset_do_elemento(el, 'Materiais e acabamentos')
    troca_propriedade(mat, 'Descrição do Material', DESC_TE)
    print('tê %s: Tamanho -> %s, descrição preenchida' % (g, TAMANHO_TE))


# ------------------------------- 3. criar as duas buchas 75x60 no tê do ralo
te = por_guid[TE_RALO]
# IFCFLOWFITTING(guid, dono, nome, descr, objtype, placement, shape, tag).
# `ids` enxerga também o número da própria entidade, então tira o "#n=" antes.
sem_id = lambda s: s.split('=', 1)[1]
ref_te = ids(sem_id(corpo(te)))
dono, placement_te, shape_te = '#%d' % ref_te[0], ref_te[1], ref_te[2]
rep_te = ids(sem_id(corpo(shape_te)))[0]         # IfcShapeRepresentation
contexto = ids(sem_id(corpo(rep_te)))[0]         # subcontexto "Body"

# portas do tê que dão em peça de DN60
portas_60 = []
for l in linhas:
    if 'IFCRELCONNECTSPORTTOELEMENT' in l and l.rstrip().endswith(',#%d);' % te):
        porta = ids(l)[-2]
        vizinha = None
        for lj in linhas:
            if 'IFCRELCONNECTSPORTS' in lj:
                p = ids(lj)
                if porta in p[-2:]:
                    vizinha = p[-1] if p[-2] == porta else p[-2]
                    break
        if vizinha is None:
            continue
        dono_vizinho = None
        for lj in linhas:
            if 'IFCRELCONNECTSPORTTOELEMENT' in lj and ('#%d,' % vizinha) in lj:
                dono_vizinho = ids(lj)[-1]
                break
        if dono_vizinho is None:
            continue
        cotas = pset_do_elemento(dono_vizinho, 'Cotas')
        tam = ''
        if cotas:
            for p in ids(corpo(cotas))[1:]:
                if p in onde and "IFCPROPERTYSINGLEVALUE('Tamanho'" in corpo(p):
                    tam = corpo(p)
        if '\\X\\D860' in tam:
            portas_60.append(porta)

print('bocas de DN60 no tê do ralo lateral:', len(portas_60))

criadas = []
for k, porta in enumerate(portas_60):
    eixo_porta = ids(corpo(porta))[-1]          # IfcLocalPlacement da porta
    rel_porta = ids(corpo(eixo_porta))[-1]      # IfcAxis2Placement3D dela
    perfil2d = nova('IFCAXIS2PLACEMENT2D(#4,$)')
    perfil = nova("IFCCIRCLEPROFILEDEF(.AREA.,'%s',#%d,%s)" % (esc('PVC Marrom Soldável'), perfil2d, RAIO_CM))
    base3d = nova('IFCAXIS2PLACEMENT3D(#3,$,$)')
    solido = nova('IFCEXTRUDEDAREASOLID(#%d,#%d,#9,%s)' % (perfil, base3d, COMPR_CM))
    rep = nova("IFCSHAPEREPRESENTATION(#%d,'Body','SweptSolid',(#%d))" % (contexto, solido))
    forma = nova('IFCPRODUCTDEFINITIONSHAPE($,$,(#%d))' % rep)
    lugar = nova('IFCLOCALPLACEMENT(#%d,#%d)' % (placement_te, rel_porta))
    tag = '90000%d' % (k + 1)
    el = nova("IFCFLOWFITTING('%s',%s,'%s:%s',$,'%s',#%d,#%d,'%s')" % (
        guid_ifc(), dono, esc(FAMILIA_BUCHA), tag, esc(FAMILIA_BUCHA), lugar, forma, tag))
    pt = nova("IFCPROPERTYSINGLEVALUE('Tamanho',$,IFCTEXT('%s'),$)" % esc(TAMANHO_BUCHA))
    pd = nova("IFCPROPERTYSINGLEVALUE('%s',$,IFCTEXT('%s'),$)" % (esc('Descrição do Material'), esc(DESC_BUCHA)))
    ps1 = nova("IFCPROPERTYSET('%s',%s,'Cotas',$,(#%d))" % (guid_ifc(), dono, pt))
    ps2 = nova("IFCPROPERTYSET('%s',%s,'%s',$,(#%d))" % (guid_ifc(), dono, esc('Dados de identidade'), pd))
    nova("IFCRELDEFINESBYPROPERTIES('%s',%s,$,$,(#%d),#%d)" % (guid_ifc(), dono, el, ps1))
    nova("IFCRELDEFINESBYPROPERTIES('%s',%s,$,$,(#%d),#%d)" % (guid_ifc(), dono, el, ps2))
    criadas.append(el)

# entram no mesmo pavimento e no mesmo sistema do tê
def soma_na_relacao(tipo_rel, novos):
    for i, l in enumerate(linhas):
        if tipo_rel in l:
            lista = re.search(r'\(((?:#\d+,?)+)\)', l)
            if lista and ('#%d' % te) in [x.strip() for x in lista.group(1).split(',')]:
                linhas[i] = l.replace(lista.group(0), '(%s,%s)' % (lista.group(1), ','.join('#%d' % n for n in novos)), 1)
                return True
    return False


if criadas:
    print('criadas %d buchas 75x60' % len(criadas),
          '| pavimento:', soma_na_relacao('IFCRELCONTAINEDINSPATIALSTRUCTURE', criadas),
          '| sistema:', soma_na_relacao('IFCRELASSIGNSTOGROUP', criadas))

# --------------------------------------------------------------- 4. gravar
# as entidades novas entram no fim da seção DATA (o primeiro ENDSEC é o do HEADER)
inicio_dados = next(i for i, l in enumerate(linhas) if l.strip() == 'DATA;')
fim_dados = next(i for i, l in enumerate(linhas) if i > inicio_dados and l.startswith('ENDSEC;'))
saida = []
for i, l in enumerate(linhas):
    m = re.match(r'#(\d+)=', l)
    if m and int(m.group(1)) in apagar:
        continue
    if i == fim_dados and novas:
        saida.extend(novas)
        novas = []
    saida.append(l)

texto_final = '\n'.join(saida)
texto_final = re.sub(r"FILE_NAME\('[^']*'", "FILE_NAME('%s'" % SAIDA, texto_final, count=1)
open(SAIDA, 'w', encoding='latin1', newline='').write(texto_final)
print('gerado: %s (%.1f MB)' % (SAIDA, len(texto_final) / 1048576))
