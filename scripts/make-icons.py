from PIL import Image, ImageDraw, ImageFilter
import math, os

SIZE = 1024
CX, CY = 512, 500
H = 250
LEFT, RIGHT = CX - H, CX + H
OUT_S, IN_S = 140, 60
RIDGES = [116, 92]

C = {
    "navy_top": (26, 74, 128, 255),
    "navy_bot": (42, 99, 160, 255),
    "cream": (245, 237, 220, 255),
    "ridge": (176, 122, 58, 255),
    "white_a": (255, 255, 255, 38),
    "glow": (255, 255, 255, 30),
}

DIST = {"favicon-16.png": 16, "favicon.png": 32, "favicon-48.png": 48,
        "icons/icon-192.png": 192, "icons/icon-512.png": 512, "icons/icon-1024.png": 1024}

def radius(sag):
    return (H * H + sag * sag) / (2 * sag)

def cy_for(sag):
    return CY + radius(sag) - sag

def arc_points(sag, steps=200):
    r = radius(sag)
    cy = cy_for(sag)
    pts = []
    for i in range(steps + 1):
        x = LEFT + (RIGHT - LEFT) * i / steps
        y = cy - math.sqrt(max(r * r - (x - CX) ** 2, 0))
        pts.append((x, y))
    return pts

def vertical_gradient(top, bottom, w, h):
    grad = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        grad.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return grad.resize((w, h))

def rounded_rect_mask(w, h, radius):
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return mask

def build_master():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = vertical_gradient(C["navy_top"][:3], C["navy_bot"][:3], SIZE, SIZE).convert("RGBA")
    img.paste(bg, (0, 0))
    d = ImageDraw.Draw(img)
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([CX - 300, CY - 240, CX + 300, CY + 240], fill=C["glow"])
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([185, 322, 839, 678], radius=140, fill=C["white_a"],
                        outline=(255, 255, 255, 110), width=5)
    d.rounded_rectangle([185, 322, 839, 678], radius=140, outline=(255, 255, 255, 60), width=5)
    outer = arc_points(OUT_S, 220)
    inner = arc_points(IN_S, 220)[::-1]
    d.polygon(outer + inner, fill=C["cream"])
    for sag, width in [(RIDGES[0], 20), (RIDGES[1], 20)]:
        pts = arc_points(sag, 200)
        d.line(pts, fill=C["ridge"], width=width, joint="curve")
    img = img.filter(ImageFilter.GaussianBlur(0.4)).convert("RGBA")
    mask = rounded_rect_mask(SIZE, SIZE, 224)
    img.putalpha(mask)
    return img

def svg_coords(pts):
    return " ".join(f"{x / 2:.1f} {y / 2:.1f}" for x, y in pts)

def emit_svg(path):
    outer = arc_points(OUT_S, 60)
    inner = arc_points(IN_S, 60)[::-1]
    body = svg_coords(outer + inner)
    paths = [f'<path d="M {body} Z" fill="#f5eddc"/>']
    for sag in RIDGES:
        pts = svg_coords(arc_points(sag, 60))
        paths.append(f'<path d="M {pts}" fill="none" stroke="#b07a3a" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Le Petit Atelier Français — croissant">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a4a80"/>
      <stop offset="100%" stop-color="#2a63a0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <ellipse cx="256" cy="258" rx="190" ry="150" fill="#ffffff" opacity="0.12"/>
  <rect x="92" y="161" width="328" height="178" rx="70" fill="#ffffff" opacity="0.13" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2.5"/>
  {''.join(paths)}
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
        resized = master.resize((size, size), Image.LANCZOS)
        if name.endswith(".png"):
            resized.save(out)
        else:
            resized.save(out)
        print("wrote", out)
    emit_svg(os.path.join(root, "icons", "icon.svg"))
    emit_svg(os.path.join(root, "logo.svg"))
    print("wrote svg")

main()