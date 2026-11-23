import json
import urllib.request
import urllib.error
for service in ("https://vse-proekty-ian-1.onrender.com", "https://vse-proekty-ian.onrender.com"):
    url=service+"/api/image-source-health"
    try:
        with urllib.request.urlopen(url, timeout=50) as resp:
            status=resp.status
            body=json.load(resp)
    except urllib.error.HTTPError as e:
        status=e.code
        body=json.loads(e.read().decode("utf8"))
    print(service, "status",status,"result",json.dumps(body,ensure_ascii=False))
