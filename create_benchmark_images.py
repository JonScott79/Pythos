import os
import io
import base64
from PIL import Image, ImageDraw, ImageFont

os.makedirs('benchmark_images', exist_ok=True)

def save_image_as_b64(img, path):
    img.save(path, 'JPEG', quality=85)
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG", quality=85)
    return base64.b64encode(buffered.getvalue()).decode('utf-8')

# Case 1: Clean printed worksheet with printed problem + handwritten steps
img1 = Image.new('RGB', (800, 500), color='#fafaf9')
d1 = ImageDraw.Draw(img1)
d1.text((30, 30), "Algebra I - Homework 4", fill='#1e293b')
d1.text((30, 60), "Problem 1: Solve for x:  3x + 7 = 22", fill='#0f172a')
# Student handwriting simulation (curved strokes / blue ink)
d1.text((60, 130), "3x = 22 - 7", fill='#1d4ed8')
d1.text((60, 180), "3x = 15", fill='#1d4ed8')
d1.text((60, 230), "x = 5", fill='#1d4ed8')
d1.rectangle([(50, 220), (130, 260)], outline='#1d4ed8', width=2)
save_image_as_b64(img1, 'benchmark_images/case1_printed_hw.jpg')

# Case 2: Messy handwriting with ambiguous characters (3x vs 8x vs 3pi), crossed out work
img2 = Image.new('RGB', (800, 600), color='#fefce8') # lined paper tint
d2 = ImageDraw.Draw(img2)
# Draw lined notebook lines
for y in range(40, 600, 35):
    d2.line([(0, y), (800, y)], fill='#e2e8f0', width=1)
d2.line([(90, 0), (90, 600)], fill='#fca5a5', width=1) # margin line

d2.text((110, 50), "2. Calculate area: r = 4", fill='#0f172a')
# Crossed out line
d2.text((120, 110), "A = 2 * pi * r = 8pi", fill='#334155')
d2.line([(115, 120), (320, 120)], fill='#ef4444', width=3) # strike-through
# Messy line with ambiguous writing
d2.text((120, 160), "A = pi * r^2", fill='#1e1b4b')
d2.text((120, 210), "A = 16pi  ~  50.26", fill='#1e1b4b')
# Ambiguous annotation in the corner: looks like 8x or 3x or 3pi
d2.line([(280, 250), (280, 290)], fill='#1e1b4b', width=2)
d2.arc([(270, 240), (290, 270)], 0, 360, fill='#1e1b4b', width=2)
d2.arc([(270, 265), (290, 295)], 0, 360, fill='#1e1b4b', width=2)
d2.text((295, 260), "x?", fill='#1e1b4b')
save_image_as_b64(img2, 'benchmark_images/case2_messy_crossedout.jpg')

# Case 3: Handwritten fractions, exponents, and inequalities (pi, sqrt, <=, >=)
img3 = Image.new('RGB', (800, 550), color='#ffffff')
d3 = ImageDraw.Draw(img3)
d3.text((30, 30), "Calculus & Limits Review", fill='#000000')
d3.text((40, 80), "Evaluate:  lim_{x -> 0} (sin(2x) / x)", fill='#111827')
# Student work:
d3.text((60, 140), "= lim_{x -> 0} 2 * (sin(2x) / 2x)", fill='#0369a1')
d3.text((60, 200), "= 2 * (1) = 2", fill='#0369a1')
d3.text((40, 270), "Inequality:  sqrt(x^2 + 9) >= 5", fill='#111827')
d3.text((60, 320), "x^2 + 9 >= 25", fill='#0369a1')
d3.text((60, 370), "x^2 >= 16  ==>  |x| >= 4", fill='#0369a1')
save_image_as_b64(img3, 'benchmark_images/case3_fractions_inequalities.jpg')

# Case 4: Physics diagram - inclined plane with vectors
img4 = Image.new('RGB', (800, 550), color='#f8fafc')
d4 = ImageDraw.Draw(img4)
d4.text((30, 30), "AP Physics 1: Inclined Plane Dynamics", fill='#0f172a')
# Draw triangle incline
d4.polygon([(100, 400), (600, 400), (600, 180)], outline='#334155', fill='#e2e8f0', width=3)
# Draw block on incline
d4.polygon([(320, 275), (380, 245), (410, 295), (350, 325)], outline='#0f172a', fill='#94a3b8', width=2)
d4.text((355, 275), "m = 5kg", fill='#0f172a')
# Incline angle
d4.arc([(150, 360), (220, 430)], 330, 360, fill='#0f172a', width=2)
d4.text((230, 380), "theta = 30 deg", fill='#0f172a')
# Gravity vector
d4.line([(365, 285), (365, 380)], fill='#dc2626', width=2)
d4.text((370, 350), "mg", fill='#dc2626')
# Normal force
d4.line([(365, 285), (395, 225)], fill='#2563eb', width=2)
d4.text((400, 215), "F_N", fill='#2563eb')
# Friction force
d4.line([(365, 285), (420, 255)], fill='#16a34a', width=2)
d4.text((425, 245), "f_k (mu = 0.2)", fill='#16a34a')
d4.text((50, 470), "Find the acceleration a down the ramp. (g = 9.8 m/s^2)", fill='#0f172a')
save_image_as_b64(img4, 'benchmark_images/case4_physics_incline.jpg')

# Case 5: Geometry diagram with angles and circle
img5 = Image.new('RGB', (800, 550), color='#ffffff')
d5 = ImageDraw.Draw(img5)
d5.text((30, 30), "Geometry: Circle Theorems", fill='#000000')
# Circle
d5.ellipse([(200, 100), (550, 450)], outline='#0f172a', width=3)
d5.ellipse([(370, 270), (380, 280)], fill='#0f172a') # center O
d5.text((385, 260), "O", fill='#0f172a')
# Triangle inscribed
d5.polygon([(250, 390), (500, 390), (375, 100)], outline='#2563eb', width=2)
d5.text((230, 395), "A", fill='#000000')
d5.text((510, 395), "B", fill='#000000')
d5.text((375, 80), "C", fill='#000000')
d5.text((350, 130), "42 deg", fill='#dc2626')
d5.text((50, 490), "In the circle centered at O, angle ACB = 42 deg. Find angle AOB.", fill='#000000')
save_image_as_b64(img5, 'benchmark_images/case5_geometry_circle.jpg')

print("Benchmark image suite generated successfully.")
