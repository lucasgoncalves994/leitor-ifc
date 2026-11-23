# Leitor IFC — piscina (Art Stay)

Visualizador de IFC que roda no navegador, sem instalar nada. Lê o arquivo IFC
direto (parser próprio em JavaScript), mostra o modelo em 3D e extrai os
parâmetros de cada elemento: diâmetro, marca, descrição, sistema, vazão e HMT
(do próprio IFC quando o Revit os exporta; senão, reconstruídos pela geometria).

## Editar peças

No painel de uma peça (ou de um conjunto selecionado), "Editar nome, sistema e
diâmetro" altera os três campos. As edições ficam salvas no navegador e podem ser
desfeitas com "Restaurar original".

## Apontamentos

Clique com o **botão direito** numa peça no visor para criar um apontamento
vinculado a ela (Ctrl+Enter salva, Esc cancela). No painel da peça dá para marcar
como resolvido ou excluir. A aba **Apontamentos** lista todos, filtra por status e
exporta CSV. Ficam salvos no navegador.

O leitor já vem com **26 apontamentos da verificação das ligações do R02** (ligações
faltando, pontas abertas, peças fora do catálogo). Eles entram uma vez em cada
navegador; depois é só resolver ou excluir, que não voltam.

## Modelos publicados

| Modelo | Endereço |
|---|---|
| Piscina — Art Stay (R02 corrigido) | `index.html` |
| Hidráulica — Tipo 1 e 2 (sem a rede de incêndio) | `index.html?modelo=hidro` |

O seletor no cabeçalho troca de modelo numa aba nova. Cada modelo guarda as próprias
edições e os próprios apontamentos.

## Instalar no celular

O site é um app instalável. No **Android/Chrome**, abra
<https://lucasgoncalves994.github.io/leitor-ifc/> e use o menu ⋮ → "Instalar
aplicativo" (ou o aviso que aparece sozinho). No **iPhone/Safari**, botão de
compartilhar → "Adicionar à Tela de Início".

Depois de instalado ele abre em tela cheia, com ícone próprio, e **funciona sem
internet**: o modelo que você já tiver aberto uma vez fica guardado no aparelho.
Segurando o ícone aparecem atalhos para a Piscina e para a Hidráulica.

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
| `modelo.json` | IFC da piscina (revisão R02), comprimido em gzip + base64 |
| `modelo-hidro.json` | IFC da hidráulica Tipo 1 e 2, mesmo formato |
| `modelo-R00.json` | Revisão R00, guardada como referência (renomeie para `modelo.json` para usá-la) |
| `build_standalone.py` | Gera o HTML de arquivo único |
| `preparar_modelo.py` | Converte um .ifc em `modelo.json` |
| `manifest.json` | Manifesto do app instalável (nome, ícones, atalhos) |
| `sw.js` | Service worker: deixa instalável e faz abrir offline |
| `gerar_icones.py` | Desenha os ícones PNG do app |
| `gerar_ifc_corrigido.py` | Grava um IFC novo com as correções das conexões |
| `ARTST-...-R02-corrigido.ifc` | O IFC já corrigido (saída do script acima) |
