# -*- coding: utf-8 -*-
"""Converte um .ifc em modelo.json (gzip + base64) para o leitor embutir.

Uso:  python3 preparar_modelo.py caminho/do/arquivo.ifc
"""
import base64, gzip, json, os, sys

if len(sys.argv) < 2:
    sys.exit('uso: python3 preparar_modelo.py <arquivo.ifc>')

origem = sys.argv[1]
bruto = open(origem, 'rb').read()
comprimido = gzip.compress(bruto, 9)
json.dump({
    'formato': 'gzip+base64',
    'origem': os.path.basename(origem),
    'gz': base64.b64encode(comprimido).decode()
}, open('modelo.json', 'w'))

print('modelo.json gerado')
print('  IFC original : %.1f MB' % (len(bruto) / 1048576))
print('  comprimido   : %.1f MB' % (len(comprimido) / 1048576))
print('  modelo.json  : %.1f MB' % (os.path.getsize('modelo.json') / 1048576))
