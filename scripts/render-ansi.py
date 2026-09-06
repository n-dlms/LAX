#!/usr/bin/env python3
"""Render a captured ANSI terminal session (via `script`) to a PNG using pyte + PIL."""
import sys
import pyte
from PIL import Image, ImageDraw, ImageFont

raw_path, out_png = sys.argv[1], sys.argv[2]
cols, rows = int(sys.argv[3]) if len(sys.argv) > 3 else 100, int(sys.argv[4]) if len(sys.argv) > 4 else 34

data = open(raw_path, "rb").read().decode("utf-8", errors="replace")
# drop script(1) wrapper noise; its header ends with a bare \n (no \r), so
# normalize with a leading CR to avoid inheriting the header's cursor column
start = data.find("\n", data.find("not executed on terminal")) if "not executed" in data else 0
data = "\r" + data[start + 1:]

screen = pyte.Screen(cols, rows)
stream = pyte.ByteStream(screen)
stream.feed(data.encode("utf-8"))

FG = {"black": (60,60,70), "red": (255,105,97), "green": (87,227,137), "yellow": (255,209,102),
      "blue": (110,180,255), "magenta": (214,150,255), "cyan": (103,232,249), "white": (240,244,255),
      "brown": (205,170,125), "default": (210,215,225), "grey": (140,146,160)}
BG_DEFAULT = (16, 18, 26)
BG = {"red": (120,40,40), "green": (34,95,60), "yellow": (120,95,25), "cyan": (18,90,105),
      "grey": (55,58,68), "blue": (40,70,120), "black": (0,0,0), "default": BG_DEFAULT, "brown": (95,75,40)}

font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 15)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 15)
CW, CH = 9, 20
img = Image.new("RGB", (cols*CW, rows*CH), BG_DEFAULT)
draw = ImageDraw.Draw(img)

for y in range(rows):
    for x in range(cols):
        ch = screen.buffer[y][x]
        fg = FG.get(ch.fg, FG["default"]) if ch.fg else FG["default"]
        if ch.bold and ch.fg in ("cyan","white","green","yellow"):
            fg = tuple(min(255, c+40) for c in fg)
        bg = BG.get(ch.bg, BG_DEFAULT) if ch.bg else BG_DEFAULT
        if ch.reverse:
            fg, bg = bg if ch.bg else FG["default"], fg if ch.fg else BG_DEFAULT
        px, py = x*CW, y*CH
        if bg != BG_DEFAULT or ch.reverse:
            draw.rectangle([px, py, px+CW, py+CH], fill=bg)
        if ch.underscore:
            draw.line([px, py+CH-2, px+CW, py+CH-2], fill=fg)
        if ch.data.strip():
            f = bold if ch.bold else font
            draw.text((px, py+2), ch.data, font=f, fill=fg)

img.save(out_png)
print(f"{out_png} ({cols}x{rows})")
