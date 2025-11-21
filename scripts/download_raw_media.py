#!/usr/bin/env python3
"""
Script auxiliar para verificar se o `raw_media` enviado pelo ZapHub
permanece íntegro.

Uso:
    ./scripts/download_raw_media.py \
        --url "https://mmg.whatsapp.net/d/f/..." \
        --length 18462 \
        --output /tmp/message.enc

O script baixa o blob com `Accept-Encoding: identity`, compara o
tamanho com o `fileLength` do webhook e grava o arquivo resultante.
"""

import argparse
import sys
from pathlib import Path

import requests


def download_raw_media(url: str, expected_length: int, output_path: Path) -> None:
    headers = {
        "Accept-Encoding": "identity",
        "User-Agent": "ZapHub-RawMediaTester/1.0",
    }

    with requests.get(url, headers=headers, stream=True, timeout=30) as response:
        response.raise_for_status()
        total = 0
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("wb") as fp:
            for chunk in response.iter_content(chunk_size=32_768):
                if not chunk:
                    continue
                fp.write(chunk)
                total += len(chunk)

    if total != expected_length:
        raise ValueError(
            f"conteúdo com tamanho inesperado: obtido={total}, esperado={expected_length}"
        )

    print(f"raw_media salvo em {output_path} ({total} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Baixa e valida `raw_media` do ZapHub para testes"
    )
    parser.add_argument("--url", required=True, help="URL retornada pelo webhook")
    parser.add_argument(
        "--length",
        type=int,
        required=True,
        help="fileLength informado no campo raw_media",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("raw_media.bin"),
        help="Arquivo de destino",
    )

    args = parser.parse_args()

    try:
        download_raw_media(args.url, args.length, args.output)
    except Exception as exc:
        print(f"erro: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
