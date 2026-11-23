import json
import urllib.request
import urllib.error
for service in ("https://vse-proekty-ian-1.onrender.com", "https://vse-proekty-ian.onrender.com"):
    url=service+"/api/health"
    try:
        with urllib.request.urlopen(url, timeout=50) as resp:
            status=resp.status
            body=json.load(resp)
    except urllib.error.HTTPError as e:
        status=e.code
        body=json.loads(e.read().decode("utf8"))
    summary = {
        "status": status,
        "ok": body.get("ok"),
        "providers": body.get("aiProviders"),
        "alice": (body.get("aiProviderStatus") or {}).get("aliceTextConfigured"),
        "alice_missing": (body.get("aiProviderStatus") or {}).get("aliceMissingEnvironment"),
    }
    print("PRESENTATION PROVIDERS", service, json.dumps(summary,ensure_ascii=False))

