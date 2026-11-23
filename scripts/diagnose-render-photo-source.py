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


image_studio="https://nexora-image-studio.onrender.com"
with urllib.request.urlopen(image_studio + "/health",timeout=50) as response:
    data=json.load(response)
    print("IMAGE STUDIO ALICE",json.dumps({
        "status":response.status,
        "image_key_configured":(data.get("yandexImage") or {}).get("configured"),
        "alice_text_gateway":(data.get("aliceTextGateway") or {}).get("configured"),
        "missing":(data.get("aliceTextGateway") or {}).get("missing")
    },ensure_ascii=False))

# Unauthenticated requests must never have access to the Yandex key or paid AI.
probe=urllib.request.Request(
    image_studio + "/internal/alice/chat",
    method="POST",data=b"{}",headers={"Content-Type":"application/json"})
try:
    with urllib.request.urlopen(probe,timeout=40) as response:
        raise AssertionError("Internal Alice API is public! HTTP "+str(response.status))
except urllib.error.HTTPError as exc:
    print("INTERNAL ALICE ACCESS",exc.code)
    assert exc.code == 403, "Unexpected authentication behavior"
