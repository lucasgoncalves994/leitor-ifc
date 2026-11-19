# Estrutura e aparência do leitor (receita do HTML)

Este documento descreve como o `index.html` do leitor de IFC é montado: o esqueleto
da página, o sistema de cores, a tipografia, os componentes visuais e as poucas
funções de JavaScript que sustentam tudo. É o suficiente para montar outra
ferramenta com a mesma cara — um visor com painéis laterais, gaveta de tabelas e
dois temas — sem copiar o conteúdo deste projeto.

Resumo do que caracteriza o padrão:

- **Um arquivo só** (`index.html`): HTML, CSS e a interface em JavaScript, sem
  framework e sem etapa de compilação. As bibliotecas e a camada de dados entram
  como `<script src>` clássicos.
- **Prancha de projeto**: cabeçalho fino, painel esquerdo (controles), visor no
  centro, painel direito (propriedades), gaveta de tabelas embaixo.
- **Dois temas sobre os mesmos tokens** CSS, com claro/escuro/automático.
- **Densidade alta**: fonte base de 13 px, tabelas compactas, rótulos em caixa
  alta numa fonte condensada, números em fonte monoespaçada.

---

## 1. Esqueleto do HTML

A ordem dos elementos no `<body>` é a própria estrutura do layout. Nada de
`position:absolute` para montar a página: só flexbox.

```html
<body>
  <div class="loading" id="loading">…</div>   <!-- tela de carregamento, position:fixed -->

  <header>…</header>                          <!-- faixa fina, não encolhe -->

  <div class="body">                          <!-- a faixa do meio, cresce -->
    <aside id="painelEsq">…</aside>           <!-- controles -->
    <div class="rsz" id="rszEsq"></div>       <!-- alça de redimensionamento -->
    <div class="stage" id="stage">            <!-- visor; position:relative -->
      <canvas id="cv"></canvas>
      <div class="viewbtns">…</div>           <!-- sobreposições do visor -->
      <div class="hud" id="hud"></div>
      <button class="aba" id="abaDir">Propriedades</button>
    </div>
    <div class="rsz" id="rszDir"></div>
    <aside class="right" id="painelDir">…</aside>   <!-- propriedades -->
  </div>

  <div class="rsz h" id="rszBaixo"></div>     <!-- alça horizontal -->

  <div class="drawer" id="gaveta">            <!-- gaveta de tabelas -->
    <div class="tabs">
      <button class="tab on" data-pane="resumo">Resumo</button>
      …
      <span class="spacer"></span>
      <button class="btn" id="copyBtn">Copiar tabela</button>
    </div>
    <div class="tabwrap">
      <div class="tabpane on" id="pane-resumo"></div>
      …
    </div>
  </div>

  <script src="…"></script>
  <script> /* a interface inteira */ </script>
</body>
```

O CSS que sustenta isso é curto:

```css
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;overflow:hidden}  /* a página não rola */

header{flex:0 0 auto}
.body{flex:1 1 auto;display:flex;min-height:0}            /* min-height:0 é essencial */
aside{width:252px;flex:0 0 252px;overflow-y:auto;display:flex;flex-direction:column}
aside.right{width:296px;flex-basis:296px}
.stage{flex:1 1 auto;position:relative;min-width:0}
canvas{display:block;width:100%;height:100%;touch-action:none}

.drawer{flex:0 0 auto;display:flex;flex-direction:column;max-height:46vh}
.tabwrap{flex:1 1 auto;overflow:auto;min-height:0}
```

Três detalhes que costumam passar batido:

- **`min-height:0`** em `.body` e `.tabwrap`. Sem isso, um filho que rola faz o
  contêiner flex crescer além da tela e a página inteira ganha barra de rolagem.
- **`overflow:hidden` no `body`**: quem rola são os painéis e a gaveta, nunca a
  página. É o que dá a sensação de aplicativo em vez de documento.
- **`display:block` no canvas**: sem isso ele é inline e sobra uma faixa de
  alguns pixels embaixo. `touch-action:none` entrega os gestos ao seu código.

---

## 2. Cores: um conjunto de tokens, dois temas

Todas as cores da interface são variáveis CSS no `:root`. O tema escuro apenas
redefine os mesmos nomes — nenhuma regra de componente conhece cor literal.

```css
:root{
  color-scheme: light;
  --bg:#eef1f5;          /* fundo da página */
  --surface:#ffffff;     /* painéis, cabeçalho, gaveta */
  --surface-2:#f3f6f9;   /* linha destacada, cartões */
  --surface-3:#e6ebf1;   /* botão comum */
  --line:#cdd6e0;        /* bordas */
  --line-soft:#e1e7ee;   /* divisórias internas */
  --text:#16222f;
  --text-dim:#55677c;    /* texto secundário */
  --text-faint:#7d8ea3;  /* rótulos e legendas */
  --accent:#1d6fc4;      /* seleção, foco, aba ativa */
  --accent-dim:#d4e6f8;  /* fundo do estado ativo */
  --good:#17895e; --warn:#9a6508; --crit:#b3272c;
  --conj:#d35400;        /* destaque de conjunto */
  --sel-linha:#d4e6f8;   /* linha selecionada na tabela */
  --visor:#f4f6f9;       /* fundo do canvas */
  --r:6px;               /* raio padrão */
}
```

Os três estados de tema:

```css
/* 1. automático: segue o sistema, a menos que o usuário tenha forçado "claro" */
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){ color-scheme: dark; --bg:#0f141b; … }
}
/* 2. forçado escuro */
:root[data-theme="dark"]{ color-scheme: dark; --bg:#0f141b; … }
/* 3. forçado claro: é o próprio :root base */
```

E, no `<head>`, **antes de qualquer CSS**, um script de três linhas aplica a
escolha guardada. Sem ele a página pisca no tema errado por um quadro:

```html
<script>
(function () {
  var r = document.documentElement;
  var m = null;
  try { m = localStorage.getItem('app-tema'); } catch (e) {}
  if (m === 'light' || m === 'dark') r.setAttribute('data-theme', m);
})();
</script>
```

O botão de tema gira entre três valores — automático, claro, escuro — gravando
(ou apagando) `data-theme` e a chave no `localStorage`. `color-scheme` em cada
tema é o que deixa barras de rolagem e controles nativos na cor certa.

---

## 3. Tipografia

Três famílias, cada uma com um papel fixo:

```css
--display:"IBM Plex Sans Condensed",…;  /* rótulos em CAIXA ALTA, títulos, abas */
--body:"IBM Plex Sans",system-ui,…;     /* texto corrido da interface */
--mono:"IBM Plex Mono",ui-monospace,…;  /* números, códigos, nomes de arquivo */
```

Regras que dão a aparência técnica:

- Base de **13 px** com `line-height:1.45`; tabelas em 12 px; rótulos entre 9,5 e
  11 px.
- Todo rótulo de seção usa a condensada em caixa alta, com
  `letter-spacing:.07em` e cor `--text-faint`. É o que "assina" o visual.
- Todo número usa `font-variant-numeric:tabular-nums` para as colunas alinharem.
- Peso: 400 no texto, 600 nos números grandes e nas abas, 700 só no título.

---

## 4. Componentes

Cada um é uma classe curta, sem aninhamento profundo.

**Cabeçalho.** `header` em flex: marca à esquerda (`.brand h1` + `.file` em mono),
`.meta` com `margin-left:auto` empurrando as fichas de metadados para a direita, e
os botões no fim.

**Ficha (`.chip`).** Caixinha de leitura, em mono, 10,5 px, borda fina e fundo
`--surface-2`. Serve para metadados no cabeçalho e para o HUD sobre o visor.

**Botão (`.btn`).** `inline-flex`, fundo `--surface-3`, borda `--line`, raio
`--r`. No `:hover` só `filter:brightness(1.06)` e a borda vira `--accent` — assim
o mesmo CSS funciona nos dois temas. `.btn.pri` é a variante de destaque, com
fundo `--accent-dim`.

**Seção de painel (`.sec`).** Bloco com `padding:12px 14px` e divisória
`--line-soft`. O título é `h2` na fonte display, 10,5 px, caixa alta.
`.sechead` põe o título e o "×" de recolher na mesma linha.

**Legenda (`.lrow`).** Uma grade de quatro colunas
(`grid-template-columns:14px 1fr auto auto`): amostra de cor, nome com
reticências, contagem em mono e um botão "isolar" que só aparece no `:hover`
(`visibility:hidden` → `visible`). Item desligado fica com `opacity:.33`.

**Cartão de parâmetro (`.kp`).** O destaque do painel de propriedades: fundo
`--surface-2`, borda fina e uma **barra colorida de 3 px à esquerda**
(`border-left:3px solid`) que muda por tipo de dado (`.kp.dn` verde, `.kp.tp`
azul, `.kp.sys` âmbar). Dentro: rótulo (`.k`), valor grande (`.v`, 14 px, 600) e
a procedência em itálico (`.src`).

**Lista de propriedades.** `dl.props` com `grid-template-columns:auto 1fr`: termo
em `--text-dim`, valor em mono. Grupos extras ficam em `<details class="pset">`,
com o `summary` na fonte display em caixa alta.

**Números do resumo (`.tile`).** Cartão com rótulo pequeno, número em 21 px e
unidade em 11 px ao lado.

**Tabelas.** `border-collapse:collapse`, `th` em caixa alta com
`position:sticky;top:0` e fundo `--surface` (o contêiner que rola é o
`.tabwrap`). Colunas numéricas levam a classe `n` (alinhada à direita, em mono).
Os estados vivem em classes de linha: `.sel` (fundo `--sel-linha`), `.conj`
(faixa lateral `inset 3px 0 0 var(--conj)`), `.tot` (totais em negrito),
`.grupo` (faixa que separa blocos, ocupando todas as colunas) e `.feito`
(concluído: texto esmaecido e riscado).

**Abas da gaveta (`.tab`).** Botão sem fundo, com `border-bottom:2px solid
transparent`; a ativa ganha a cor e a borda `--accent`. Os painéis são
`.tabpane` com `display:none`, e `.on` liga o que está visível. Um só ouvinte de
clique na barra resolve tudo:

```js
tabs.addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b) mostrarPane(b.dataset.pane);
});
```

**Sobreposições do visor.** Ficam dentro de `.stage` (que é `position:relative`):
`.viewbtns` (coluna de botões no canto superior direito), `.hud` (fichas no canto
inferior esquerdo, com `pointer-events:none` para não roubar o clique),
`.ocultbar` (barra de ação centralizada no topo) e `.apopup` (caixa flutuante
junto ao cursor, com `z-index` alto e sombra forte).

**Painéis retráteis.** Cada painel tem um "×" (`.fechar`) e, quando recolhido,
deixa no lugar uma aba vertical (`.aba`) com `writing-mode:vertical-rl` colada à
borda do visor. O estado vai para o `localStorage`.

**Alças de redimensionamento (`.rsz`).** Uma faixa de 6 px entre o painel e o
visor, com `cursor:col-resize` (ou `row-resize` na variante `.h`) e um traço
central desenhado por `::after`. O arrasto usa eventos de ponteiro e escreve a
largura direto no `flex-basis` do painel.

**Tela de carregamento (`.loading`).** `position:fixed;inset:0`, centralizada em
flex, com título, barra de progresso (`.bar > i` com `width` animada) e uma linha
de mensagem em mono. Uma classe `.hidden{display:none !important}` serve para
tudo na página.

---

## 5. O JavaScript que a estrutura exige

Nenhum framework — só dois auxiliares e uma função de tabela.

```js
const $ = s => document.querySelector(s);
const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;   // textContent, nunca innerHTML com dado lido
  return n;
};
```

A função `tabela(colunas, linhas)` recebe dados e devolve um `<table>` pronto.
Cada linha é um objeto em que as chaves com `_` são metadados e `c` são as
células:

```js
tabela(
  [{ t: 'Sistema' }, { t: 'Metros', n: 1 }],      // n: 1 = coluna numérica
  [
    { _grupo: 'Pendentes (3)' },                  // faixa separadora
    { _el: 42, _cls: 'feito', c: ['Retorno', '12,40'] },   // _el = id clicável
    { _tot: true, c: ['Total', '384,26'] }
  ]
);
```

Vantagem de concentrar isso num lugar: ordenação, seleção por clique (incluindo
Shift para intervalo e Ctrl para somar), "copiar tabela" e os estados visuais
valem para todas as tabelas de uma vez.

O estado da interface fica num objeto único (`S`) e as preferências do usuário em
chaves próprias do `localStorage`, todas com o mesmo prefixo:

```js
localStorage['app-tema']          // claro / escuro / automático
localStorage['app-painel-esq']    // painel recolhido
```

---

## 6. Responsivo

Dois pontos de quebra, só o necessário:

```css
@media (max-width:1100px){            /* painéis mais estreitos */
  aside{width:216px;flex-basis:216px}
  aside.right{width:244px;flex-basis:244px}
}
@media (max-width:860px){             /* empilha tudo */
  .rsz{display:none}
  .aba{display:none !important}
  body{overflow:auto}                 /* aqui a página rola mesmo */
  .body{flex-direction:column}
  aside,aside.right{width:auto;flex-basis:auto;border:none;border-bottom:1px solid var(--line)}
  .stage{height:56vh;min-height:320px;order:-1}   /* o visor vem primeiro */
  .drawer{max-height:none}
}
```

Na versão empilhada os painéis **não recolhem**: sem o visor ao lado não há onde
pôr a aba de reabrir, então eles ficam sempre visíveis.

---

## 7. Como montar do zero

1. `index.html` com o esqueleto da seção 1 e o script de tema no `<head>`.
2. Cole o bloco de tokens (seção 2) e escolha as cores. Mexa só nos tokens.
3. Defina as três famílias de fonte e use a condensada em todo rótulo.
4. Escreva os componentes na ordem em que aparecem: `header`, `.sec`, `.btn`,
   `.chip`, tabelas, abas. Nenhum deles passa de dez linhas de CSS.
5. Adicione os auxiliares `$` e `el`, a função `tabela` e um objeto de estado.
6. Só então ligue os dados. A interface não deve saber de onde eles vêm — no
   nosso caso é um parser próprio em outro arquivo, carregado antes.

### Armadilhas que custaram tempo

- Esquecer `min-height:0` nos contêineres flex que rolam.
- `position:sticky` no `th` só funciona se **o contêiner que rola** for o pai da
  tabela, não a página.
- Cor literal dentro de um componente: funciona num tema e quebra no outro.
  Hover por `filter:brightness()` resolve a maioria dos casos.
- Barrar o `mousedown` do botão do meio no canvas, senão o Chrome abre a rolagem
  automática no meio do arrasto.
- `innerHTML` com texto vindo do arquivo lido. Use `textContent`; se precisar de
  marcação, monte os nós.

---

## 8. Licença e fontes

As fontes são a família **IBM Plex** (Open Font License), carregadas do Google
Fonts. Na versão de arquivo único elas vão embutidas em base64 dentro do próprio
HTML, para o arquivo abrir sem internet. Qualquer par "condensada + texto +
mono" serve; o que importa é manter os três papéis.
