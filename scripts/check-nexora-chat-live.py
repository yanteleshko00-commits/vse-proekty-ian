#!/usr/bin/env python3
"""Live, no-billing acceptance check for the new NEXORA Chat UI and API security."""
import json
import urllib.error
import urllib.request

lobby = "https://nexora-lobby.onrender.com"
generators = ["https://vse-proekty-ian.onrender.com", "https://vse-proekty-ian-1.onrender.com"]

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={
        "User-Agent": "NEXORA-chat-production-smoke/1.0"}), timeout=65) as r:
        return r.status, r.read().decode("utf8"), {k.lower(): v for k, v in r.headers.items()}

status, html, headers = get(lobby + "/chat")
assert status == 200 and "text/html" in headers.get("content-type", "")
for field in ['id="sidebar"', 'id="conversation"', 'data-model="alice"',
              'data-model="gpt"', 'data-model="auto"', 'id="history"',
              'id="new-chat"', 'id="message-input"']:
    assert field in html, "Missing live UI: " + field
assert "/api/nexora-chat" in html
assert "Чем могу" in html and "помочь?" in html
assert 'class="workspace is-empty"' in html
assert 'data-model="alice"' in html and "<strong>Стандартный</strong>" in html
assert "Алиса" not in html and "Yandex AI" not in html
assert html.index('id="composer"') < html.index('class="prompts"')
print("CHAT DESIGN", "centered prompt=OK", "no Alice branding=OK", "suggestions below input=OK")
assert ".composer textarea,\n  .search { font-size: 16px; }" in html, "iPhone input zoom safeguard missing from deployed site"
assert "void submit(suggestion)" in html, "Idea cards only prefill without sending"
assert 'id="chat-signin-notice"' in html, "Guests do not see a sign-in action"
print("CHAT IDEAS", "one-tap send=OK", "guest sign-in guidance=OK")
print("CHAT MOBILE", "iOS focus zoom fix=OK")

assert "frame-ancestors 'none'" in headers.get("content-security-policy", "")
print("CHAT PAGE", status, "menu=OK", "alice=OK", "gpt=OK", "auto=OK")

status, content, headers = get(lobby + "/health")
health = json.loads(content)
print("NEXORA HEALTH", status, "chatConfigured", health.get("chatConfigured"), "oauthConfigured",health.get("oauthConfigured"))
assert status == 200 and health.get("chatConfigured") is True

data = json.dumps({"model": "alice", "messages": [{"role":"user", "content":"Привет"}]}).encode()
request = urllib.request.Request(lobby + "/api/nexora-chat", data=data, method="POST",
    headers={"Content-Type":"application/json"})
try:
    with urllib.request.urlopen(request,timeout=50) as r:
        raise AssertionError("Guest should not access paid AI API!")
except urllib.error.HTTPError as error:
    print("GUEST AUTH",error.code)
    assert error.code == 401

for url in generators:
    status, content, _ = get(url + "/api/health")
    health = json.loads(content)
    providers = health.get("aiProviders", [])
    assert status == 200 and "Alice AI LLM" in providers, "Alice missing in " + url
    request = urllib.request.Request(url + "/api/nexora-chat/internal", data=data, method="POST",
        headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(request,timeout=40) as r:
            raise AssertionError("Generator internal chat unexpectedly public!")
    except urllib.error.HTTPError as error:
        print("GENERATOR",url,"Alice",True,"private endpoint status",error.code)
        assert error.code == 403

print("NEXORA CHAT LIVE CHECK SUCCESS")
