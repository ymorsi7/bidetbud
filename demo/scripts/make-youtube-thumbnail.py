#!/usr/bin/env python3
"""Three visually distinct BidetBud YouTube A/B thumbnails.

Goals (from feedback):
- Not nearly identical layouts
- BIG type readable at ~160px feed size
- Colorful / eye-catching
- Still modern (Avenir Next / SF Rounded) - not Impact yellow scream
- Product = map app for Muslims / 20-30, not "hot bidet" meme
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SCREENS = ASSETS / "screens"
DESKTOP = Path.home() / "Desktop"

W, H = 1280, 720

AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"
HELV = "/System/Library/Fonts/HelveticaNeue.ttc"

# Avenir Next: 8 Bold, 10 Heavy, 6 Demi, 4 Medium
FACE = {"heavy": 10, "bold": 8, "demi": 6, "medium": 4}


def font(size: int, weight: str = "bold", rounded: bool = False) -> ImageFont.FreeTypeFont:
    if rounded and Path(ROUNDED).exists():
        try:
            return ImageFont.truetype(ROUNDED, size=size)
        except OSError:
            pass
    idx = FACE.get(weight, 8)
    for path, index in ((AVENIR, idx), (AVENIR, 8), (HELV, 1), (ROUNDED, 0)):
        p = Path(path)
        if not p.exists():
            continue
        try:
            return ImageFont.truetype(str(p), size=size, index=index)
        except OSError:
            try:
                return ImageFont.truetype(str(p), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def cover_crop(img: Image.Image, tw: int, th: int, focus=(0.5, 0.45)) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("RGB")
    scale = max(tw / img.width, th / img.height)
    nw, nh = int(img.width * scale + 0.5), int(img.height * scale + 0.5)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    cx, cy = int(nw * focus[0]), int(nh * focus[1])
    left = max(0, min(nw - tw, cx - tw // 2))
    top = max(0, min(nh - th, cy - th // 2))
    return img.crop((left, top, left + tw, top + th))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def soft_shadow(size: tuple[int, int], radius: int, blur: int = 24, alpha: int = 150) -> Image.Image:
    pad = blur * 2
    layer = Image.new("RGBA", (size[0] + pad * 2, size[1] + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        (pad, pad + 8, pad + size[0], pad + size[1] + 8),
        radius,
        fill=(0, 0, 0, alpha),
    )
    return layer.filter(ImageFilter.GaussianBlur(blur))


def phone_frame(screen: Image.Image, frame_w: int, frame_h: int, focus=(0.5, 0.4)) -> Image.Image:
    bezel = 11
    radius = 42
    outer = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    od = ImageDraw.Draw(outer)
    od.rounded_rectangle((0, 0, frame_w - 1, frame_h - 1), radius, fill=(15, 15, 18, 255))
    od.rounded_rectangle((1, 1, frame_w - 2, frame_h - 2), radius - 1, outline=(255, 255, 255, 40), width=1)

    inner_w = frame_w - bezel * 2
    inner_h = frame_h - bezel * 2
    fitted = cover_crop(screen, inner_w, inner_h, focus=focus).convert("RGBA")
    fitted.putalpha(rounded_mask(fitted.size, radius - 8))
    outer.alpha_composite(fitted, (bezel, bezel))

    island_w, island_h = 72, 16
    ix = (frame_w - island_w) // 2
    od.rounded_rectangle((ix, 16, ix + island_w, 16 + island_h), 9, fill=(9, 9, 11, 255))
    return outer


def place_phone(
    canvas: Image.Image,
    screen_name: str,
    phone_w: int,
    phone_h: int,
    xy: tuple[int, int],
    focus=(0.5, 0.4),
) -> None:
    phone = phone_frame(Image.open(SCREENS / screen_name), phone_w, phone_h, focus=focus)
    shadow = soft_shadow((phone_w, phone_h), 42, blur=28, alpha=160)
    px, py = xy
    canvas.alpha_composite(shadow, (px - 28, py - 20))
    canvas.alpha_composite(phone, (px, py))


def brand_mark(canvas: Image.Image, draw: ImageDraw.ImageDraw, x: int, y: int, fill=(255, 255, 255)) -> None:
    logo = Image.open(ASSETS / "bidetbud-logo.png").convert("RGBA")
    logo = logo.resize((36, 40), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (x, y))
    draw.text((x + 48, y + 6), "BidetBud", font=font(26, "demi"), fill=fill)


def text_block(
    draw: ImageDraw.ImageDraw,
    lines: list[tuple[str, ImageFont.ImageFont, tuple[int, int, int]]],
    x: int,
    y: int,
    gap: int = 8,
) -> int:
    cy = y
    for text, fnt, color in lines:
        # Soft drop only (readability) - not meme outline
        draw.text((x + 2, cy + 3), text, font=fnt, fill=(0, 0, 0, 90))
        draw.text((x, cy), text, font=fnt, fill=color)
        bbox = draw.textbbox((x, cy), text, font=fnt)
        cy = bbox[3] + gap
    return cy


def save_variant(final: Image.Image, key: str) -> None:
    rgb = final.convert("RGB")
    targets = [
        ASSETS / f"youtube-thumbnail-{key}.jpg",
        ROOT / f"youtube-thumbnail-{key}.jpg",
        DESKTOP / f"BidetBud-thumb-{key}.jpg",
        ASSETS / f"youtube-thumbnail-{key}.png",
        ROOT / f"youtube-thumbnail-{key}.png",
        DESKTOP / f"BidetBud-thumb-{key}.png",
    ]
    if key == "A":
        targets.extend(
            [
                ASSETS / "youtube-thumbnail.jpg",
                ASSETS / "youtube-thumbnail.png",
                ROOT / "youtube-thumbnail.jpg",
                ROOT / "youtube-thumbnail.png",
                DESKTOP / "BidetBud-youtube-thumbnail.jpg",
                DESKTOP / "BidetBud-youtube-thumbnail.png",
            ]
        )
    for path in targets:
        if path.suffix.lower() == ".png":
            rgb.save(path, optimize=True)
        else:
            rgb.save(path, quality=94, optimize=True, progressive=True)
        print(f"wrote {path}")


# ---------------------------------------------------------------------------
# A - SOLID EMERALD panel + huge white type + phone (identity)
# ---------------------------------------------------------------------------
def variant_a() -> Image.Image:
    canvas = Image.new("RGBA", (W, H), (6, 78, 59, 255))  # deep emerald
    # Bright diagonal wash for depth
    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for i in range(0, W + H, 4):
        a = 18 if (i // 40) % 2 == 0 else 0
        wd.line([(i, 0), (i - H, H)], fill=(16, 185, 129, a), width=4)
    # Soft mint glow right
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((700, -40, 1400, 780), fill=(52, 211, 153, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(50))
    canvas = Image.alpha_composite(canvas, wash)
    canvas = Image.alpha_composite(canvas, glow)

    # Bright map strip peeking as texture (cropped, boosted color)
    map_src = Image.open(SCREENS / "filter-masajid.webp")
    mw, mh = map_src.size
    strip = cover_crop(map_src.crop((0, int(mh * 0.12), int(mw * 0.7), int(mh * 0.9))), 520, H, (0.4, 0.5))
    strip = ImageEnhance.Color(strip).enhance(1.35)
    strip = ImageEnhance.Contrast(strip).enhance(1.1)
    strip_a = strip.convert("RGBA")
    strip_a.putalpha(110)
    canvas.alpha_composite(strip_a, (W - 520, 0))

    place_phone(canvas, "mobile-map.webp", 340, 610, (W - 400, 55), focus=(0.5, 0.38))

    draw = ImageDraw.Draw(canvas)
    brand_mark(canvas, draw, 48, 40)

    # HUGE - 3 short words max per line
    text_block(
        draw,
        [
            ("Find bidets", font(92, "heavy", rounded=True), (255, 255, 255)),
            ("at every", font(92, "heavy", rounded=True), (255, 255, 255)),
            ("masjid", font(100, "heavy", rounded=True), (167, 243, 208)),  # mint
        ],
        48,
        160,
        gap=4,
    )
    # Fat pill CTA
    draw.rounded_rectangle((48, 520, 420, 590), 999, fill=(255, 255, 255, 255))
    draw.text((78, 536), "Free map  ·  10K+", font=font(36, "bold"), fill=(6, 78, 59))
    return canvas


# ---------------------------------------------------------------------------
# B - SUNNY CREAM + coral accent + giant number (totally different palette)
# ---------------------------------------------------------------------------
def variant_b() -> Image.Image:
    canvas = Image.new("RGBA", (W, H), (255, 247, 237, 255))  # warm cream
    # Coral blob + teal blob for color
    blobs = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blobs)
    bd.ellipse((-120, -80, 520, 420), fill=(251, 146, 60, 160))  # orange
    bd.ellipse((900, 300, 1400, 820), fill=(45, 212, 191, 150))  # teal
    bd.ellipse((500, -100, 900, 200), fill=(244, 114, 182, 90))  # soft pink
    blobs = blobs.filter(ImageFilter.GaussianBlur(40))
    canvas = Image.alpha_composite(canvas, blobs)

    # World map as colorful card behind phone
    world = Image.open(SCREENS / "desktop-world.webp")
    card = cover_crop(world, 560, 560, focus=(0.55, 0.45))
    card = ImageEnhance.Color(card).enhance(1.4)
    card = ImageEnhance.Contrast(card).enhance(1.15)
    card_rgba = card.convert("RGBA")
    card_rgba.putalpha(rounded_mask(card_rgba.size, 36))
    shadow = soft_shadow((560, 560), 36, blur=22, alpha=80)
    canvas.alpha_composite(shadow, (660, 60))
    canvas.alpha_composite(card_rgba, (690, 80))

    place_phone(canvas, "mobile-map.webp", 280, 510, (860, 105), focus=(0.5, 0.4))

    draw = ImageDraw.Draw(canvas)
    # Dark brand on cream
    brand_mark(canvas, draw, 48, 40, fill=(28, 25, 23))

    # Giant number - the whole point of variant B
    draw.text((50, 150), "10K+", font=font(160, "heavy", rounded=True), fill=(234, 88, 12))  # vivid orange
    text_block(
        draw,
        [
            ("bidets.", font(88, "heavy", rounded=True), (28, 25, 23)),
            ("One map.", font(88, "heavy", rounded=True), (13, 148, 136)),
        ],
        48,
        340,
        gap=2,
    )
    draw.rounded_rectangle((48, 560, 480, 628), 999, fill=(28, 25, 23, 255))
    draw.text((78, 576), "Verified worldwide", font=font(34, "bold"), fill=(255, 247, 237))
    return canvas


# ---------------------------------------------------------------------------
# C - SPLIT: hot teal left slab / live map right (no phone) - different structure
# ---------------------------------------------------------------------------
def variant_c() -> Image.Image:
    canvas = Image.new("RGBA", (W, H), (15, 23, 42, 255))

    # Right half: bright, saturated near-me map FULL BLEED (not a tiny phone)
    near = Image.open(SCREENS / "near-me.webp")
    mw, mh = near.size
    map_crop = near.crop((0, int(mh * 0.08), int(mw * 0.65), int(mh * 0.95)))
    right = cover_crop(map_crop, 720, H, focus=(0.55, 0.48))
    right = ImageEnhance.Color(right).enhance(1.45)
    right = ImageEnhance.Contrast(right).enhance(1.2)
    right = ImageEnhance.Brightness(right).enhance(1.05)
    canvas.paste(right.convert("RGBA"), (W - 720, 0))

    # Left half: vivid teal slab with hard edge (clearly different from A/B)
    slab = Image.new("RGBA", (620, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(slab)
    sd.rectangle((0, 0, 560, H), fill=(2, 132, 199, 255))  # sky blue
    # Diagonal cut into map
    for i, x in enumerate(range(560, 620)):
        sd.rectangle((x, 0, x + 1, H), fill=(2, 132, 199, max(0, 255 - i * 5)))
    # Lime accent bar
    sd.rectangle((0, 0, 18, H), fill=(163, 230, 53, 255))
    canvas.alpha_composite(slab, (0, 0))

    # Floating "Near me" chip overlapping the split
    draw = ImageDraw.Draw(canvas)
    brand_mark(canvas, draw, 48, 36)

    text_block(
        draw,
        [
            ("A bidet", font(96, "heavy", rounded=True), (255, 255, 255)),
            ("close by", font(96, "heavy", rounded=True), (190, 242, 100)),  # lime
            ("right now", font(72, "bold", rounded=True), (224, 242, 254)),
        ],
        48,
        170,
        gap=6,
    )

    # Big location pill
    draw.rounded_rectangle((48, 520, 500, 600), 28, fill=(15, 23, 42, 255))
    draw.text((72, 542), "Masajid · food · hotels", font=font(34, "bold"), fill=(255, 255, 255))

    # Small phone peek bottom-right of map (secondary, not the whole layout)
    place_phone(canvas, "mobile-map.webp", 200, 360, (W - 230, H - 390), focus=(0.5, 0.42))
    return canvas


VARIANTS = {
    "A": {
        "title": "Find Bidets at Every Masjid | BidetBud",
        "build": variant_a,
        "look": "Emerald field + mint type + phone",
    },
    "B": {
        "title": "10K+ Bidets. One Free Map. | BidetBud",
        "build": variant_b,
        "look": "Cream + orange 10K+ + world card",
    },
    "C": {
        "title": "A Bidet Close By Right Now | BidetBud Near Me",
        "build": variant_c,
        "look": "Blue split + lime type + live map",
    },
}


def main() -> None:
    lines = [
        "BidetBud YouTube A/B pack (v2 - distinct + colorful)",
        "Studio test type: Title and thumbnail",
        "",
    ]
    for key, meta in VARIANTS.items():
        save_variant(meta["build"](), key)
        lines += [
            f"Variant {key}",
            f"  Title: {meta['title']}",
            f"  Thumb: Desktop/BidetBud-thumb-{key}.jpg",
            f"  Look:  {meta['look']}",
            "",
        ]
    guide = DESKTOP / "BidetBud-AB-titles.txt"
    guide.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {guide}")


if __name__ == "__main__":
    main()
