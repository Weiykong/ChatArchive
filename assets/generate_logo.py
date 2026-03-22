from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".tools" / "python"))

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
MASTER_SIZE = 1024
ICON_SIZES = [16, 32, 48, 128]


def lerp(start, end, amount):
    return int(start + (end - start) * amount)


def vertical_gradient(size, top_color, bottom_color):
    image = Image.new("RGBA", (size, size))
    pixels = []

    for y in range(size):
        amount = y / (size - 1)
        row = (
            lerp(top_color[0], bottom_color[0], amount),
            lerp(top_color[1], bottom_color[1], amount),
            lerp(top_color[2], bottom_color[2], amount),
            255,
        )
        pixels.extend([row] * size)

    image.putdata(pixels)
    return image


def add_glow(base, center, radius, color, blur_radius):
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    blurred = glow.filter(ImageFilter.GaussianBlur(blur_radius))
    return Image.alpha_composite(base, blurred)


def rounded_canvas(size):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size, size), radius=220, fill=255)
    return mask


def draw_shadow(base, shape_drawer, blur=24, offset=(0, 18), color=(10, 16, 30, 80)):
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    drawer = ImageDraw.Draw(shadow)
    shape_drawer(drawer, offset)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    tinted = Image.new("RGBA", base.size, color)
    tinted.putalpha(shadow.getchannel("A"))
    return Image.alpha_composite(base, tinted)


def create_document_card():
    card = Image.new("RGBA", (330, 390), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)

    draw.rounded_rectangle((26, 24, 300, 360), radius=48, fill=(207, 255, 243, 255))
    draw.polygon([(228, 24), (300, 24), (300, 96)], fill=(172, 244, 226, 255))
    draw.line((88, 126, 240, 126), fill=(15, 118, 110, 180), width=22)
    draw.line((88, 178, 240, 178), fill=(15, 118, 110, 180), width=22)
    draw.line((88, 230, 196, 230), fill=(15, 118, 110, 180), width=22)

    return card.rotate(-12, resample=Image.Resampling.BICUBIC, expand=True)


def create_logo(size=MASTER_SIZE):
    base = vertical_gradient(size, (19, 38, 70), (13, 119, 110))
    base = add_glow(base, (820, 160), 220, (255, 128, 72, 120), 70)
    base = add_glow(base, (180, 880), 280, (255, 242, 218, 90), 90)

    content = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    def bubble_shape(drawer, offset):
        dx, dy = offset
        drawer.rounded_rectangle(
            (170 + dx, 175 + dy, 750 + dx, 650 + dy),
            radius=125,
            fill=(0, 0, 0, 255),
        )
        drawer.polygon(
            [(278 + dx, 612 + dy), (382 + dx, 612 + dy), (312 + dx, 760 + dy)],
            fill=(0, 0, 0, 255),
        )

    content = draw_shadow(content, bubble_shape, blur=32, offset=(0, 24), color=(5, 10, 20, 90))
    draw = ImageDraw.Draw(content)
    draw.rounded_rectangle((170, 175, 750, 650), radius=125, fill=(255, 248, 238, 255))
    draw.polygon([(278, 612), (382, 612), (312, 760)], fill=(255, 248, 238, 255))

    line_color = (255, 123, 74, 255)
    draw.rounded_rectangle((265, 292, 612, 332), radius=20, fill=line_color)
    draw.rounded_rectangle((265, 388, 575, 428), radius=20, fill=line_color)
    draw.rounded_rectangle((265, 484, 520, 524), radius=20, fill=line_color)

    arrow_color = (255, 144, 89, 255)
    draw.line((565, 555, 770, 732), fill=arrow_color, width=42, joint="curve")
    draw.polygon([(720, 690), (842, 726), (770, 808)], fill=arrow_color)

    document = create_document_card()
    document_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    document_layer.alpha_composite(document, (610, 470))
    document_shadow = document_layer.filter(ImageFilter.GaussianBlur(14))
    shadow_alpha = document_shadow.getchannel("A").point(lambda value: int(value * 0.45))
    shadow_tint = Image.new("RGBA", (size, size), (8, 15, 26, 180))
    shadow_tint.putalpha(shadow_alpha)

    content = Image.alpha_composite(content, shadow_tint)
    content = Image.alpha_composite(content, document_layer)

    final_image = Image.alpha_composite(base, content)
    rounded = rounded_canvas(size)
    final_image.putalpha(rounded)
    return final_image


def save_assets():
    ROOT.mkdir(parents=True, exist_ok=True)
    master = create_logo()
    master.save(ROOT / "logo.png")

    for icon_size in ICON_SIZES:
        resized = master.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        resized.save(ROOT / f"icon-{icon_size}.png")


if __name__ == "__main__":
    save_assets()
