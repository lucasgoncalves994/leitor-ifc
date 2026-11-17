# -*- coding: utf-8 -*-
"""Gera um único .html com bibliotecas e modelo embutidos."""
import base64, json, re, io

html = open('index.html', encoding='utf-8').read()

def js(path):
    t = open(path, encoding='utf-8').read()
    # evita que qualquer "</script" dentro do código encerre a tag
    return t.replace('</script', '<\\/script')

# 1. troca as tags externas pelo conteúdo embutido
for arquivo in ['three.min.js', 'ifc-core.js', 'ifc-build.js']:
    tag = '<script src="%s"></script>' % arquivo
    assert html.count(tag) == 1, arquivo
    html = html.replace(tag, '<script>\n/* ---- %s ---- */\n%s\n</script>' % (arquivo, js(arquivo)))

# 2. embute o modelo compactado
b64 = json.load(open('modelo.json', encoding='utf-8'))['gz']
html = html.replace('<script>\n/* ---- three.min.js ---- */',
                    '<script>window.__MODELO_GZ__="%s";</script>\n<script>\n/* ---- three.min.js ---- */' % b64, 1)

# 3. o carregador passa a ler da variável embutida
antigo = """async function descompacta(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Não foi possível baixar o modelo (HTTP ' + res.status + ').');
  if (typeof DecompressionStream !== 'function')
    throw new Error('Este navegador não descompacta o modelo embutido. Use o botão "Abrir outro IFC" e escolha o arquivo .ifc do seu computador.');
  const pacote = await res.json();
  await progresso(0.015, 'Descompactando o modelo');
  const bin = atob(pacote.gz);"""
novo = """async function descompacta(url) {
  if (typeof DecompressionStream !== 'function')
    throw new Error('Este navegador não descompacta o modelo embutido. Use o botão "Abrir outro IFC" e escolha o arquivo .ifc do seu computador.');
  const pacote = { gz: window.__MODELO_GZ__ };
  if (!pacote.gz) throw new Error('O modelo embutido não foi encontrado neste arquivo.');
  await progresso(0.015, 'Descompactando o modelo');
  const bin = atob(pacote.gz);"""
assert html.count(antigo) == 1
html = html.replace(antigo, novo)

# 4. nome próprio para a versão offline
html = html.replace('<title>Leitor IFC da Piscina</title>',
                    '<title>Leitor IFC da Piscina (arquivo único)</title>')

# 5. fontes embutidas (subconjunto Latin1 do IBM Plex — cobre os acentos do português)
FONTES = [
    ('IBM Plex Sans',           '400', 'IBMPlexSans-Regular-Latin1.woff2'),
    ('IBM Plex Sans',           '500', 'IBMPlexSans-Medium-Latin1.woff2'),
    ('IBM Plex Sans',           '600', 'IBMPlexSans-SemiBold-Latin1.woff2'),
    ('IBM Plex Sans Condensed', '500', 'IBMPlexSansCondensed-Medium-Latin1.woff2'),
    ('IBM Plex Sans Condensed', '600', 'IBMPlexSansCondensed-SemiBold-Latin1.woff2'),
    ('IBM Plex Sans Condensed', '700', 'IBMPlexSansCondensed-Bold-Latin1.woff2'),
    ('IBM Plex Mono',           '400', 'IBMPlexMono-Regular-Latin1.woff2'),
    ('IBM Plex Mono',           '500', 'IBMPlexMono-Medium-Latin1.woff2'),
]
blocos = []
for familia, peso, arq in FONTES:
    dados = base64.b64encode(open('/tmp/fontes/fonts/split/woff2/' + arq, 'rb').read()).decode()
    blocos.append(
        "@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;"
        "src:url(data:font/woff2;base64,%s) format('woff2')}" % (familia, peso, dados))
css = '<style>\n' + '\n'.join(blocos) + '\n</style>'

link = re.search(r'<link rel="preconnect"[\s\S]*?rel="stylesheet">', html)
assert link, 'bloco de fontes nao encontrado'
html = html[:link.start()] + css + html[link.end():]

open('Leitor-IFC-Piscina.html', 'w', encoding='utf-8').write(html)
print('gerado: Leitor-IFC-Piscina.html')
