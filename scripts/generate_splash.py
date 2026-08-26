#!/usr/bin/env python3
"""Generate splash screen images from the app launcher icon."""
from PIL import Image
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'src', 'main', 'res')
ICON = os.path.join(BASE, 'mipmap-xxxhdpi', 'ic_launcher.png')
BG_COLOR = (255, 255, 255)  # white, matches ic_launcher_background
ICON_RATIO = 0.25  # icon covers 25% of the smallest splash dimension

# Splash screen sizes per Android density bucket (Capacitor defaults)
SPLASH_SIZES = {
    'drawable-port-mdpi':    (320, 480),
    'drawable-port-hdpi':    (480, 800),
    'drawable-port-xhdpi':   (720, 1280),
    'drawable-port-xxhdpi':  (960, 1600),
    'drawable-port-xxxhdpi': (1280, 1920),
    'drawable-land-mdpi':    (480, 320),
    'drawable-land-hdpi':    (800, 480),
    'drawable-land-xhdpi':   (1280, 720),
    'drawable-land-xxhdpi':  (1600, 960),
    'drawable-land-xxxhdpi': (1920, 1280),
    'drawable':              (480, 320),  # fallback
}

def generate():
    icon = Image.open(ICON).convert('RGBA')
    for folder, (w, h) in SPLASH_SIZES.items():
        splash = Image.new('RGB', (w, h), BG_COLOR)
        min_dim = min(w, h)
        icon_size = int(min_dim * ICON_RATIO)
        resized = icon.resize((icon_size, icon_size), Image.LANCZOS)
        x = (w - icon_size) // 2
        y = (h - icon_size) // 2
        splash.paste(resized, (x, y), resized)
        out = os.path.join(BASE, folder, 'splash.png')
        splash.save(out, 'PNG')
        print(f'{folder}: {w}x{h} -> icon {icon_size}px')
    print('Done!')

if __name__ == '__main__':
    generate()
