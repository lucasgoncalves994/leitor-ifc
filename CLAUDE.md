# Contexto do projeto

Leitor de IFC em navegador, escrito do zero para o modelo hidráulico da piscina
do Art Stay (Unique). Não usa nenhuma biblioteca de IFC: o parser é próprio.

Estudo de caso: `ARTST-CHI-PIS-EX-0001-MOD-PISCINA_COMPLETA-R00.ifc`
— IFC2X3, exportado pelo Revit 2024 (PTB), unidade **centímetro**,
722 elementos, 507.828 triângulos, 641,10 m de tubo.

## O problema que originou o projeto

O Revit exportou `Pset_FlowSegmentPipeSegment` contendo **apenas `Length`**.
Não existe `NominalDiameter` em lugar nenhum do arquivo. Abrir o IFC em qualquer
visualizador não mostra diâmetro nem tipo de tubo. O leitor reconstrói esses
dados a partir do próprio arquivo.

## Arquitetura

Três camadas, carregadas como scripts clássicos (sem módulos), nesta ordem:

1. **`ifc-core.js`** — parser STEP genérico + geometria.
   - `IfcModel`: tokeniza o arquivo (máquina de estados sobre `charCodeAt`,
     respeitando aspas e `''`), monta `id -> {tipo, params crus}` e só analisa os
     parâmetros sob demanda (`args(id)`, com cache). 382 mil entidades em ~470 ms.
   - Decodifica `\X\xx`, `\X2\...\X0\` e `\S\x` (acentos do português).
   - Índices de relacionamento: psets, tipo, grupos, pavimento, material,
     portas (`IfcRelConnectsPorts`), estilos.
   - `GeometryReader`: cadeia de `IfcLocalPlacement`, `IfcExtrudedAreaSolid`
     (perfis círculo, círculo vazado, retângulo, arbitrário com
     `IfcCompositeCurve`/`IfcTrimmedCurve`), `IfcFacetedBrep`,
     `IfcFaceBasedSurfaceModel`, `IfcMappedItem`. Converte tudo para metros
     pela `IfcSIUnit`.

2. **`ifc-build.js`** — camada de engenharia civil.
   - `buildIfcModel(texto, onProgress)` → assíncrona, cede o controle entre
     fases para a barra de progresso funcionar.
   - Para cada elemento extrai: categoria (em português), família, tipo,
     sistema, pavimento, material, fabricante, todos os psets, caixa
     envolvente (`e.min` / `e.max`) e a faixa de vértices/índices na
     geometria unificada.
   - `quantitativos(model, filtro)` → metros por DN, por sistema × DN,
     contagem de peças por tipo × bitola e por sistema. Cada linha carrega
     `ids` dos elementos, o que torna as tabelas clicáveis.

3. **`index.html`** — interface, visor three.js e tabelas.

## Como o diâmetro é reconstruído (ordem de prioridade)

1. **Perfil circular da geometria** — raio × 2 do `IfcCircleProfileDef`.
   Só vale para categorias lineares (ver `PERFIL_E_BITOLA`): num dispositivo
   o primeiro sólido é parte do corpo, não a conexão. 382 elementos.
2. **Grafo de portas** — propagação em até 4 passadas a partir dos tubos
   ligados a cada `IfcDistributionPort`. É isso que dá bitola às conexões e
   faz reduções e tês aparecerem como `75 × 60`. 329 elementos.
3. **Propriedade do IFC** — `NominalDiameter` e similares, se existirem.
4. **Número no nome do tipo** — só aceita quando seguido de `mm`. 5 elementos.

Cada peça guarda `dnFonte`, e o painel mostra a origem. Não inventar diâmetro:
6 elementos ficam sem (2 pisos, 2 drenos, torneira, Smartpool) e assim devem ficar.

**Conferência de referência:** o comprimento calculado na geometria bate com a
propriedade `Length` do arquivo com erro de 4,4 × 10⁻¹⁶ m. Se mexer na cadeia de
posicionamento, refazer essa comparação.

## Uniões embutidas em equipamentos

Várias famílias de equipamento trazem as uniões dos bocais desenhadas dentro do
mesmo elemento (o Trocador de Calor é um `IfcFlowTerminal` com 56 sólidos), então
a união e o corpo eram selecionados e contados juntos.

- `GeometryReader` registra cada sólido de folha em `geo.leaves` (faixas de
  vértices e índices). `acharUnioes` (em `ifc-build.js`) separa o sólido que
  contém uma `IfcDistributionPort` do elemento, mais as gaxetas encostadas nele;
  o corpo é o sólido de maior caixa envolvente e nunca sai.
- Cada união vira um elemento sintético no **fim** da lista (`sintetico: true`,
  `parteDe` = índice do equipamento, `guid` com sufixo `#uniaoN`), categoria
  "Conexão", DN herdado do equipamento. A contagem de elementos sobe de 722 para
  740 (18 uniões); triângulos (507.828) e metros de tubo (641,10) não mudam.
- Vale para todo equipamento, exceto as categorias de rede em
  `CATEGORIAS_SEM_UNIAO` (tubo, conexão, registro...): ali os sólidos são partes
  do próprio corpo, como as pontas de um joelho.
- Só conta como união o sólido compacto: menor lado ≥ 3 cm, maior lado ≤ 15 cm e
  volume ≤ 10% do equipamento (`pareceUniao`). Esses limites foram calibrados
  neste modelo; sem eles, a regra tirava a grade do dreno, o corpo das bombas,
  as chapas de retornos e da caixa sifonada e as peças dos refletores.
  Separadas hoje: trocador (4), gerador de cloro (4), dosador (2), lâmpada UV (2),
  filtros V-30 e V-80 (3 cada). Se entrar outro modelo, conferir o resultado.

## Decisões do visor que não são óbvias

- **Geometria unificada.** Uma única malha com todos os triângulos; a
  visibilidade é controlada reescrevendo o buffer de índices por faixas de
  elemento, não criando objetos. A seleção (`meshSel`), o conjunto
  (`meshConj`) e o contexto esmaecido (`meshContexto`) são malhas que
  compartilham os mesmos atributos de posição e normal.

- **Esmaecimento sem transparência.** Transparência real *soma* onde os tubos
  se cruzam, e a mesma peça aparecia mais clara ou mais escura conforme o
  número de camadas atrás dela. Hoje existe um segundo atributo de cor
  (`corFadeAttr`) com a cor já misturada ao fundo do visor, desenhado opaco.
  Um pixel, uma amostra, esmaecimento igual em toda a cena.
  **Não trocar por `transparent: true`.**

- **Render em dois passos quando há seleção.** Primeiro o contexto esmaecido,
  depois `renderer.clearDepth()` e as peças destacadas. Assim a seleção
  aparece mesmo atrás de outros tubos, sem o artefato de face interna que
  apareceria desligando o teste de profundidade.

- **Zoom ancorado no cursor.** A câmera e o pivô são escalados em torno do
  ponto sob o mouse. Esse ponto vem de teste de raio contra as **caixas
  envolventes** das 722 peças (0,28 ms). Raycast nos 507 mil triângulos
  custava 46,9 ms por giro da roda — inviável.

- **Planos de corte acompanham a distância** (`perto = r/1000`,
  `longe = r + diag×3`). Plano próximo fixo gastaria a precisão de
  profundidade e os tubos brigariam entre si com a vista afastada.

- **Navegação estilo Revit:** botão do meio desloca, Shift + botão do meio
  gira. É preciso barrar `mousedown` do botão do meio, senão o Chrome abre a
  rolagem automática. Shift + clique **parado** (menos de 5 px) soma à seleção;
  com movimento é deslocamento.

- **Dois temas sobre os mesmos tokens CSS.** Paleta clara no `:root` base,
  escura em `@media (prefers-color-scheme: dark)` e em `[data-theme="dark"]`.
  O visor 3D tem a sua própria tabela (`TEMA3D`): fundo, grade, luzes, cor de
  foco e do conjunto, e um fator que aprofunda as cores no tema claro.

## Armadilhas conhecidas

- `index.html` busca `modelo.json` por `fetch`: **não abre por `file://`**.
  Use `python3 -m http.server`. A versão de arquivo único não tem esse problema.
- A extensão `.gz` não é servida pelo hospedeiro de artefatos; por isso o
  modelo vai em JSON com o gzip em base64.
- `three.min.js` é a r149 (UMD, com `THREE` global) e está fixado como arquivo
  do projeto de propósito — não trocar por CDN nem por build em módulo.
- Elementos podem pertencer a mais de um `IfcSystem` (19 neste modelo). Conta-se
  apenas o primeiro, para os totais não duplicarem.
- Ao editar: rodar `python3 build_standalone.py` depois, senão o arquivo único
  fica desatualizado.

## Preferências de quem toca o projeto

- Respostas e comentários em português; evitar termos em inglês quando houver
  equivalente ("categoria", "parâmetro", "tabela de quantidades").
- Explicação passo a passo, mostrando o mecanismo, não só o resultado.
- Gerar arquivo só quando pedido.
