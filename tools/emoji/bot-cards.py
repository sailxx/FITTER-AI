"""Собрать карточки Telegram и иконки языков: python tools/emoji/bot-cards.py."""

from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
EMOJI = ROOT / "icons" / "fun"
CARDS = ROOT / "assets" / "telegram" / "bot-cards"
ANDROID = ROOT / "android" / "app" / "src" / "main" / "res" / "drawable-nodpi"


def flag(code):
    width, height = 432, 288
    image = Image.new("RGBA", (width, height), "white")
    draw = ImageDraw.Draw(image)
    if code == "ru":
        draw.rectangle((0, 96, width, 191), fill="#2450BD")
        draw.rectangle((0, 192, width, height), fill="#E43848")
    else:
        for row in range(0, 13, 2):
            draw.rectangle((0, round(row * height / 13), width, round((row + 1) * height / 13) - 1), fill="#CC3246")
        blue_width, blue_height = 176, 155
        draw.rectangle((0, 0, blue_width, blue_height), fill="#29427C")
        for row in range(9):
            for col in range(6 - row % 2):
                x = blue_width * (col + 0.5 + 0.5 * (row % 2)) / 6
                y = blue_height * (row + 0.5) / 9
                points = []
                for point in range(10):
                    angle = (point / 5 - 0.5) * pi
                    radius = 6 if point % 2 == 0 else 2.5
                    points.append((x + radius * cos(angle), y + radius * sin(angle)))
                draw.polygon(points, fill="white")
    # Мягкая тень снизу и блик сверху, как на остальных иконках FITTER.
    shade = Image.new("RGBA", image.size)
    lighting = ImageDraw.Draw(shade)
    for y in range(height):
        t = y / (height - 1)
        color = (255, 255, 255, round(50 * (1 - t) ** 3)) if t < 0.5 else (15, 24, 56, round(45 * t ** 3))
        lighting.line((0, y, width, y), fill=color)
    image = Image.alpha_composite(image, shade)
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=49, fill=255)
    image.putalpha(mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((3, 3, width - 4, height - 4), radius=46, outline=(20, 42, 56, 40), width=4)
    # Telegram принимает квадратные иконки 100×100, Android использует прямоугольные флаги.
    square = Image.new("RGBA", (500, 500))
    square.alpha_composite(image, (34, 106))
    square.resize((100, 100), Image.Resampling.LANCZOS).save(EMOJI / f"flag-{code}.png")
    image.resize((144, 96), Image.Resampling.LANCZOS).save(ANDROID / f"ic_flag_{code}.png")
    return image


def card(name, icons):
    width, height = 720, 360
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / (height - 1)
        color = tuple(round(a + (b - a) * t) for a, b in zip((46, 222, 148), (18, 177, 110)))
        draw.line((0, y, width, y), fill=color)
    overlay = ImageDraw.Draw(image, "RGBA")
    for radius in (122, 156, 190):
        overlay.ellipse((360 - radius, 180 - radius, 360 + radius, 180 + radius), outline=(255, 255, 255, 46), width=2)
    for x, icon in icons:
        image.paste(icon, (x - icon.width // 2, 180 - icon.height // 2), icon)
    image.save(CARDS / f"{name}.jpg", quality=89, optimize=True)


CARDS.mkdir(parents=True, exist_ok=True)
flags = {code: flag(code).resize((136, 91), Image.Resampling.LANCZOS) for code in ("ru", "en")}
card("language", [(280, flags["ru"]), (440, flags["en"])])
for command, icon in {"today": "chart", "week": "calendar", "profile": "profile", "help": "help"}.items():
    symbol = Image.open(EMOJI / f"{icon}.png").convert("RGBA").resize((170, 170), Image.Resampling.LANCZOS)
    card(command, [(360, symbol)])
