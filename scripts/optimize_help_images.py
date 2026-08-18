"""Optimize help illustrations: resize to max 832px wide (2x for ~416dp mobile),
convert to palette-optimized PNG for smallest file size."""

from PIL import Image
import os

SRC = os.path.join(os.path.dirname(__file__), '..', 'Materials', 'illustrations')
DST = os.path.join(os.path.dirname(__file__), '..', 'public', 'help')

os.makedirs(DST, exist_ok=True)

TARGET_W = 832  # 2x for ~416dp mobile viewport

names = [
    'hero.png',        # 1
    'purpose.png',     # 2
    'analysis.png',    # 3
    'provider.png',    # 4
    'settings.png',    # 5
    'features.png',    # 6
    'calories.png',    # 7
    'water.png',       # 8
    'sleep.png',       # 9
    'tips.png',        # 10
]

for i, name in enumerate(names, 1):
    src_path = os.path.join(SRC, f'{i}.png')
    dst_path = os.path.join(DST, name)
    
    img = Image.open(src_path).convert('RGBA')
    orig_size = os.path.getsize(src_path)
    
    w, h = img.size
    if w > TARGET_W:
        ratio = TARGET_W / w
        new_size = (TARGET_W, int(h * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    
    img_quantized = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    img_quantized.save(dst_path, 'PNG', optimize=True)
    new_size = os.path.getsize(dst_path)
    
    print(f'{i}. {name}: {orig_size/1024:.0f}KB -> {new_size/1024:.0f}KB ({new_size/orig_size*100:.0f}%) [{img.size[0]}x{img.size[1]}]')

total_new = sum(os.path.getsize(os.path.join(DST, n)) for n in names)
total_orig = sum(os.path.getsize(os.path.join(SRC, f'{i}.png')) for i in range(1, 11))
print(f'\nTotal: {total_new/1024:.0f}KB (was {total_orig/1024:.0f}KB, {total_new/total_orig*100:.0f}%)')
