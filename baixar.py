import base64
import hashlib
import hmac
import requests

URL = "https://mmg.whatsapp.net/o1/v/t24/f2/m234/AQO0gqGcIENEdPRcxN0zYsaXdBtzL_TUw1IEOjSUALPAF8hCS-gdqIQpr2YcmOw6yvPCz74JpW1dXKMVS91x7gB3OWE1tbrpfOuAB28_ng?ccb=9-4&oh=01_Q5Aa3AEd8aO4sSz15_KoiLOZYkEYt_VJieXhDgbOg4_FcVSl6g&oe=6945F6D9&_nc_sid=e6ed6c"
MEDIA_KEY_B64 = "0qQSBfS90XvdjfHl/nV584WWWuSc2UlL3HnKt++VwNA="
EXPECTED_LENGTH = 33103

# Tabela mínima de magic numbers
MAGIC = {
    b"\xFF\xD8\xFF": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
    b"RIFF": "wav",  # pode ser AVI também, mas WAV é mais comum para WhatsApp
    b"OggS": "ogg",
    b"ID3": "mp3",
    b"\x00\x00\x00\x18ftyp": "mp4",
    b"ftyp": "mp4",
    b"PK\x03\x04": "zip",
    b"OpusHead": "opus",  # WhatsApp usa muito
}

def detect_extension(data: bytes) -> str:
    for sig, ext in MAGIC.items():
        if data.startswith(sig):
            return ext
    return "bin"  # fallback


def main():
    media_key = base64.b64decode(MEDIA_KEY_B64)

    print("Downloading raw file...")
    r = requests.get(URL, stream=True, timeout=30)
    raw = r.content

    print(f"Received length: {len(raw)} bytes (expected {EXPECTED_LENGTH})")
    print(f"Delta: {len(raw) - EXPECTED_LENGTH} bytes")

    # Detecta tipo real do arquivo
    ext = detect_extension(raw)
    filename = f"download.{ext}"

    # salva com extensão real
    with open(filename, "wb") as f:
        f.write(raw)

    print(f"Saved file as: {filename}")
    print(f"Detected extension: .{ext}")

    # SHA256 para auditoria
    sha256 = hashlib.sha256(raw).hexdigest()
    print(f"SHA256: {sha256}")

    # Validação MAC se possível
    if len(raw) > 32:
        mac_expected = raw[:32]
        mac_msg = raw[32:]
        mac_calc = hmac.new(media_key, mac_msg, hashlib.sha256).digest()
        print(f"MAC match: {mac_expected == mac_calc}")
    else:
        print("File too short for MAC validation.")


if __name__ == "__main__":
    main()
