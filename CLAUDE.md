# Contexto do projeto

Leitor de IFC em navegador, escrito do zero para o modelo hidráulico da piscina
do Art Stay (Unique). Não usa nenhuma biblioteca de IFC: o parser é próprio.

**O `modelo.json` da piscina é hoje o R02 corrigido** (saída de
`gerar_ifc_corrigido.py`, 23/11/2026): as 2 buchas 75x50 erradas não existem mais, os
dois tês são Tê DN75 e as 2 buchas 75x60 são peças de verdade no arquivo. Por isso a
entrada `piscina` em `MODELOS` **não tem mais `fora` nem `correcoes`** — mantê-las
criaria as buchas de novo, em dobro. O motor (`aplicarCorrecoes`, `fora`) continua no
código, usado pelo `hidro` e pronto para a próxima rodada.

Estudo de caso: `ARTST-CHI-PIS-EX-0001-MOD-PISCINA_COMPLETA-R02.ifc`
(`modelo.json`) — IFC2X3, exportado pelo Revit 2024 (PTB, 18/11/2026), unidade
**centímetro**, 667 elementos (a separação das uniões está desligada), 499.542 triângulos,
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

## Mais de um modelo no mesmo site

`MODELOS` (em `index.html`) lista o que está publicado: `modelo.json` (piscina, o
estudo de caso) e `modelo-hidro.json` (**HIDRO TIPO 1 E 2**, Revit 2024, IFC2X3, unidade
**metro**). O hidro está hoje na modelagem de **27/11/2026**
(`HIDRO TIPO 1 E 2-MODELAGEM.ifc`, 80,7 MB de IFC → 19,9 MB de JSON): 8.542 elementos no
arquivo, **8.207 publicados** (a rede de incêndio sai, ver abaixo), 4.388.774 triângulos,
4.407,77 m de tubo, 9 pavimentos, 4 sistemas nomeados, DN 13 a 75; a montagem leva ~16 s.
A revisão anterior (`HIDRO TIPO 1 E 2(LUCAS).ifc`, 71,5 MB → 19,3 MB, 5.310 elementos,
2.353.552 triângulos, 3.530,35 m de tubo) só existe no histórico do git.

**Onde está a VRP no `hidro`.** A estação de válvula redutora de pressão aparece em três
cotas (z ≈ 22, 40 e 59 m), sempre no mesmo eixo (x ≈ 3,4; y ≈ −1,5 a −2,7), e cada uma tem
**duas linhas em paralelo** separadas por 40 cm. Por linha: uma VRP
`3 - MITECH-Valvula redutora de pressao flangeada-VRP PREMUIM` (2" nas duas estações de
baixo, 1 1/2" na de cima), um `Y_strainer-Caleffi-577` (2 1/2", 2 1/2" e 1 1/2") e um
`Manômetro de Pressao`; por estação, uma `Valvula Eliminadora de AR 1/2"` logo acima.
Bate com os três detalhes da prancha 35 (`ARTST-UNQ-CMP-EX-0035`, R00 de 10/11/2026).
Duas armadilhas: a modelagem de 27/11/2026 **não traz mais o comentário `VRP - PAV n`**
que a revisão anterior punha no parâmetro Comentários (eram `VRP - PAV 3` e `VRP - PAV 10`,
139 peças), então buscar "VRP" na aba Elementos não acha mais nada — hoje a VRP se acha
pelo nome da família. E os nomes de nível não ajudam a dizer qual é o 3º, o 9º e o 14º
pavimento da prancha: cinco cotas diferentes se chamam `1Pavimento`, então a
correspondência tem de ser feita pela cota.
A página escolhe pelo `?modelo=<chave>` da URL (sem nada, a piscina); também aceita o nome
de um `.json` da própria pasta. O seletor no cabeçalho (`#modeloSel`,
`montarSeletorModelo`) abre o outro modelo **numa aba nova** e deixa a atual como está.
Edições e apontamentos são guardados por modelo (`SUF_MODELO` entra nas chaves; a piscina
mantém as chaves antigas), e a semente de apontamentos só vale para a piscina.
O arquivo único continua sendo o da piscina: `build_standalone.py` apaga o `<select>`, e
sem ele `montarSeletorModelo` sai na primeira linha.

**Correções do projetista (`correcoes`).** A entrada do modelo pode trazer
`trocar` (por GUID: nova `descricao` e novo `dn`, com `dnFonte = 'correcao'`) e `criar`
(desenha a peça que faltou ser modelada, encostada nas portas de um certo DN da peça
indicada). `aplicarCorrecoes(M)` roda em `montar()` logo depois de `buildIfcModel`, e só
quando o modelo é o do site (`modeloDoSite`). As peças criadas são cilindros montados por
`cilindro()` nas posições que `portasDe()` lê do grafo de portas; os buffers
(`positions`, `indices`, `triElem`) são refeitos maiores e a peça ganha `criado: true`.
**É geometria inventada**, não veio do IFC. Na piscina (23/11/2026, sobre os apontamentos
do projetista): saem as 2 buchas 75x50 `2AKpYMvzT3BvWJBXEUP1fS/fU`, os dois tês sem
descrição (`38a4Zab8v5iRZIBSWafNVP`, `0uh82hoVn9RxUDRnHr2yl9`) viram "Tê, DN75mm" e o tê
do ralo lateral recebe 2 buchas 75x60 desenhadas nas bocas de DN60. Fica em 667
elementos e 499.582 triângulos; os 384,26 m de tubo não mudam.

**O mesmo em IFC (`gerar_ifc_corrigido.py`).** As correções que o leitor aplica em
memória também saem como arquivo: o script lê o IFC de `modelo.json` e grava
`ARTST-...-R02-corrigido.ifc` (21,4 MB) retirando as 2 buchas erradas (com as portas e as
relações que só falavam delas), reescrevendo `Tamanho` e `Descrição do Material` dos dois
tês e criando as 2 buchas 75x60 como `IfcFlowFitting` com cilindro extrudado (Ø75 mm,
36 mm) na `IfcAxis2Placement3D` da porta de DN60 — por isso elas caem no mesmo ponto que
o leitor desenha. Armadilhas pagas: as entidades novas vão antes do **último** `ENDSEC`
(o primeiro é o do HEADER); `ids()` enxerga o número da própria linha, então tire o
`#n=` antes de ler os argumentos; e a descrição tem de ir no pset **"Dados de
identidade"**, que é onde `buildIfcModel` procura. Conferido: 667 elementos, 0 conexão
sem descrição, 0 referência a entidade inexistente.

**Peças tiradas de um modelo.** A entrada do modelo pode trazer `fora(e)`, que vira
`window.FILTRO_ELEMENTO` em `iniciar()`; `buildIfcModel` consulta esse filtro **antes**
de guardar a peça, então ela não entra em geometria, tabela nem quantitativo (abrir um
IFC do computador limpa o filtro). No `hidro` sai a **rede de incêndio** a pedido do
projetista (19/11/2026): tudo que casa com `tupy` (tubo de aço K10 e conexões
TupyGrooved) e as caixas `00322800` 2 1/2" coladas nelas. Na modelagem de 27/11/2026 o
modelo vai de 8.542 para **8.207 elementos**, de 4.812.686 para **4.388.774 triângulos**
e de 4.605,79 para **4.407,77 m** de tubo; os **DN 10 e DN 80 somem** da legenda.
Conferido nessa revisão: nenhuma peça que casa com o filtro sobra no modelo publicado, e
o que sai é só rede de incêndio (acoplamentos e cotovelos TupyGrooved, tubo Tupy aço
carbono K10, tês de redução, adaptadores e as caixas `00322800`). Na revisão anterior era
5.310 → 5.150 elementos, 2.353.552 → 2.124.706 triângulos, 3.530,35 → 3.431,80 m, e saía
o DN 89.

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
acompanham sem tratamento extra. Com uma peça, os campos abrem **preenchidos com o valor
atual** e só o que for mudado é gravado (o resto, inclusive edição anterior, é mantido;
voltar ao valor do IFC remove a edição daquele campo). O diâmetro é uma lista suspensa
com `DN_COMERCIAIS` (20 a 200 mm) mais "Outro valor…"; um valor atual fora da lista entra
nela. Com várias peças, os campos começam em "manter" e só o que for preenchido muda.
O nome editado só aparece no painel, na tabela Elementos e na busca (as tabelas de
peças continuam agrupando por `objType`). Não há exportação das edições.

## Apontamentos (anotações por peça)

**Criar:** botão direito parado (sem arrastar, `movido < 5`) sobre a peça no visor abre
`abrirPopupApontamento` junto ao cursor (a peça é selecionada, sem zoom; Ctrl+Enter
salva, Esc ou clique fora cancela). O direito arrastando continua deslocando a câmera,
e o direito no vazio não faz nada. O painel só lista, resolve e exclui (não cria).
Seção "Apontamentos" no painel da peça (`secaoApontamentos`) e aba "Apontamentos" com a
lista geral (`renderApontamentos`, filtro todos/pendentes/concluídos, `exportarApontamentos`
gera CSV com BOM e `;` para o Excel em português). A aba sai **pendentes primeiro, concluídos
depois**, cada grupo do mais recente para o mais antigo, com uma faixa `_grupo` ("Pendentes
(n)" / "Concluídos (n)", só quando os dois aparecem) e a linha concluída esmaecida e com o
texto riscado (`tr.feito`). `tabela()` ganhou `_grupo` (faixa que ocupa todas as colunas) e
`_cls`; "Copiar tabela" ignora as faixas. Na interface a palavra é "concluído"/"pendente";
no dado continua `resolvido: true/false`. Ficam em
`localStorage['leitor-ifc-apontamentos']` como `{ guid: [{ id, texto, data, resolvido }] }`,
ligados ao GUID da peça (valem entre revisões do IFC se o GUID se mantém; apontamento de
peça que sumiu continua listado como "peça não está neste modelo"). Peças com apontamento
aberto ganham 💬n na tabela Elementos. Só no navegador de quem escreveu: o CSV é o
jeito de levar para outro PC; não há importação.

**Apontamentos de partida (`APONT_SEED`).** 26 apontamentos da verificação das
ligações do R02 vêm escritos no `index.html` e entram uma vez por navegador:
`semearApontamentos()` grava `APONT_SEED_VERSAO` em
`localStorage['leitor-ifc-apont-semeados']` e não repete enquanto a versão não mudar
(quem resolve ou exclui não vê voltar). Os `id` são `auto-<versão>-<n>`, o texto começa
com "[verificação das ligações]" e cada um aponta para o GUID da peça. Para uma nova
rodada: trocar a lista e a versão. **Conferir os GUIDs contra o modelo antes de soltar**
— apontamento de GUID inexistente fica listado como "peça não está neste modelo".
A verificação em si (grafo `IfcRelConnectsPorts` × geometria) foi feita com scripts
avulsos em Node, que não ficam no repositório.

**Apontamento de peça já corrigida (`APONT_FEITOS`).** Quando uma correção entra no
código, os GUIDs das peças envolvidas vão para essa lista: `marcarApontamentosFeitos()`
marca como concluído, uma vez por navegador (chave `leitor-ifc-apont-feitos` + versão),
todo apontamento preso a elas — inclusive os que o usuário escreveu, já que a marca é o
GUID. O texto não é alterado e nenhum outro apontamento é tocado. Hoje: os 4 GUIDs das
correções de 23/11/2026.

## Conjuntos salvos (agrupamentos de peças)

Aba **Conjuntos** (`#pane-conjuntos`, `renderConjuntos`). Um conjunto é uma lista de
GUIDs com nome, para guardar o recorte que deu origem a um quantitativo — a estação de
VRP, uma prumada, um barrilete — e voltar nele com um clique. A linha da tabela usa
`_els`/`_rotulo` de `tabela()`, então o clique cai em `selecionarConjunto` e enquadra,
igual às tabelas de peças.

- Ficam em `localStorage['leitor-ifc-conjuntos' + SUF_MODELO]` como
  `[{ id, nome, data, guids }]`, por modelo e presos ao **GUID**: atravessam a troca de
  revisão do IFC enquanto a peça mantiver o GUID. `idsDoConjunto` resolve GUID → índice
  na hora; o que sumiu não entra na seleção e a coluna "Peças" mostra "(faltam n)".
- "Salvar seleção" guarda a seleção atual (do visor ou de uma tabela). O botão **lê a
  seleção no clique e nunca fica desabilitado**: a aba não é redesenhada quando a
  seleção muda no visor, então um estado gravado na hora do desenho ficaria preso no
  valor de quando a aba abriu — foi o primeiro erro desta aba, pego no teste.
- Excluir pede **dois cliques** ("excluir" → "confirmar?") em vez de `confirm()`, que não
  funciona em iframe sem `allow-modals` — o caso da página publicada do Claude. Um
  clique em qualquer outro lugar cancela.
- **Conjunto de partida (`CONJ_SEED`), só no `hidro`:** "VRP 1.1/2" — estação do 14º pav.
  (prancha 35)", 26 peças (12 conexões, 4 registros/controle, 10 tubos). Os GUIDs saíram
  de caminhar o grafo de portas a partir das duas VRPs MITECH, limitado à cota da estação
  (z 57,4 a 60,9 m) — é o recorte usado para levantar o quantitativo das conexões. Entra
  uma vez por navegador (`leitor-ifc-conj-semeados` + `CONJ_SEED_VERSAO`), como os
  apontamentos. Para uma nova rodada, trocar a lista e a versão.
- O que esse conjunto **não** inclui, porque o grafo de portas não alcança: os 2 filtros
  Y, os 2 manômetros e a eliminadora de ar da estação. VRP e filtro Y têm 2 portas e só 1
  ligada; os manômetros não têm nenhuma. A estação está **aberta** no modelo de
  27/11/2026, e o nipel duplo bronze 1.1/2" da prancha não foi modelado.

## Exportar o quantitativo em Excel

Botão "Exportar Excel" na barra das abas (`#xlsxBtn`, `exportarQuantitativoXlsx` no fim do
`index.html`). Gera um `.xlsx` de verdade **sem biblioteca**: o arquivo é um zip de XML, montado
em `zipArmazenado` (arquivos só armazenados, sem compressão, o que pede apenas o CRC-32) e
`montarXlsx`/`planilhaXml` (texto em `inlineStr`, sem `sharedStrings`; estilos Arial em
`XLSX_ESTILOS`, índices em `XS`).
- Abas: Resumo (metros por DN, peças por categoria), Tubos por sistema, Peças, Peças por
  sistema e Elementos (uma linha por peça). Mesmas regras de `quantitativos()`.
- Leva **só o que está visível** no visor e já com as edições manuais; o Resumo diz quantos
  elementos entraram e quantos estavam editados.
- As abas de resumo são fórmulas sobre a aba Elementos, gravadas **com o valor já calculado**
  (abre certo também fora do Excel) e `fullCalcOnLoad`. As peças contam com `SUMPRODUCT` por
  igualdade exata, não `COUNTIFS` (descrição com `*`/`?` viraria curinga e a descrição vazia
  não casava). Conferido: os 171 valores gravados batem com o recálculo do LibreOffice, com e
  sem sistemas ocultos.
- Nome do arquivo: `S.nomeArquivo` (o `origem` do `modelo.json`, embutido também no arquivo
  único como `__MODELO_ORIGEM__`, ou o nome do .ifc aberto). O `FILE_NAME` interno do R02 é
  "070.ifc", por isso não serve.
- **Downloads na página publicada.** O leitor também está publicado como página do Claude
  ("Leitor IFC da Piscina", privada). Lá um `<a download>` não faz nada: todo arquivo gerado
  passa por `baixarArquivo(nome, blob)`, que usa `claude.use("downloads").save(...)` quando
  existe (a página declara a permissão `downloads`; o usuário confirma cada download) e o link
  comum fora dele. Vale para o Excel, o CSV de apontamentos e "Baixar versão offline".
  Ao mudar o leitor, republicar a página (`index.html`, `.js`, `modelo.json`, `modelo-hidro.json`
  e o arquivo único).

## Uniões embutidas em equipamentos (hoje desligado)

**Estado atual:** `SEPARAR_UNIOES = false` em `ifc-build.js`. O projetista pediu
(19/11/2026) que toda união ficasse colada no seu dispositivo, porque ela já vem no
equipamento. O leitor entrega os 667 elementos do IFC, sem sintéticos. O que vem abaixo
descreve a maquinaria, que segue inteira e volta a valer ao ligar a chave.

Várias famílias de equipamento trazem as uniões dos bocais desenhadas dentro do
mesmo elemento (o Trocador de Calor é um `IfcFlowTerminal` com 56 sólidos), então
a união e o corpo eram selecionados e contados juntos.

- `GeometryReader` registra cada sólido de folha em `geo.leaves` (faixas de
  vértices e índices). `acharUnioes` (em `ifc-build.js`) separa o sólido que
  contém uma `IfcDistributionPort` do elemento, mais as gaxetas encostadas nele;
  o corpo é o sólido de maior caixa envolvente e nunca sai.
- Cada união vira um elemento sintético no **fim** da lista (`sintetico: true`,
  `parteDe` = índice do equipamento, `guid` com sufixo `#uniaoN`), categoria
  "Conexão", DN herdado do equipamento. Com a chave ligada e sem exceções, o R02
  ia de 667 para 685 elementos (18 uniões); triângulos (499.542) e metros de tubo
  (384,26) nunca mudam — só o agrupamento.
- Vale para todo equipamento, exceto as categorias de rede em
  `CATEGORIAS_SEM_UNIAO` (tubo, conexão, registro...): ali os sólidos são partes
  do próprio corpo, como as pontas de um joelho. E exceto as famílias em
  `FAMILIAS_SEM_UNIAO` (dosador de cloro e gerador de cloro BZ40), que continua
  valendo como filtro mais fino se a chave voltar a ser ligada.
- Só conta como união o sólido compacto: menor lado ≥ 3 cm, maior lado ≤ 15 cm e
  volume ≤ 10% do equipamento (`pareceUniao`). Esses limites foram calibrados
  neste modelo; sem eles, a regra tirava a grade do dreno, o corpo das bombas,
  as chapas de retornos e da caixa sifonada e as peças dos refletores.
  Com a chave ligada, separava: trocador (4), gerador de cloro (4), dosador (2),
  lâmpada UV (2) e filtros V-30 e V-80 (3 cada). Se entrar outro modelo, conferir.

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

- **Navegação pelo botão do meio** (pedido de 19/11/2026): sozinho desloca
  (vertical e horizontal), **Shift + meio gira**. O esquerdo seleciona (parado,
  `movido < 5`; Shift/Ctrl somam) e o direito parado abre apontamento. `modoDoBotao`
  devolve 0 para o direito, e por isso `movido` passou a ser contado em
  `pointermove` antes do `if (!arrastando)`: sem isso, arrastar com o esquerdo e
  soltar longe contaria como clique e selecionaria a peça errada. É preciso barrar
  `mousedown` do botão do meio, senão o Chrome abre a rolagem automática.

  **Mais duas vias para o giro (26/11/2026).** O giro dependia de um botão do meio,
  que trackpad, celular e o painel de navegador do app Claude não têm — ali não
  sobrava via nenhuma, e o giro parecia ter sumido. Então:
  **Shift + arrastar o esquerdo gira** e **Shift + setas gira** (as setas sozinhas
  continuam deslocando). O botão do meio não mudou. Shift + arrastar o esquerdo não
  atropela a seleção porque ela só acontece com `movido < 5`: Shift + clique
  **parado** continua somando à seleção, e um tremor de poucos pixels gira menos de
  1° e ainda seleciona.
  Conferido no Chromium com eventos reais de mouse (26/11/2026): meio sozinho
  desloca 7,7 m sem mudar ângulo; Shift + meio, Shift + esquerdo e Shift + seta
  giram sem mexer no alvo; arrastar o esquerdo sem Shift não mexe na vista; clique
  parado seleciona e Shift + clique parado soma (conjunto = 2). O giro também foi
  testado **depois** de clicar, dar zoom, abrir tabela, abrir popup de apontamento e
  arrastar com o esquerdo: nunca trava.

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

## Instalar no celular (PWA)

O site é instalável: `manifest.json` + `sw.js` + os ícones PNG (`icone-192`,
`icone-512`, `icone-mascara-512`, `apple-touch-icon`, `favicon`), gerados por
`gerar_icones.py` (um tê hidráulico branco sobre o azul `--accent`).

- O Chrome do Android só oferece "instalar aplicativo" quando existem **manifesto
  e service worker com `fetch`** — por isso o `sw.js` não é opcional.
- `sw.js`: casca (HTML, scripts, ícones) pré-baixada na instalação e servida do
  cache revalidando por trás; **modelos `.json` só entram no cache depois de
  abertos uma vez** (6 a 20 MB, não dá para pré-baixar); `.ifc` e `.xlsx` ficam
  sempre na rede, são downloads. Ao mudar o `sw.js`, subir a constante `VERSAO`,
  senão o cache velho continua valendo.
- No `index.html` tudo isso vive entre os marcadores `<!-- pwa:ini/fim -->`
  (cabeça) e `<!-- pwa:js:ini/fim -->` (registro, no fim do corpo).
  `build_standalone.py` apaga os dois: no arquivo único seriam links quebrados.
- O painel de navegador do app Claude **não registra service worker**
  ("unknown error when fetching the script") mesmo servindo o `sw.js` com 200;
  conferir a instalação no celular ou no Chrome normal, não ali.

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
