#!/usr/bin/env python3
"""Compose a YouTube thumbnail from real BidetBud captures (no generative AI)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "youtube-thumbnail.jpg"
OUT_PNG = ROOT / "assets" / "youtube-thumbnail.png"

W, H = 1280, 720


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/Library/Fonts/Arial Black.ttf",
        "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    ]
    for path in candidates:
        p = Path(path)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size, index=0)
            except OSError:
                continue
    return ImageFont.load_default()


def cover_crop(img: Image.Image, tw: int, th: int, focus=(0.55, 0.48)) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("RGB")
    scale = max(tw / img.width, th / img.height)
    nw, nh = int(img.width * scale + 0.5), int(img.height * scale + 0.5)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    cx, cy = int(nw * focus[0]), int(nh * focus[1])
    left = max(0, min(nw - tw, cx - tw // 2))
    top = max(0, min(nh - th, cy - th // 2))
    return img.crop((left, top, left + tw, top + th))


def draw_outlined_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    fnt: ImageFont.ImageFont,
    fill: tuple[int, int, int],
    stroke: int,
    stroke_fill: tuple[int, int, int] = (0, 0, 0),
) -> None:
    draw.text(xy, text, font=fnt, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)


def rounded_rect_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def main() -> None:
    map_src = Image.open(ROOT / "assets" / "screens" / "near-me.webp")
    # Near-me capture is a full browser window: keep only the map pane so tabs/footer
    # do not peek through as accidental UI (reads as a messy screenshot, not a thumb).
    mw, mh = map_src.size
    map_only = map_src.crop((0, int(mh * 0.07), int(mw * 0.62), int(mh * 0.93)))
    base = cover_crop(map_only, W, H, focus=(0.52, 0.48))
    base = ImageEnhance.Contrast(base).enhance(1.18)
    base = ImageEnhance.Color(base).enhance(1.05)
    base = ImageEnhance.Brightness(base).enhance(0.72)

    # Soft left-to-right darken so type stays readable without looking like a fake grade.
    shade = Image.new("RGBA", (W, H), (9, 9, 11, 0))
    shade_draw = ImageDraw.Draw(shade)
    for x in range(W):
        # Stronger on the left (type side), lighter where the map + card read.
        t = x / (W - 1)
        a = int(175 * (1.0 - t) ** 1.35)
        shade_draw.line([(x, 0), (x, H)], fill=(9, 9, 11, a))
    base = base.convert("RGBA")
    base = Image.alpha_composite(base, shade).convert("RGB")

    # Real verification still, phone-card crop on the right.
    moka = Image.open(ROOT / "assets" / "thumb-moka-frame.jpg").convert("RGB")
    card_w, card_h = 320, 560
    moka_card = cover_crop(moka, card_w, card_h, focus=(0.5, 0.45))
    moka_card = ImageEnhance.Contrast(moka_card).enhance(1.08)
    card = Image.new("RGBA", (card_w + 16, card_h + 16), (0, 0, 0, 0))
    frame = Image.new("RGBA", (card_w + 16, card_h + 16), (24, 24, 27, 255))
    frame.putalpha(rounded_rect_mask(frame.size, 28))
    inner = moka_card.convert("RGBA")
    inner.putalpha(rounded_rect_mask(inner.size, 22))
    card.paste(frame, (0, 0), frame)
    card.paste(inner, (8, 8), inner)

    canvas = base.convert("RGBA")
    # Drop shadow under the card.
    shadow = Image.new("RGBA", card.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((6, 10, card_w + 10, card_h + 12), 28, fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    card_x, card_y = W - card_w - 54, (H - card_h) // 2
    canvas.alpha_composite(shadow, (card_x - 4, card_y - 2))
    canvas.alpha_composite(card, (card_x - 8, card_y - 8))

    draw = ImageDraw.Draw(canvas)

    # Verified chip over the photo (matches product teal, not neon AI glow).
    badge = "VERIFIED"
    bf = font(28)
    bw = int(draw.textlength(badge, font=bf))
    bx, by = card_x + 18, card_y + 22
    draw.rounded_rectangle((bx - 10, by - 8, bx + bw + 44, by + 34), 999, fill=(13, 148, 136, 245))
    draw.ellipse((bx, by - 1, bx + 22, by + 21), fill=(255, 255, 255, 255))
    draw.line((bx + 6, by + 10, bx + 10, by + 15, bx + 17, by + 6), fill=(13, 148, 136, 255), width=3)
    draw.text((bx + 30, by - 2), badge, font=bf, fill=(255, 255, 255, 255))

    # Logo lockup top-left from the real mark file.
    logo = Image.open(ROOT / "assets" / "bidetbud-logo.png").convert("RGBA")
    logo = logo.resize((72, 80), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (48, 36))
    name_f = font(42)
    draw_outlined_text(draw, (136, 52), "BidetBud", name_f, (250, 250, 250), 4)

    # YouTube-style claim: big, few words, thick stroke. Yellow is platform-native, not Midjourney pastel.
    line1 = "10,490 BIDETS"
    line2 = "ON ONE MAP"
    f1 = font(118)
    f2 = font(96)
    # Measure and left-align in the open map area.
    x0, y0 = 52, 250
    draw_outlined_text(draw, (x0, y0), line1, f1, (250, 204, 21), 10)
    draw_outlined_text(draw, (x0, y0 + 130), line2, f2, (250, 250, 250), 9)

    sub_f = font(36)
    draw_outlined_text(
        draw,
        (x0, y0 + 255),
        "Real places. Real evidence.",
        sub_f,
        (228, 228, 231),
        4,
    )

    final = canvas.convert("RGB")
    final.save(OUT, quality=92, optimize=True, progressive=True)
    final.save(OUT_PNG, optimize=True)
    print(f"wrote {OUT}")
    print(f"wrote {OUT_PNG}")


if __name__ == "__main__":
    main()
