"""Renders the CADify app icon (1024x1024 PNG) used by `tauri icon`."""
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 4  # supersampling
W = 1024 * S
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))

# macOS icon grid: 824px body, centered, continuous-corner radius ~185px.
body = (100 * S, 100 * S, 924 * S, 924 * S)
shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((100 * S, 112 * S, 924 * S, 936 * S), radius=185 * S, fill=(0, 0, 0, 110))
shadow = shadow.filter(ImageFilter.GaussianBlur(18 * S))
img.alpha_composite(shadow)

# Body: subtle vertical graphite gradient.
grad = Image.new("RGBA", (W, W))
gd = ImageDraw.Draw(grad)
top, bottom = (36, 39, 46), (15, 16, 20)
for y in range(body[1], body[3]):
    t = (y - body[1]) / (body[3] - body[1])
    c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
    gd.line([(body[0], y), (body[2], y)], fill=c)
mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle(body, radius=185 * S, fill=255)
img.paste(grad, (0, 0), mask)
# Hairline highlight
ImageDraw.Draw(img).rounded_rectangle(body, radius=185 * S, outline=(255, 255, 255, 18), width=3 * S)

# Isometric cube
d = ImageDraw.Draw(img)
cx, cy, r = 512 * S, 520 * S, 250 * S
import math
dx, dy = r * math.cos(math.radians(30)), r * math.sin(math.radians(30))
top_v = (cx, cy - r)
ul = (cx - dx, cy - dy)
ur = (cx + dx, cy - dy)
c = (cx, cy)
ll = (cx - dx, cy + dy)
lr = (cx + dx, cy + dy)
bot = (cx, cy + r)
accent = (79, 140, 255)
d.polygon([top_v, ur, c, ul], fill=accent + (255,))                # top face
d.polygon([ul, c, bot, ll], fill=(52, 103, 214, 255))             # left face
d.polygon([c, ur, lr, bot], fill=(34, 74, 168, 255))              # right face
lw = 16 * S
for a, b in [(top_v, ur), (ur, lr), (lr, bot), (bot, ll), (ll, ul), (ul, top_v), (ul, c), (c, ur), (c, bot)]:
    d.line([a, b], fill=(255, 255, 255, 235), width=lw)
for p in [top_v, ur, lr, bot, ll, ul, c]:
    d.ellipse((p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2), fill=(255, 255, 255, 235))

# Drawing hint: dimension line under the cube
y = cy + r + 70 * S
d.line([(cx - dx, y), (cx + dx, y)], fill=(255, 255, 255, 120), width=7 * S)
for x in (cx - dx, cx + dx):
    d.line([(x, y - 26 * S), (x, y + 26 * S)], fill=(255, 255, 255, 120), width=7 * S)

img = img.resize((1024, 1024), Image.LANCZOS)
img.save(sys.argv[1])
