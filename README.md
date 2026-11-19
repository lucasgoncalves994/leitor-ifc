# Leitor IFC — piscina (Art Stay)

Visualizador de IFC que roda no navegador, sem instalar nada. Lê o arquivo IFC
direto (parser próprio em JavaScript), mostra o modelo em 3D e extrai os
parâmetros de cada elemento: diâmetro, marca, descrição, sistema, vazão e HMT
(do próprio IFC quando o Revit os exporta; senão, reconstruídos pela geometria).

## Editar peças

No painel de uma peça (ou de um conjunto selecionado), "Editar nome, sistema e
diâmetro" altera os três campos. As edições ficam salvas no navegador e podem ser
desfeitas com "Restaurar original".

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
| `modelo.json` | IFC embutido (hoje a revisão R02), comprimido em gzip + base64 |
| `modelo-R00.json` | Revisão R00, guardada como referência (renomeie para `modelo.json` para usá-la) |
| `build_standalone.py` | Gera o HTML de arquivo único |
| `preparar_modelo.py` | Converte um .ifc em `modelo.json` |
