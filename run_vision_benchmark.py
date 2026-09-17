import os
import json
import time
import base64
import urllib.request
import urllib.error

MODELS = ['llava:7b', 'minicpm-v:latest', 'llama3.2-vision:latest']
CASES = [
    {
        'id': 'case1_printed_hw',
        'file': 'benchmark_images/case1_printed_hw.jpg',
        'prompt': 'Read this image carefully. Transcribe the problem statement, and separately describe the student\'s handwritten work. If anything is uncertain, state it.'
    },
    {
        'id': 'case2_messy_crossedout',
        'file': 'benchmark_images/case2_messy_crossedout.jpg',
        'prompt': 'Read this homework page. Identify: 1. The original question. 2. What was crossed out. 3. What the student wrote as their active attempt. 4. If any writing is ambiguous or unclear, explicitly report your uncertainty.'
    },
    {
        'id': 'case3_fractions_inequalities',
        'file': 'benchmark_images/case3_fractions_inequalities.jpg',
        'prompt': 'Transcribe all mathematical formulas, fractions, limits, and inequalities shown in this image in LaTeX.'
    },
    {
        'id': 'case4_physics_incline',
        'file': 'benchmark_images/case4_physics_incline.jpg',
        'prompt': 'Analyze this physics diagram. Extract all given parameters, mass, angle, vectors (F_N, mg, friction), and the question asked.'
    },
    {
        'id': 'case5_geometry_circle',
        'file': 'benchmark_images/case5_geometry_circle.jpg',
        'prompt': 'Analyze this geometry diagram. Extract the geometric points, circle center, inscribed angle, and what angle needs to be calculated.'
    }
]

def load_b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

results = {}

for model in MODELS:
    print(f"\n==========================================")
    print(f"BENCHMARKING MODEL: {model}")
    print(f"==========================================")
    results[model] = {}
    
    for case in CASES:
        print(f"  -> Running {case['id']}...")
        b64_img = load_b64(case['file'])
        
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": case['prompt'],
                    "images": [b64_img]
                }
            ],
            "stream": False,
            "options": {
                "temperature": 0.1
            }
        }
        
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            'http://localhost:11434/api/chat',
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        
        start_t = time.time()
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                res_json = json.loads(resp.read().decode('utf-8'))
                elapsed = time.time() - start_t
                out_content = res_json.get('message', {}).get('content', '')
                results[model][case['id']] = {
                    'elapsed_sec': round(elapsed, 2),
                    'output': out_content,
                    'error': None
                }
                print(f"    [OK] Done in {elapsed:.1f}s. Length: {len(out_content)} chars.")
        except Exception as e:
            elapsed = time.time() - start_t
            results[model][case['id']] = {
                'elapsed_sec': round(elapsed, 2),
                'output': '',
                'error': str(e)
            }
            print(f"    [ERR] Error: {e}")

with open('benchmark_results.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print("\nBenchmark completed. Results written to benchmark_results.json.")
