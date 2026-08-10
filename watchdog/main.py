#!/usr/bin/env python3
"""Mamometro Watchdog — retry policy p/ o downloader.

Cobre os gaps de retry que o cs-demo-downloader nao tem:
  1. GAME COORDINATOR HANG: o downloader pode travar no "Requesting
     game data" (conexao com a Valve) sem timeout. O run inteiro fica
     preso e so' a proxima execucao do cron tentaria de novo.
  2. Falhas de download (GCPD/ETIMEDOUT): o cron re-tenta, mas se o
     run travar, nem chega a tentar.

Politica:
  - Dentro da janela do cron (CRON_WINDOW, default 17-23h local):
    se NAO ha .dem novo em /demos por STALE_MIN (default 45min),
    o downloader provavelmente travou -> restarta o container via
    docker-socket-proxy (POST /containers/{name}/restart). O restart
    re-triggera runOnStartup, dando um run novo.
  - Fora da janela: idle e' normal (sem demos), nao faz nada.

O restart e' barato e idempotente: o downloader rele o config, roda
o job de novo, ou fica esperando o proximo cron.
"""

from __future__ import annotations

import os
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

DEMOS_DIR = Path(os.environ.get("DEMOS_DIR", "/demos"))
SOCKET = os.environ.get("DOCKER_SOCKET", "http://docker-socket-proxy:2375")
CONTAINER = os.environ.get("CONTAINER_NAME", "mamometro-downloader")
CHECK_SEC = int(os.environ.get("CHECK_SEC", "600"))      # loop a cada 10 min
STALE_MIN = int(os.environ.get("STALE_MIN", "45"))        # sem demo novo = travado
WINDOW = os.environ.get("CRON_WINDOW", "17-23")           # janela local (hora)
TZ = os.environ.get("TZ", "America/Sao_Paulo")


def newest_mtime(path: Path) -> float:
    """Maior mtime de qualquer arquivo sob `path` (inclui /temp). 0 se vazio."""
    newest = 0.0
    if not path.exists():
        return 0.0
    for p in path.rglob("*"):
        if p.is_file():
            try:
                newest = max(newest, p.stat().st_mtime)
            except OSError:
                continue
    return newest


def in_window() -> bool:
    try:
        lo, hi = (int(x) for x in WINDOW.split("-"))
    except ValueError:
        lo, hi = 17, 23
    h = datetime.now().hour
    return lo <= h <= hi


def restart_container() -> bool:
    url = f"{SOCKET}/containers/{CONTAINER}/restart"
    req = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"[watchdog] restart {CONTAINER}: HTTP {resp.status}", flush=True)
            return True
    except (urllib.error.HTTPError, urllib.error.URLError, OSError) as exc:
        print(f"[watchdog] ERRO ao restart {CONTAINER}: {exc}", flush=True)
        return False


def downloader_started_at() -> float:
    """Epoch do StartTime do container via socket-proxy. 0 se nao conseguir."""
    url = f"{SOCKET}/containers/{CONTAINER}/json"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            import json
            data = json.loads(resp.read())
            started = (data.get("State") or {}).get("StartedAt", "")
            if started:
                from datetime import datetime, timezone
                # Ex: "2026-08-09T20:00:00.123456789Z"
                dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
                return dt.timestamp()
    except Exception as exc:  # noqa: BLE001
        print(f"[watchdog] ERRO ao ler StartTime de {CONTAINER}: {exc}", flush=True)
    return 0.0


def main() -> None:
    print(
        f"[watchdog] iniciando: demos={DEMOS_DIR} socket={SOCKET} "
        f"container={CONTAINER} janela={WINDOW}h stale={STALE_MIN}min "
        f"check={CHECK_SEC}s tz={TZ}",
        flush=True,
    )
    while True:
        try:
            if not in_window():
                print(
                    f"[watchdog] fora da janela {WINDOW}h — idle (sem acao)",
                    flush=True,
                )
            else:
                newest = newest_mtime(DEMOS_DIR)
                age_min = float("inf") if newest == 0 else (time.time() - newest) / 60.0
                # IMPORTANTE: so' julga "travado" se o downloader ESTA rodando
                # ha' > STALE_MIN e NAO produziu demo nesse periodo inteiro.
                # Se acabou de comecar (janela abriu, cron rodando) ou o ultimo
                # demo e' recente, nao e' travamento — e' trabalho em andamento.
                started = downloader_started_at()
                uptime_min = float("inf") if started == 0 else (time.time() - started) / 60.0
                if age_min > STALE_MIN and uptime_min > STALE_MIN:
                    print(
                        f"[watchdog] travado: downloader up ha {uptime_min:.0f}min, "
                        f"sem .dem novo ha {age_min:.0f}min (> {STALE_MIN}). "
                        f"Restartando {CONTAINER}...",
                        flush=True,
                    )
                    restart_container()
                else:
                    print(
                        f"[watchdog] ok: ultimo .dem ha {age_min:.0f}min, "
                        f"downloader up ha {uptime_min:.0f}min",
                        flush=True,
                    )
        except Exception as exc:  # noqa: BLE001 — watchdog nunca deve morrer
            print(f"[watchdog] erro no loop: {exc}", flush=True)
        time.sleep(CHECK_SEC)


if __name__ == "__main__":
    main()
