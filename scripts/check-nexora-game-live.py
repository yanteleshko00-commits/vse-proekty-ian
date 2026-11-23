#!/usr/bin/env python3
"""No-credentials live NEXORA Game Studio QA: actual game HTML + CSP sandbox + swipes."""
import json
import urllib.error
import urllib.request

BASE = "https://nexora-lobby.onrender.com"
def load(path, body=None):
    headers={"User-Agent":"NEXORA-game-live-QA/1.0"}
    if body is not None:
        headers["Content-Type"]="application/json"
        body=json.dumps(body,ensure_ascii=False).encode("utf-8")
    req=urllib.request.Request(BASE+path,data=body,headers=headers,
        method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req,timeout=80) as r:
        return r.status,r.read().decode("utf-8"),{k.lower():v for k,v in r.headers.items()}

code,page,headers=load("/game")
assert code==200
for item in ['id="ai-workspace"','id="ai-build"','id="ai-idea"','id="ai-source"',
             'id="ai-frame"','sandbox="allow-scripts"','data-game-arrow="left"',
             'data-game-arrow="right"','data-game-arrow="up"','data-game-arrow="down"',
             'id="classic-workspace"','script src="/game-builder.js"']:
    assert item in page,item
assert 'allow-same-origin' not in page
print("GAME STUDIO UI",code,"code editor=OK, sandbox=OK, arrows=OK")

code,client,headers=load("/game-builder.js")
assert code==200
for item in ["/api/game/code","/api/game/preview","nexora-game-control",
             "frame.src=data.url","function runEdited","function saveGame"]:
    assert item in client,item
print("GAME BUILDER JS",code,"generation=OK, edit=OK, download=OK")

code,body,headers=load("/api/game/code",{"idea":"Гонки на машине с препятствиями"})
result=json.loads(body)
assert code==200 and result.get("ok") is True,result
assert result.get("source")=="template","guest source must be truthfully marked as template"
assert result.get("family")=="racing",result.get("family")
assert "mode" in result["html"] and "racing" in result["html"]
print("GAME GENERATION",code,"mode=racing","source=template","HTML chars",len(result["html"]))

code,body,headers=load("/api/game/preview",{"html":result["html"]})
prepared=json.loads(body)
assert code==200 and prepared.get("ok") is True,prepared
assert prepared["url"].startswith("/game/preview/")
code,preview,headers=load(prepared["url"])
assert code==200
csp=headers.get("content-security-policy","")
assert "sandbox allow-scripts" in csp,csp
assert "connect-src 'none'" in csp,csp
assert "frame-ancestors 'self'" in csp,csp
assert "touchend" in preview
assert "nexora-game-control" in preview
assert "racing" in preview
print("PLAYABLE PREVIEW",code,"CSP=sandbox","swipe controls=OK","code present=OK")

# Modified editor code must create a fresh isolated playable preview.
edited=result["html"].replace("</body>","<!-- changed by game code editor --></body>")
code,body,_=load("/api/game/preview",{"html":edited})
assert code==200 and json.loads(body).get("ok") is True
print("GAME CODE EDITOR",code,"recompile=OK")

try:
    load("/game/preview/not-a-valid-token")
    raise AssertionError("Invalid game token was accessible")
except urllib.error.HTTPError as e:
    assert e.code==404,e.code
print("GAME STUDIO LIVE PASS")
