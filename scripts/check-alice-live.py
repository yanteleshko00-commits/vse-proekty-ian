#!/usr/bin/env python3
"""One tiny end-to-end Yandex Alice request, through NEXORA's secured Image Studio gateway."""
import json
import urllib.request
import urllib.error

url = "https://vse-proekty-ian.onrender.com"
image_url = "https://nexora-image-studio.onrender.com"

def fetch_json(url, payload=None):
    headers = {"User-Agent": "NEXORA-Alice-smoke-test/1.0", "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, headers=headers, data=payload,
                                 method="POST" if payload is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as err:
        try: body = json.load(err)
        except Exception: body = {"error": "Request failed"}
        return err.code, body

status, image = fetch_json(image_url + "/health")
print("IMAGE STUDIO",status,"KEY_CONFIGURED",(image.get("yandexImage") or {}).get("configured"),
      "ALICE_GATEWAY",(image.get("aliceTextGateway") or {}).get("configured"))
assert status == 200 and (image.get("aliceTextGateway") or {}).get("configured"), "Image Studio gateway not deployed/configured"

status, generator = fetch_json(url + "/api/health")
print("PRESENTATIONS",status,"PROVIDERS",generator.get("aiProviders"),
      "PROXY",(generator.get("aiProviderStatus") or {}).get("aliceCredentialsViaImageStudio"))
assert status == 200 and (generator.get("aiProviderStatus") or {}).get("aliceCredentialsViaImageStudio"), "Alice proxy not configured"

status, answer = fetch_json(url + "/api/chat", {"question": "Коротко, одним словом: сколько будет два плюс два?"})
provider = answer.get("provider")
print("ALICE LIVE RESULT",{"status":status,"provider":provider,
                           "answer":str(answer.get("answer",""))[:90],
                           "error":str(answer.get("error",""))[:190]})
assert status == 200 and provider == "Alice AI LLM", "Alice AI LLM did not answer directly"
