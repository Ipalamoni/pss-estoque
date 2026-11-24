#!/usr/bin/env python3
# Confere as atualizações do banco antes de aplicar:
#  · UPDATE/DELETE sem WHERE: o Supabase RECUSA (proteção "safeupdate") — use "where true" quando for de propósito.
# Uso: python3 ferramentas/checar_sql.py banco/atualizar-banco-vX.Y.sql [...]
import re, sys
erros = 0
for arq in sys.argv[1:]:
    s = open(arq, encoding='utf-8').read()
    s_sem_coment = re.sub(r'--[^\n]*', '', s)
    for m in re.finditer(r'(?<![\w.])(update|delete\s+from)\s+(?!or\b)[^;]*?;', s_sem_coment, re.I | re.S):
        cmd = m.group(0)
        if re.search(r'on\s+conflict', s_sem_coment[max(0, m.start() - 40):m.start()], re.I):   # "... do update set" (ON CONFLICT)
            continue
        if re.search(r'\bfor\s+each\s+row\b|\bon\s+public\.', cmd, re.I) and re.search(r'\btrigger\b|after\s+insert', s_sem_coment[max(0, m.start() - 80):m.start()], re.I):
            continue
        if not re.search(r'\bwhere\b', cmd, re.I):
            erros += 1
            print(f'{arq}:{s_sem_coment[:m.start()].count(chr(10)) + 1}: UPDATE/DELETE sem WHERE (o Supabase recusa): {" ".join(cmd.split())[:110]}')
print('OK: nenhum UPDATE/DELETE sem WHERE' if not erros else f'{erros} problema(s)')
sys.exit(1 if erros else 0)
