"""Upscale the approved poster and composite its original, verified QR image."""

import json
from pathlib import Path
from types import SimpleNamespace

from PIL import Image, ImageChops
from reportlab.graphics.barcode import qrencoder


POSTER_PATH = Path(r"C:\Users\kcsap\.codex\generated_images\01a082f2-1403-7370-b6b6-a7c5ddf8b77b\exec-00e1c5f4-4b48-411d-b2c5-8e5cdad505cd.png")
QR_PATH = Path(r"C:\Users\kcsap\AppData\Local\Temp\codex-clipboard-bf865a19-b7b4-4e17-b1cd-b1fe994dbe84.png")
OUTPUT_DIR = Path(__file__).resolve().parent


def sample_grid(image):
    grayscale = image.convert("L")
    bounds = grayscale.point(lambda value: 255 if value < 100 else 0).getbbox()
    assert bounds is not None, "QR image is empty"
    left, top, right, bottom = bounds
    return [
        [
            grayscale.getpixel((
                int(left + (column + 0.5) * (right - left) / 25),
                int(top + (row + 0.5) * (bottom - top) / 25),
            )) < 128
            for column in range(25)
        ]
        for row in range(25)
    ]


def decode_and_check_qr(grid):
    # Decode the supplied version-2 QR without network access or error repair.
    # Recompute all Reed-Solomon codewords to detect any damaged data modules.
    format_bits = 0
    for index in range(15):
        row = index if index < 6 else index + 1 if index < 8 else 10 + index
        format_bits |= int(grid[row][8]) << index
    matching_formats = [
        value for value in range(32)
        if qrencoder.QRUtil.getBCHTypeInfo(value) == format_bits
    ]
    assert len(matching_formats) == 1, "QR format checksum failed"
    level, mask_pattern = divmod(matching_formats[0], 8)
    template = qrencoder.QRCode(2, level)
    template.dataCache = [0] * 44
    template.makeImpl(False, mask_pattern)
    mask = qrencoder.QRUtil.getMask(mask_pattern)
    bits = [int(grid[row][column] ^ mask(row, column))
            for column, row in template.dataPosIterator()]
    codewords = [sum(bits[offset + bit] << (7 - bit) for bit in range(8))
                 for offset in range(0, 44 * 8, 8)]
    blocks = qrencoder.QRRSBlock.getRSBlocks(2, level)
    data_blocks = [[] for _ in blocks]
    position = 0
    for index in range(max(block.dataCount for block in blocks)):
        for block_index, block in enumerate(blocks):
            if index < block.dataCount:
                data_blocks[block_index].append(codewords[position])
                position += 1
    data = [value for block in data_blocks for value in block]
    reconstructed = qrencoder.QRCode.createBytes(SimpleNamespace(buffer=data), blocks)
    assert reconstructed == codewords, "QR Reed-Solomon checksum failed"
    payload_bits = "".join(f"{value:08b}" for value in data)
    cursor = 0
    segments = []
    encoding = "iso-8859-1"

    def read(count):
        nonlocal cursor
        assert cursor + count <= len(payload_bits), "Truncated QR payload"
        result = int(payload_bits[cursor:cursor + count], 2)
        cursor += count
        return result

    while cursor + 4 <= len(payload_bits):
        mode = read(4)
        if mode == 0:
            break
        if mode == 7:
            assignment = read(8)
            if assignment & 0xC0 == 0x80:
                assignment = ((assignment & 0x3F) << 8) | read(8)
            elif assignment & 0xE0 == 0xC0:
                assignment = ((assignment & 0x1F) << 16) | read(16)
            assert assignment in (3, 26), "Unsupported QR character encoding"
            encoding = "utf-8" if assignment == 26 else "iso-8859-1"
            continue
        assert mode == 4, f"Unexpected QR segment mode: {mode}"
        count = read(8)
        segments.append(bytes(read(8) for _ in range(count)).decode(encoding))
    return "".join(segments)


def main():
    source_poster = Image.open(POSTER_PATH).convert("RGB")
    source_qr = Image.open(QR_PATH).convert("RGB")
    source_grid = sample_grid(source_qr)
    source_payload = decode_and_check_qr(source_grid)
    assert source_payload, "No QR destination found"

    scale = 4
    poster = source_poster.resize(
        (source_poster.width * scale, source_poster.height * scale),
        Image.Resampling.LANCZOS,
    )
    # Preserve every source QR pixel at an exact 2x scale. Extra white padding
    # gives all four sides more than four modules of uninterrupted quiet zone.
    qr_pixels = source_qr.resize((1024, 1024), Image.Resampling.NEAREST)
    qr_field = Image.new("RGB", (1120, 1120), "white")
    qr_field.paste(qr_pixels, (48, 48))
    location = (772 * scale, 1068 * scale)
    poster.paste(qr_field, location)

    output = OUTPUT_DIR / "ml-club-interest-form-print-4x.png"
    assert not output.exists(), "Refusing to overwrite an existing deliverable"
    poster.save(output, dpi=(300, 300), optimize=True)

    saved = Image.open(output).convert("RGB")
    placed = saved.crop((location[0], location[1],
                        location[0] + 1120, location[1] + 1120))
    assert ImageChops.difference(placed, qr_field).getbbox() is None
    output_grid = sample_grid(placed)
    assert output_grid == source_grid, "QR module pattern changed"
    output_payload = decode_and_check_qr(output_grid)
    assert output_payload == source_payload, "QR destination changed"
    report = {
        "output": str(output),
        "pixels": list(saved.size),
        "dpi": 300,
        "qr_destination": output_payload,
        "qr_modules_matched": 625,
        "qr_pixel_copy_exact": True,
        "qr_checksums_valid": True,
        "network_used": False,
    }
    (OUTPUT_DIR / "print-poster-verification.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
