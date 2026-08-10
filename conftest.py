"""Torna o pacote mm_common (na raiz do repo) importável nos testes dos serviços
Python. Rodar `pytest` a partir da raiz do repo pega isto automaticamente.
Em Docker, cada imagem COPIA mm_common/ pro /app, então não precisa disto lá."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
