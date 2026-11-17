# Leitor IFC — piscina (Art Stay)

Visualizador de IFC que roda no navegador, sem instalar nada. Lê o arquivo IFC
direto (parser próprio em JavaScript), mostra o modelo em 3D e extrai os
parâmetros que o Revit não exportou.

## Rodar

O leitor busca `modelo.json` por `fetch`, que o navegador bloqueia em `file://`.
Então, para desenvolver, suba um servidor local:

    python3 -m http.server 8777

e abra <http://localhost:8777/index.html>.

## Gerar a versão de arquivo único

    python3 build_standalone.py

Produz `Leitor-IFC-Piscina.html`, com bibliotecas, fontes e modelo embutidos.
Esse arquivo abre com duplo clique, sem servidor e sem internet.

## Trocar o modelo embutido

    python3 preparar_modelo.py caminho/do/outro.ifc
    python3 build_standalone.py

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Interface, visor 3D, tabelas, temas |
| `ifc-core.js` | Parser STEP/IFC e extração de geometria |
| `ifc-build.js` | Camada de engenharia: diâmetro, tipo, sistema, quantitativos |
| `three.min.js` | three.js r149 (UMD), fixado como arquivo próprio |
| `modelo.json` | IFC comprimido em gzip + base64 |
| `build_standalone.py` | Gera o HTML de arquivo único |
| `preparar_modelo.py` | Converte um .ifc em `modelo.json` |
