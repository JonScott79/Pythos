import os
import io
import base64
import math
from PIL import Image, ImageDraw, ImageFilter

os.makedirs('benchmark_images/validation_set', exist_ok=True)

def save_image(img, filename):
    filepath = os.path.join('benchmark_images/validation_set', filename)
    img.save(filepath, 'JPEG', quality=85)
    return filepath

# -------------------------------------------------------------
# Test V1: Faint Pencil, Messy Handwritten Fractions & Exponents with Error
# Student solving: 2/3 * (x^3 - 8) / (x - 2)
# Student wrote: 2/3 * (x - 2)(x^2 + 2x + 4)/(x - 2)
# But made mistake on line 3: substituted x = 2 and computed: 2/3 * (4 + 4 + 4) = 2/3 * 12 = 9 (instead of 8)
# Style: Pencil gray (#64748b, #475569), lined notebook paper background with faint smudge
# -------------------------------------------------------------
w, h = 850, 620
img_v1 = Image.new('RGB', (w, h), color='#f8fafc')
d_v1 = ImageDraw.Draw(img_v1)
# Draw faint notebook lines
for y in range(40, h, 38):
    d_v1.line([(0, y), (w, y)], fill='#e2e8f0', width=1)
d_v1.line([(100, 0), (100, h)], fill='#fca5a5', width=1)

# Printed header
d_v1.text((120, 20), "Calculus I: Limit Evaluation Worksheet", fill='#0f172a')
d_v1.text((120, 55), "Evaluate: lim_{x -> 2}  (2/3) * (x^3 - 8) / (x - 2)", fill='#1e293b')

# Faint pencil student work (simulating messy pencil with multiple strokes and vertical fractions)
pencil_color = '#475569'
d_v1.text((130, 110), "= lim_{x -> 2} (2/3) * (x - 2)(x^2 + 2x + 4) / (x - 2)", fill=pencil_color)
# Vertical fraction bar
d_v1.line([(130, 140), (450, 140)], fill=pencil_color, width=1)
d_v1.text((130, 160), "= lim_{x -> 2} (2/3) * (x^2 + 2x + 4)", fill=pencil_color)
d_v1.text((130, 210), "= (2/3) * (4 + 4 + 4)", fill=pencil_color)
d_v1.text((130, 260), "= (2/3) * 12", fill=pencil_color)
# Student error: wrote 9 instead of 8
d_v1.text((130, 310), "= 9", fill=pencil_color)
d_v1.rectangle([(120, 300), (180, 345)], outline=pencil_color, width=2)
# Faint eraser smudge near the box
d_v1.ellipse([(190, 305), (230, 335)], fill='#f1f5f9')
save_image(img_v1, 'v1_pencil_messy_fractions_mistake.jpg')

# -------------------------------------------------------------
# Test V2: Multi-colored Ink (Blue/Black/Red) with Erased/Crossed-out work & Ambiguous +/- vs +
# Topic: Quadratic formula: x^2 - 6x + 7 = 0
# Student work:
# a = 1, b = -6, c = 7
# Crossed out red: x = (6 +/- sqrt(36 - 28)) / 2 = (6 +/- sqrt(8)) / 2
# Active work: writes: x = 3 +/- sqrt(2)
# Intentionally ambiguous character in margin: looks like "+/-" vs "+" with blurred vertical stroke
# -------------------------------------------------------------
img_v2 = Image.new('RGB', (850, 600), color='#fefce8') # warm notebook yellow
d_v2 = ImageDraw.Draw(img_v2)
for y in range(40, 600, 35):
    d_v2.line([(0, y), (850, y)], fill='#cbd5e1', width=1)
d_v2.line([(90, 0), (90, 600)], fill='#f87171', width=1)

# Printed question
d_v2.text((110, 45), "Solve for exact roots:  x^2 - 6x + 7 = 0", fill='#0f172a')

# Blue ink student setup
d_v2.text((120, 105), "a = 1,  b = -6,  c = 7", fill='#1d4ed8')
# Crossed out red ink calculation (student scratched it out with wavy lines)
d_v2.text((120, 155), "x = (-(-6) +- sqrt(36 - 4*1*7)) / 2", fill='#dc2626')
d_v2.line([(115, 165), (420, 165)], fill='#dc2626', width=3)
d_v2.line([(115, 170), (420, 160)], fill='#dc2626', width=2)

# Black ink active derivation
d_v2.text((120, 210), "x = (6 +- sqrt(8)) / 2", fill='#0f172a')
d_v2.text((120, 260), "x = (6 +- 2*sqrt(2)) / 2", fill='#0f172a')
d_v2.text((120, 310), "x = 3 +- sqrt(2)", fill='#0f172a')
d_v2.rectangle([(110, 300), (280, 345)], outline='#0f172a', width=2)

# Intentionally ambiguous handwritten token in the margin: '+' with a degraded stroke or '+/-'
d_v2.text((320, 310), "x = 3", fill='#0f172a')
# Draw ambiguous sign between 3 and sqrt(2)
d_v2.line([(370, 320), (386, 320)], fill='#0f172a', width=2) # horizontal -
d_v2.line([(378, 312), (378, 328)], fill='#0f172a', width=2) # vertical +
d_v2.line([(372, 332), (384, 332)], fill='#94a3b8', width=1) # faint, smudged lower minus?
d_v2.text((395, 310), "sqrt(2) ?", fill='#0f172a')
save_image(img_v2, 'v2_colored_ink_crossedout_ambiguity.jpg')

# -------------------------------------------------------------
# Test V3: Skewed/Rotated Photo with Shadow/Lighting Glare & Tiny Writing
# Topic: Trig limits and radical inequality with pi and sqrt:
# Printed: "lim_{theta -> 0} (1 - cos(theta)) / theta^2 = 1/2"
# Small handwritten annotation: "Since cos(theta) ~ 1 - theta^2/2"
# Ambiguous handwriting: "theta" vs "0" vs "6"
# -------------------------------------------------------------
img_v3 = Image.new('RGB', (850, 600), color='#ffffff')
d_v3 = ImageDraw.Draw(img_v3)
d_v3.text((40, 50), "Advanced Trigonometric Limits", fill='#1e293b')
d_v3.text((40, 95), "Problem: Prove lim_{theta -> 0} (1 - cos theta) / theta^2 = 1/2", fill='#0f172a')

# Tiny handwritten student work
d_v3.text((60, 160), "Taylor series: cos(theta) = 1 - theta^2/2! + theta^4/4! - ...", fill='#1e40af')
d_v3.text((60, 205), "1 - cos(theta) = theta^2/2 - theta^4/24", fill='#1e40af')
d_v3.text((60, 250), "(1 - cos(theta))/theta^2 = 1/2 - theta^2/24", fill='#1e40af')
d_v3.text((60, 295), "As theta -> 0, limit = 1/2", fill='#1e40af')

# Ambiguous corner symbol: drawn like circle with top hook: could be theta, 0, or 6
d_v3.ellipse([(380, 290), (405, 320)], outline='#1e40af', width=2)
d_v3.line([(392, 290), (392, 320)], fill='#1e40af', width=2)
d_v3.text((415, 295), "= 0 ?", fill='#1e40af')

# Simulate photographic shadow gradient (darker top-left to bottom-right)
shadow = Image.new('L', (850, 600), color=255)
d_sh = ImageDraw.Draw(shadow)
for x in range(0, 400):
    alpha = int(180 + (x / 400.0) * 75)
    d_sh.line([(x, 0), (x, 600)], fill=alpha)
img_v3.paste(Image.new('RGB', (850, 600), color='#0f172a'), (0, 0), mask=shadow.filter(ImageFilter.GaussianBlur(15)))

# Slight perspective / rotation skew
img_v3 = img_v3.rotate(2.2, resample=Image.BICUBIC, expand=False, fillcolor='#e2e8f0')
save_image(img_v3, 'v3_skewed_shadow_trig_taylor.jpg')

# -------------------------------------------------------------
# Test V4: Inequalities with pi, sqrt, <=, >=, !=, Subscripts, and Ambiguous "t" vs "+"
# Topic: Physics Kinematics Inequality:
# Given: v_0 = 15 m/s, a = -9.8 m/s^2, y(t) >= 10 m
# Student derivation: 15*t - 4.9*t^2 >= 10
# Student quadratic: 4.9*t^2 - 15*t + 10 <= 0
# Ambiguous stroke: handwritten "t" without curved hook looks identical to "+"
# -------------------------------------------------------------
img_v4 = Image.new('RGB', (850, 600), color='#fafafa')
d_v4 = ImageDraw.Draw(img_v4)
d_v4.text((30, 30), "Kinematics Constraints & Inequalities", fill='#0f172a')
d_v4.text((30, 65), "Given y(t) = v_0*t - (1/2)*g*t^2 with v_0 = 15 m/s, g = 9.8 m/s^2", fill='#1e293b')
d_v4.text((30, 95), "Find all time intervals where height satisfies:  y(t) >= 10", fill='#1e293b')

# Student steps in blue ink
d_v4.text((50, 160), "15t - 4.9t^2 >= 10", fill='#1d4ed8')
d_v4.text((50, 210), "4.9t^2 - 15t + 10 <= 0", fill='#1d4ed8')
d_v4.text((50, 260), "Discriminant: D = (-15)^2 - 4(4.9)(10) = 225 - 196 = 29 > 0", fill='#1d4ed8')
d_v4.text((50, 310), "t = (15 +- sqrt(29)) / 9.8", fill='#1d4ed8')
d_v4.text((50, 360), "t_1 ~ 0.98 s,  t_2 ~ 2.08 s ==>  0.98 <= t <= 2.08 s", fill='#1d4ed8')

# Intentional ambiguity in side note: "15 + 4.9" vs "15t - 4.9t^2" where 't' is drawn as a cross '+'
d_v4.text((450, 210), "Note: 15", fill='#0f172a')
d_v4.line([(515, 212), (515, 226)], fill='#0f172a', width=2) # vertical line
d_v4.line([(508, 219), (522, 219)], fill='#0f172a', width=2) # horizontal cross
d_v4.text((530, 210), "- 10 = ?", fill='#0f172a')
save_image(img_v4, 'v4_inequalities_subscripts_t_vs_plus.jpg')

print("All 4 validation benchmark images generated successfully in benchmark_images/validation_set/")
