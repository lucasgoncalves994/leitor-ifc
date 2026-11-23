# Gera os icones do site (PWA) com um desenho simples de te hidraulico:
# fundo azul da marca + tubo branco em T, com as bocas abertas.
# Desenha em 4x e reduz, para as bordas sairem suaves.
from PIL import Image, ImageDraw

AZUL = (29, 111, 196, 255)   # --accent do tema claro
ESCURO = (15, 20, 27, 255)   # --bg do tema escuro
BRANCO = (255, 255, 255, 255)
S = 4  # supersample


def capsula(d, x0, y0, x1, y1, r, cor):
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=cor)


def desenhar(lado, mascara=False):
    L = lado * S
    img = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # fundo: quadrado inteiro no icone mascaravel (o Android recorta sozinho),
    # quadrado de cantos arredondados nos demais.
    if mascara:
        d.rectangle([0, 0, L, L], fill=AZUL)
    else:
        d.rounded_rectangle([0, 0, L - 1, L - 1], radius=int(L * 0.22), fill=AZUL)

    # o te ocupa a area segura (60% do lado) para sobreviver ao recorte redondo
    c = L / 2
    meio = L * 0.30          # metade do comprimento do tubo
    esp = L * 0.115          # metade da espessura
    r = esp                  # raio das pontas
    if mascara:
        meio, esp = L * 0.24, L * 0.092
        r = esp

    # ramo horizontal
    capsula(d, c - meio, c - esp - L * 0.10, c + meio, c + esp - L * 0.10, r, BRANCO)
    # ramo vertical (para baixo)
    capsula(d, c - esp, c - esp - L * 0.10, c + esp, c - L * 0.10 + meio * 1.45, r, BRANCO)

    # bocas: circulos na cor do fundo, dando o ar de tubo oco
    boca = esp * 0.52
    for (bx, by) in ((c - meio + esp, c - L * 0.10), (c + meio - esp, c - L * 0.10), (c, c - L * 0.10 + meio * 1.45 - esp)):
        d.ellipse([bx - boca, by - boca, bx + boca, by + boca], fill=AZUL)

    return img.resize((lado, lado), Image.LANCZOS)


ARQUIVOS = [
    ('icone-192.png', 192, False),
    ('icone-512.png', 512, False),
    ('icone-mascara-512.png', 512, True),
    ('apple-touch-icon.png', 180, True),   # iOS nao arredonda sozinho: sem canto vazado
    ('favicon.png', 48, False),
]

for nome, lado, masc in ARQUIVOS:
    desenhar(lado, masc).save(nome, optimize=True)
    print(nome, lado)
