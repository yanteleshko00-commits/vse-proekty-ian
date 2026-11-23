#!/usr/bin/env python3
"""Non-destructive production presentation smoke test. No user sessions or secrets."""
import base64
import io
import json
import os
import re
import time
import urllib.request
import urllib.error
import zipfile

SERVERS = [
    "https://vse-proekty-ian-1.onrender.com",
    "https://vse-proekty-ian.onrender.com",
]
GENERATE = os.environ.get("LIVE_GENERATE", "false").lower() == "true"

def request(url, payload=None, timeout=50):
    headers = {"User-Agent":"NEXORA-production-smoke/1.0"}
    if payload is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
        payload = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8")), res.status

def scan_file(file, name):
    data = base64.b64decode(file["base64"])
    if name.endswith(".pptx"):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            members = z.namelist()
            pages = [f for f in members if re.fullmatch(r"ppt/slides/slide\d+\.xml", f)]
            images = [f for f in members if f.startswith("ppt/media/") and not f.endswith("/")]
            print(f"pptx pages={len(pages)}, embedded images={len(images)}, bytes={len(data)}")
            if len(pages) != 7: raise AssertionError("PowerPoint page count incorrect")
            if len(images) < 4: raise AssertionError("PowerPoint still contains too few photos")
    elif name.endswith(".pdf"):
        if not data.startswith(b"%PDF"): raise AssertionError("Not a valid PDF")
        pages = len(re.findall(rb"/Type\s*/Page\b", data))
        print(f"pdf pages={pages}, bytes={len(data)}")
        if pages != 7: raise AssertionError("PDF page count incorrect")

def main():
    statuses = []
    for url in SERVERS:
        health, status = request(url + "/api/health", timeout=70)
        print(f"HEALTH {url} status={status} ok={health.get('ok')} service={health.get('service')}")
        print("providers:", ", ".join(health.get("aiProviders") or []) or "NONE")
        print("AI images enabled:", bool(health.get("imageGenerationEnabled")))
        statuses.append(health)
        if not health.get("ok") or health.get("service") != "presentation-generator":
            raise AssertionError("Unexpected health response")
    if not GENERATE:
        print("GENERATION SKIPPED: health-only check")
        return
    if not statuses[0].get("aiProviders"):
        print("GENERATION BLOCKED: no connected AI providers")
        raise AssertionError("No production AI providers configured")
    base = SERVERS[0]
    job, status = request(base + "/api/generate-project/start", {
        "topic": "Как солнечная энергия помогает экономить электричество",
        "slidesCount": 7, "style": "современная научная презентация с фотографиями",
        "firstName": "", "lastName": "", "className": "",
        "extraRequirements": "Не выдумывать исследования, опросы или статистику. Показать реальные принципы работы."
    }, timeout=70)
    if status != 202 or not job.get("jobId"):
        raise AssertionError("Generation job did not start")
    print("GENERATION STARTED:", job["jobId"][:8])
    last = ""
    deadline = time.monotonic() + 660
    while time.monotonic() < deadline:
        time.sleep(7)
        state, _ = request(base + "/api/generation-jobs/" + job["jobId"], timeout=50)
        stage = state.get("stage")
        if stage != last:
            print("STAGE:", stage, "progress:", state.get("progress"))
            last = stage
        status = state.get("status")
        if status in ("failed", "interrupted"):
            err = str(state.get("error") or "unknown")
            err = re.sub(r"(?i)(?:sk-[\w-]{12,}|key=\S+|Bearer\s+\S+)", "[REDACTED]", err)
            print("GENERATION FAILED:", err[:350])
            raise AssertionError("Production generator did not finish")
        if status == "completed":
            result = state.get("result") or {}
            slides = (result.get("project") or {}).get("presentation") or []
            files = {item["name"]: item for item in result.get("files") or []}
            print("GENERATION COMPLETED slides:", len(slides), "files:", list(files))
            if len(slides) != 7: raise AssertionError("Expected 7 content and product slides")
            photo_slides = [x for x in slides if x.get("imageUrl") and x.get("imageCredit")]
            print("PHOTO SLIDES:", len(photo_slides))
            for x in photo_slides: print("PHOTO:", str(x["imageCredit"])[:145])
            if len(photo_slides) < 3: raise AssertionError("Wikimedia photos are still missing")
            for name in ("Презентация_проекта.pptx", "Презентация_проекта.pdf"):
                if name not in files: raise AssertionError("Missing "+name)
                scan_file(files[name], name)
            print("GENERATION SUCCESS")
            return
    raise TimeoutError("Generator did not finish within 11 minutes")

if __name__ == "__main__":
    main()
