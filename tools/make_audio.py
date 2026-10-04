#!/usr/bin/env python3
"""Generate Noor's Swahili voice clips with ElevenLabs (runs in GitHub Actions).

Reads the human-written phrases in audio/phrases-sw.json and writes one MP3 per phrase to
public/audio/sw/, plus manifest.json that the app uses to play them offline.

Only missing clips are generated (file names include a hash of text + voice + model),
so re-running costs nothing once everything exists. Without ELEVENLABS_API_KEY the script
exits quietly and the app falls back to the phone's own text-to-speech.

Environment:
  ELEVENLABS_API_KEY   required to generate (GitHub repository secret)
  ELEVENLABS_VOICE_ID  optional (repository variable), default: a premade ElevenLabs voice
  ELEVENLABS_MODEL_ID  optional, default eleven_v3 (supports Swahili)
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHRASES = os.path.join(ROOT, "audio", "phrases-sw.json")
OUT = os.path.join(ROOT, "public", "audio", "sw")

key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip() or "EXAVITQu4vr4xnSDxMaL"
model = os.environ.get("ELEVENLABS_MODEL_ID", "").strip() or "eleven_v3"

phrases = json.load(open(PHRASES, encoding="utf-8"))["phrases"]
os.makedirs(OUT, exist_ok=True)

if not key:
    print("::warning::ELEVENLABS_API_KEY is not set; skipping voice clips (the app will use the phone's voice).")
    sys.exit(0)


def clip_name(pid, text):
    digest = hashlib.sha1(f"{model}|{voice}|{text}".encode("utf-8")).hexdigest()[:10]
    return f"{pid}-{digest}.mp3"


files, failed = {}, []
for pid, text in phrases.items():
    name = clip_name(pid, text)
    path = os.path.join(OUT, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        files[pid] = name
        continue
    body = json.dumps({"text": text, "model_id": model}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                audio = res.read()
            with open(path, "wb") as f:
                f.write(audio)
            files[pid] = name
            print(f"ok   {pid}: {text}")
            break
        except urllib.error.HTTPError as err:
            detail = err.read()[:300].decode("utf-8", "replace")
            if err.code == 429 and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            print(f"::warning::{pid}: HTTP {err.code} {detail}")
            failed.append(pid)
            break
        except Exception as err:  # network hiccup
            if attempt < 2:
                time.sleep(3)
                continue
            print(f"::warning::{pid}: {err}")
            failed.append(pid)
    time.sleep(0.3)

# Remove clips that no longer match any phrase (text, voice or model changed).
keep = set(files.values())
for f in os.listdir(OUT):
    if f.endswith(".mp3") and f not in keep:
        os.remove(os.path.join(OUT, f))

manifest = {
    "source": "ElevenLabs text-to-speech (synthetic voice), generated from audio/phrases-sw.json",
    "model": model,
    "voice": voice,
    "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "complete": not failed,
    "files": files,
}
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)

print(f"{len(files)} clips ready, {len(failed)} failed")
if failed and not files:
    sys.exit(1)
