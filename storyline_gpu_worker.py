"""STORYLINE GPU worker template for Kaggle.

Upload this notebook/script to Kaggle and run it with GPU enabled.
Input: /kaggle/input/storyline-job/job.json
Output: /kaggle/working/result.mp4
The worker intentionally does not contain API keys; pass callback credentials as Kaggle Secrets.
"""
import json, os, subprocess, sys, urllib.request
from pathlib import Path

job_file = Path('/kaggle/input/storyline-job/job.json')
job = json.loads(job_file.read_text()) if job_file.exists() else {}
mode = job.get('mode', 'sadtalker')
source = job.get('source_image', '')
audio = job.get('audio', '')
out = Path('/kaggle/working/result.mp4')
out.parent.mkdir(parents=True, exist_ok=True)

def run(command):
    print('RUN', ' '.join(map(str, command)), flush=True)
    subprocess.run(command, check=True)

if mode == 'liveportrait':
    # Clone/install LivePortrait once in the Kaggle dataset or setup cell.
    run(['python', '/kaggle/working/LivePortrait/inference.py', '-s', source, '-d', job['driving_video'], '--output_dir', '/kaggle/working/liveportrait'])
    candidates = list(Path('/kaggle/working/liveportrait').rglob('*.mp4'))
    if not candidates: raise RuntimeError('LivePortrait output not found')
    subprocess.run(['ffmpeg', '-y', '-i', str(candidates[-1]), '-c', 'copy', str(out)], check=True)
else:
    # SadTalker uses a source image and a generated voice track.
    run(['python', '/kaggle/working/SadTalker/inference.py', '--source_image', source, '--driven_audio', audio, '--result_dir', '/kaggle/working/sadtalker'])
    candidates = list(Path('/kaggle/working/sadtalker').rglob('*.mp4'))
    if not candidates: raise RuntimeError('SadTalker output not found')
    subprocess.run(['ffmpeg', '-y', '-i', str(candidates[-1]), '-c', 'copy', str(out)], check=True)

callback = os.environ.get('STORYLINE_CALLBACK_URL')
if callback:
    payload = json.dumps({'jobId': job.get('jobId'), 'status': 'completed', 'mode': mode, 'output': str(out)}).encode()
    request = urllib.request.Request(callback, data=payload, headers={'content-type': 'application/json'}, method='POST')
    urllib.request.urlopen(request, timeout=30).read()
print(json.dumps({'status': 'completed', 'output': str(out)}))
