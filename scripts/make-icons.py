from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math, os, re

SIZE = 1024
EMOJI = "\U0001F950"

C = {
    "navy_top": (26, 74, 128, 255),
    "navy_bot": (42, 99, 160, 255),
    "glow": (255, 255, 255, 34),
}

DIST = {"favicon-16.png": 16, "favicon.png": 32, "favicon-48.png": 48,
        "icons/icon-192.png": 192, "icons/icon-512.png": 512, "icons/icon-1024.png": 1024}

def font_path():
    root = os.environ.get("SystemRoot", r"C:\Windows")
    candidates = ["seguiemj.ttf", "Segoe UI Emoji.ttf"]
    for name in candidates:
        p = os.path.join(root, "Fonts", name)
        if os.path.exists(p):
            return p
    raise RuntimeError("Segoe UI Emoji font not found")

def vertical_gradient(top, bottom, w, h):
    grad = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        grad.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return grad.resize((w, h))

def rounded_rect_mask(w, h, radius):
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return mask

def build_master():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = vertical_gradient(C["navy_top"][:3], C["navy_bot"][:3], SIZE, SIZE).convert("RGBA")
    img.paste(bg, (0, 0))
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([SIZE * 0.18, SIZE * 0.18, SIZE * 0.82, SIZE * 0.82], fill=C["glow"])
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)))
    font = ImageFont.truetype(font_path(), int(SIZE * 0.82))
    emoji_img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(emoji_img)
    bbox = draw.textbbox((0, 0), EMOJI, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text((SIZE / 2 - w / 2 - bbox[0], SIZE / 2 - h / 2 - bbox[1]), EMOJI, font=font, embedded_color=True)
    emoji_img = emoji_img.crop((0, 0, SIZE, SIZE))
    img = img.convert("RGBA")
    img.alpha_composite(emoji_img)
    img = img.filter(ImageFilter.GaussianBlur(0.3)).convert("RGBA")
    img.putalpha(rounded_rect_mask(SIZE, SIZE, 224))
    return img

def read_twemoji():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "..", "assets", "vendor", "twemoji", "1f950.svg")
    with open(path, encoding="utf-8") as fh:
        content = fh.read()
    match = re.search(r"<svg[^>]*>(.*)</svg>", content, re.S)
    return match.group(1)

def emit_svg(path):
    inner = read_twemoji()
    scale = 276 / 36
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Le Petit Atelier Français — croissant">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a4a80"/>
      <stop offset="100%" stop-color="#2a63a0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <ellipse cx="256" cy="256" rx="164" ry="164" fill="#ffffff" opacity="0.08"/>
  <g transform="translate(118 118) scale({scale:.4f})">{inner}</g>
</svg>
'''
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)

def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
    master = build_master()
    for name, size in DIST.items():
        out = os.path.join(root, name)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(out)
        print("wrote", out)
    emit_svg(os.path.join(root, "icons", "icon.svg"))
    emit_svg(os.path.join(root, "logo.svg"))
    print("wrote svg")

main()