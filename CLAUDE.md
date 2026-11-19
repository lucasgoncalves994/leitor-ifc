# Contexto do projeto

Leitor de IFC em navegador, escrito do zero para o modelo hidráulico da piscina
do Art Stay (Unique). Não usa nenhuma biblioteca de IFC: o parser é próprio.

Estudo de caso: `ARTST-CHI-PIS-EX-0001-MOD-PISCINA_COMPLETA-R02.ifc`
(`modelo.json`) — IFC2X3, exportado pelo Revit 2024 (PTB, 18/11/2026), unidade
**centímetro**, 667 elementos (685 com as 18 uniões separadas), 499.542 triângulos,
384,26 m de tubo. Mesma estrutura de parâmetros do R01 (609 → 605 diâmetros vindos de
`Tamanho`, 342 de 342 conferem com a geometria).
O **R00** (722 elementos, 507.828 triângulos, 641,10 m de tubo) fica em
`modelo-R00.json`, como referência (para usá-lo: renomear para `modelo.json`).
O **R01** (688 elementos, 382,47 m) foi substituído pelo R02 e só existe no histórico
do git (commit `a7180df` e anteriores, em `modelo.json`).
A diferença de tubo entre o R00 e as revisões seguintes está quase toda no sistema
elétrico DN25 (340,08 m no R00, 74,87 m no R01).
Trocar de revisão: `python preparar_modelo.py <ifc>` e `python build_standalone.py`
(o arquivo único precisa ser regerado, senão o botão de baixar entrega a versão antiga).

## O problema que originou o projeto

No R00 o Revit exportou `Pset_FlowSegmentPipeSegment` contendo **apenas `Length`**:
não existia `NominalDiameter` em lugar nenhum. O leitor reconstrói o diâmetro a
partir do próprio arquivo (geometria e portas). O **R01** já traz os parâmetros do
Revit em conjuntos próprios (`Mecânica`, `Cotas`, `Dados de identidade`, `Outros`,
`Resultados da análise`...), e o leitor os usa antes da reconstrução, que ficou
como reserva e como conferência.

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

## De onde vem o diâmetro (ordem de prioridade)

1. **Parâmetros do Revit (R01)** — `Cotas.Tamanho` (`Ø75-Ø60-Ø60`, em mm) dá a
   bitola de cada boca: reduções e tês ficam `75 × 60` direto do arquivo, e
   `Ø50-Ø50` numa válvula é DN50. Sem `Tamanho`: `Mecânica.Diâmetro`, `Cotas.DN` e
   `Outros.Diâmetro Nominal Máximo` (esses em cm: 7.5 = DN75, multiplicar por
   `lengthScale`). `dnParam` guarda qual parâmetro foi usado. 609 elementos.
   Peça com `Tamanho` não passa pelo grafo de portas (que errava: válvula
   `Ø50-Ø50` saía `60 × 50`, bucha `Ø60-Ø50` saía `75 × 60 × 50`).
2. **Perfil circular da geometria** — raio × 2 do `IfcCircleProfileDef`.
   Só vale para categorias lineares (ver `PERFIL_E_BITOLA`): num dispositivo
   o primeiro sólido é parte do corpo, não a conexão. No R01 vira conferência
   (`dnGeom`): bate com o parâmetro nos 355 elementos que têm as duas fontes.
3. **Grafo de portas** — propagação em até 4 passadas a partir dos tubos
   ligados a cada `IfcDistributionPort`. É a única fonte para o R00 (329
   elementos) e a reserva no R01 (68).
4. **Propriedade do IFC** — `NominalDiameter` e similares, se existirem.
5. **Número no nome do tipo** — só aceita quando seguido de `mm`.

Cada peça guarda `dnFonte`, e o painel mostra a origem (e se confere com a
geometria). Não inventar diâmetro: ficam sem (2 pisos, drenos, torneira, Smartpool) e assim devem ficar.

### Outros parâmetros do Revit usados (R01)

Extraídos em `buildIfcModel` (funções `getParam`, `textoParam`, `numParam`):
`marca`, `comentarios`, `descricao` ("Descrição do Material"; o texto
"inexistente" vira vazio), `nomeSistema`, `materialSistema`, `hmtPa`, `vazaoLs`.
- `descricao` entra na chave de agrupamento de `quantitativos`: separa joelho 45°
  de joelho 90° dentro do mesmo tipo. As tabelas de peças ganham a coluna
  "Descrição" e a de elementos a coluna "Marca" **só quando o IFC as traz** (o R00
  continua igual).
- Unidades: números vêm na unidade do modelo (cm). `VAZÃO` está em L/s (5,5556 =
  20 m³/h). `HMT` parece estar em Pa (10,46 m.c.a. numa bomba de piscina); a
  unidade **não está confirmada** e o painel avisa "presumido".
- `Mecânica – Vazão` (vazão, velocidade, queda de pressão dos tubos) vem **zerada**
  no R01: a análise não foi calculada na exportação. Não exibir.
- As uniões separadas (`sintetico`) não herdam marca, descrição, vazão nem HMT.

**Conferência de referência:** o comprimento calculado na geometria bate com a
propriedade `Length` do arquivo com erro de 4,4 × 10⁻¹⁶ m. Se mexer na cadeia de
posicionamento, refazer essa comparação.

## Edição manual (nome, sistema, diâmetro)

Painel da peça e painel de conjunto têm "Editar nome, sistema e diâmetro" (em
`index.html`: `editorEdicao`, `gravarEdicao`, `aplicarEdicao`). As edições ficam em
`localStorage['leitor-ifc-edicoes']`, por GUID (uniões sintéticas já têm GUID próprio
`…#uniaoN`), e são reaplicadas em `montar()` sobre qualquer leitura do IFC. O valor lido
fica em `e.orig` e volta com "Restaurar original". Editar muda `e.sistemaClasse`, `e.dn`
(`dnFonte = 'manual'`) e `e.nomeEd`, então legenda, filtros, quantitativos e tabelas
acompanham sem tratamento extra. Com várias peças, campo vazio = não mexe naquele campo.
O nome editado só aparece no painel, na tabela Elementos e na busca (as tabelas de
peças continuam agrupando por `objType`). Não há exportação das edições.

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
  número de camadas atrás dela. O resto do modelo (`meshContexto`) é opaco,
  **iluminado** (Lambert, como o modelo normal) e só no fim do fragmento a cor é
  misturada com o fundo: `mix(uFundo, cor, uFade)` via `onBeforeCompile`
  (uniforms em `uCtx`). Um pixel, uma amostra, esmaecimento igual em toda a
  cena, e a iluminação mantém o volume das peças. `uFade` é o quanto da cor
  sobra; padrão 50%, ajustável no painel Visor ("Visibilidade do resto",
  guardado em localStorage). A versão anterior pré-misturava a cor no vértice
  (22 a 28% da cor, sem iluminação) e o resto virava manchas chapadas.
  O destaque (`meshConj` laranja, `meshSel` de foco) também é Lambert: chapado
  (MeshBasic) ele virava uma mancha e só o contorno sobrava (foi a versão anterior).
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

- **Contorno por peça, em tela** (`montarContorno`, `desenharContorno`). Um passo
  extra desenha a cena num alvo (número da peça + textura de profundidade) e um
  quadro cheio pinta o pixel onde o vizinho é fundo (silhueta) ou está bem mais
  perto (`limiar` = 1,2% da profundidade; a peça de trás leva a linha). Não
  depende das normais (as faces facetadas têm normais planas, o que quebraria o
  método do casco invertido). Com seleção ativa, só o destaque leva contorno.
  Checkbox "Contorno nas peças"; cores em `TEMA3D.contorno`.
  **Serrilhado:** o alvo de identificadores não tem MSAA (misturar números de peça
  não faz sentido), então a linha não é decidida por pixel: o shader amostra 16
  pontos em 2 anéis (0,9 e 1,9 px) e usa a fração que cai fora da peça como
  transparência (`smoothstep`), o que dá bordas graduadas.
  **Desligado durante o movimento da câmera:** o passo extra redesenha o modelo
  inteiro (sem seleção custou ~37% dos quadros/s num teste parado), então
  `desenharContorno` é pulado por `ATRASO_CONTORNO` (200 ms) depois do último
  `posicionarCamera` e volta quando a câmera para. Todo movimento deve passar por
  `posicionarCamera`, senão o contorno volta a pesar no arraste.
  **O fantasma também:** com poucos sistemas visíveis (ex.: água quente + ralos) o
  fantasma tem ~230 mil triângulos translúcidos e dobrou o custo do quadro (10,8 →
  20,6 ms medidos). `laco` não o desenha enquanto a câmera se move (mesmo
  `ATRASO_CONTORNO`) e o restaura na sequência. O custo restante do arraste é o dos
  triângulos visíveis (Lambert, dupla face); se ainda pesar, o próximo passo é
  reduzir o pixel ratio durante o movimento.
  **Não usar mudança de número da peça como critério de borda:** tubo e conexão
  se sobrepõem na mesma superfície e o número alterna em manchas, gerando
  emendas falsas dentro das conexões (foi a 1ª versão, rejeitada).

- **Barra de ocultação no visor** (`#barraOcultar`, `atualizarBarraOcultar`).
  Com peça(s) selecionada(s) aparece "Ocultar peça / N peças"; o primeiro uso liga
  o modo de ocultação (`S.ocultando`): a seleção é limpa, a barra passa a mostrar
  o contador e "Finalizar ocultações", e o clique seguinte escolhe outra peça.
  **Finalizar devolve ao visor as peças ocultas por esta barra** (guardadas em
  `ocultasDaSessao`) e sai do modo: ocultar serve para ver o que está atrás, não
  para esconder de vez (a 1ª versão só saía do modo e deixava tudo oculto, o que o
  usuário não esperava). "Mostrar tudo" também as devolve e encerra o modo;
  ocultações de outros botões (painel, "Isolar") não são tocadas. É atualizada por
  `atualizarHud`, que toda mudança de seleção ou visibilidade já chama.

- **Tabelas: Shift+clique seleciona intervalo.** `cliqueLinha` guarda a última
  linha clicada como âncora (`ancoraTabela`) e seleciona tudo entre ela e a
  linha atual; a âncora não muda no Shift+clique. Ctrl/Cmd+clique soma ou tira
  uma linha. Sem âncora na mesma tabela, Shift+clique soma, como antes. A âncora
  vale só até a tabela ser redesenhada (ex.: ao ocultar peças). No visor 3D,
  Shift+clique continua somando uma peça por vez.

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
