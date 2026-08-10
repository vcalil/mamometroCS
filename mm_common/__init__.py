"""Código compartilhado pelos serviços Python do Mamômetro (demo-parser,
roster-sync, watchdog). Antes cada serviço duplicava o init do Firebase Admin
e os accessors de env — agora vivem aqui.

Layout: pacote simples na raiz do repo. Em Docker, cada imagem COPIA a pasta
mm_common/ pro /app ao lado do pacote do serviço; local, roda com PYTHONPATH
incluindo a raiz do repo (ver os conftest.py dos serviços)."""

__version__ = "0.1.0"
