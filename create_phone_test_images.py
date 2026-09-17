"""
create_phone_test_images.py
Generates real binary image files for the Pythos phone image test matrix.
"""

import os
from PIL import Image, ImageDraw, ImageFont
import pillow_heif

pillow_heif.register_heif_opener()

OUT_DIR = os.path.join(os.path.dirname(__file__), 'benchmark_images', 'phone_tests')
os.makedirs(OUT_DIR, exist_ok=True)

def get_font(size=24):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except Exception:
        return ImageFont.load_default()

# 1. Standard JPEG
im_jpg = Image.new('RGB', (800, 600), color=(255, 255, 255))
d = ImageDraw.Draw(im_jpg)
d.text((40, 40), "Standard JPEG Test", fill=(0, 0, 0), font=get_font(28))
d.text((40, 100), "Solve: 4x + 12 = 36", fill=(20, 20, 150), font=get_font(24))
im_jpg.save(os.path.join(OUT_DIR, 'test_standard.jpg'), format='JPEG', quality=90)

# 2. Standard PNG
im_png = Image.new('RGBA', (800, 600), color=(255, 255, 255, 255))
d = ImageDraw.Draw(im_png)
d.text((40, 40), "Standard PNG Test", fill=(0, 0, 0), font=get_font(28))
d.text((40, 100), "Compute: d/dx [x^3 - 5x] = 3x^2 - 5", fill=(150, 20, 20), font=get_font(24))
im_png.save(os.path.join(OUT_DIR, 'test_standard.png'), format='PNG')

# 3. Standard WebP
im_webp = Image.new('RGB', (800, 600), color=(250, 250, 245))
d = ImageDraw.Draw(im_webp)
d.text((40, 40), "Standard WebP Test", fill=(0, 0, 0), font=get_font(28))
d.text((40, 100), "Integral: int(2x dx) = x^2 + C", fill=(0, 100, 0), font=get_font(24))
im_webp.save(os.path.join(OUT_DIR, 'test_standard.webp'), format='WEBP')

# 4. iPhone HEIC Photo
im_heic = Image.new('RGB', (800, 600), color=(255, 255, 255))
d = ImageDraw.Draw(im_heic)
d.text((40, 40), "Apple iPhone HEIC Photo", fill=(0, 0, 0), font=get_font(28))
d.text((40, 100), "Problem: Evaluate lim(x->2) (x^2 - 4)/(x - 2)", fill=(10, 10, 10), font=get_font(24))
im_heic.save(os.path.join(OUT_DIR, 'test_iphone.heic'), format='HEIF')

# 5. HEIF image
im_heif = Image.new('RGB', (800, 600), color=(240, 245, 255))
d = ImageDraw.Draw(im_heif)
d.text((40, 40), "Generic HEIF Format Test", fill=(0, 0, 0), font=get_font(28))
d.text((40, 100), "Physics: F = m * a where m = 5 kg, a = 3 m/s^2", fill=(10, 10, 10), font=get_font(24))
im_heif.save(os.path.join(OUT_DIR, 'test_image.heif'), format='HEIF')

# 6. Rotated phone photo with EXIF Orientation 6 (90 degrees CW)
# Image dimensions are 600 wide x 800 high before rotation
im_rotated = Image.new('RGB', (600, 800), color=(255, 250, 240))
d = ImageDraw.Draw(im_rotated)
d.text((40, 40), "EXIF Rotated Phone Photo", fill=(0, 0, 0), font=get_font(26))
d.text((40, 100), "This text should be upright after EXIF processing.", fill=(0, 0, 180), font=get_font(20))
d.text((40, 160), "Solve: 7y - 14 = 0  =>  y = 2", fill=(0, 120, 0), font=get_font(22))
exif = im_rotated.getexif()
exif[0x0112] = 6 # Orientation 6 = rotate 90 CW for upright display
im_rotated.save(os.path.join(OUT_DIR, 'test_rotated_exif.jpg'), format='JPEG', exif=exif)

# 7. Large High-Resolution Phone Photo (4032 x 3024 - standard 12MP camera)
im_large = Image.new('RGB', (4032, 3024), color=(255, 255, 255))
d = ImageDraw.Draw(im_large)
d.text((100, 100), "High Resolution 12MP Phone Photo (4032x3024)", fill=(0, 0, 0), font=get_font(72))
d.text((100, 300), "Find the roots of: f(x) = x^2 - 9x + 20", fill=(180, 0, 0), font=get_font(64))
im_large.save(os.path.join(OUT_DIR, 'test_large_phone.jpg'), format='JPEG', quality=85)

# 8. Corrupted / Invalid Image (Truncated JPEG)
with open(os.path.join(OUT_DIR, 'test_corrupted.jpg'), 'wb') as f:
    f.write(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00CORRUPTED_TRUNCATED_PAYLOAD')

# 9. Unsupported Format (Text file renamed as image)
with open(os.path.join(OUT_DIR, 'test_unsupported.heic'), 'wb') as f:
    f.write(b'This is an ASCII text document pretending to be a HEIC file.\nIt has no valid magic bytes.')

# 10. HEIC with Handwriting
im_hw = Image.new('RGB', (1000, 750), color=(252, 252, 250))
d = ImageDraw.Draw(im_hw)
d.text((50, 40), "Homework #4 — Limits & Discontinuities", fill=(60, 60, 60), font=get_font(28))
d.text((50, 120), "Problem: Evaluate lim(x->3) (x^2 - 9)/(x - 3)", fill=(0, 0, 0), font=get_font(26))
d.text((50, 200), "Student Work:", fill=(80, 80, 80), font=get_font(22))
d.text((70, 240), "= lim(x->3) (x - 3)(x + 3) / (x - 3)", fill=(20, 40, 160), font=get_font(26))
d.text((70, 300), "= lim(x->3) (x + 3)", fill=(20, 40, 160), font=get_font(26))
d.text((70, 360), "= 3 + 3 = 6", fill=(20, 40, 160), font=get_font(26))
im_hw.save(os.path.join(OUT_DIR, 'test_heic_handwriting.heic'), format='HEIF')

# 11. HEIC with Math (Algebra Problem)
im_math = Image.new('RGB', (1000, 750), color=(255, 255, 255))
d = ImageDraw.Draw(im_math)
d.text((50, 40), "Calculus Worksheet: Quadratic Formula", fill=(0, 0, 0), font=get_font(28))
d.text((50, 130), "Find the solutions for 2x^2 - 7x + 3 = 0", fill=(0, 0, 150), font=get_font(32))
d.text((50, 230), "Using: x = (-b +/- sqrt(b^2 - 4ac)) / (2a)", fill=(40, 40, 40), font=get_font(24))
im_math.save(os.path.join(OUT_DIR, 'test_heic_math.heic'), format='HEIF')

# 12. HEIC with Physics Diagram (Inscribed Circle Geometry & Angle theta)
im_phys = Image.new('RGB', (1000, 750), color=(255, 255, 255))
d = ImageDraw.Draw(im_phys)
d.text((50, 40), "Physics & Geometry: Inscribed Angle Theorem", fill=(0, 0, 0), font=get_font(28))
d.text((50, 100), "In the circle centered at O, angle ACB = 42 degrees.", fill=(0, 0, 0), font=get_font(24))
d.text((50, 140), "Determine the measure of central angle AOB (theta).", fill=(0, 0, 0), font=get_font(24))
# Draw circle and angles
center = (500, 450)
radius = 200
d.ellipse((center[0]-radius, center[1]-radius, center[0]+radius, center[1]+radius), outline=(0, 0, 0), width=4)
# Points
pA = (center[0]-141, center[1]+141)
pB = (center[0]+141, center[1]+141)
pC = (center[0], center[1]-radius)
# Draw lines
d.line([pA, pC, pB], fill=(200, 30, 30), width=3) # Inscribed angle
d.line([pA, center, pB], fill=(30, 30, 200), width=3) # Central angle
d.text((center[0]-10, center[1]-20), "O", fill=(0, 0, 0), font=get_font(24))
d.text((pC[0]-10, pC[1]-35), "C (42 deg)", fill=(200, 30, 30), font=get_font(24))
d.text((pA[0]-35, pA[1]+10), "A", fill=(0, 0, 0), font=get_font(24))
d.text((pB[0]+15, pB[1]+10), "B", fill=(0, 0, 0), font=get_font(24))
d.text((center[0]-15, center[1]+40), "theta", fill=(30, 30, 200), font=get_font(24))
im_phys.save(os.path.join(OUT_DIR, 'test_heic_physics.heic'), format='HEIF')

print("All 12 test files created successfully in:", OUT_DIR)
for f in sorted(os.listdir(OUT_DIR)):
    p = os.path.join(OUT_DIR, f)
    print(f" - {f} ({os.path.getsize(p)} bytes)")
