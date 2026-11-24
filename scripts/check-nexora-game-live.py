#!/usr/bin/env python3
"""Live Game Studio QA: arbitrary prompts demand real AI, previews remain sandboxed."""
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
assert 'id="ai-login-required"' not in page
assert 'id="ai-loading"' in page
assert 'data-game-dimension="3d"' in page
assert 'data-game-dimension="auto"' in page
assert 'Регистрация и вход не нужны' in page
assert "любое название" in page
print("GAME STUDIO UI",code,"code editor=OK, sandbox=OK, arrows=OK")

code,client,headers=load("/game-builder.js")
assert code==200
for item in ["/api/game/code","/api/game/preview","nexora-game-control",
             'data.source!=="ai"',
             "frame.src=data.url","function runEdited","function saveGame"]:
    assert item in client,item
print("GAME BUILDER JS",code,"generation=OK, edit=OK, download=OK")


# A real anonymous player should receive original AI HTML without a cookie.
description="Ритм-игра с нотами: нажимай по целям и набирай очки"
try:
    code, body, headers=load("/api/game/code", {"idea":description})
except urllib.error.HTTPError as e:
    error=e.read().decode("utf-8")[:550]
    print("PUBLIC AI GENERATION ERROR",e.code,error)
    raise
result=json.loads(body)
assert code==200 and result.get("source")=="ai",result
assert result.get("ok") is True and "<script" in result.get("html",""),result
assert "loginUrl" not in result
print("ANONYMOUS AI GENERATION",code,"provider",result.get("provider"),"HTML chars",len(result["html"]),"no login=OK")

# Independently verify the playground still accepts full user-authored HTML.
sample='''<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>body{background:#152744;color:white;font:16px system-ui}canvas{width:100%;height:auto}</style>
</head><body><h1>Новая игра</h1><canvas width="720" height="420"></canvas>
<script>const canvas=document.querySelector("canvas");const ctx=canvas.getContext("2d");
let t=0;document.addEventListener("keydown",e=>{t+=e.key==="ArrowLeft"?1:2});
function animate(){t+=1;ctx.fillStyle="#fff";ctx.fillRect(t%720,50,30,30);requestAnimationFrame(animate)}animate();</script>
</body></html>'''
code,body,headers=load("/api/game/preview",{"html":sample})
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
print("PLAYABLE PREVIEW",code,"CSP=sandbox","swipe controls=OK","code present=OK")

edited=sample.replace("</body>","<!-- edited game code --></body>")
code,body,_=load("/api/game/preview",{"html":edited})
assert code==200 and json.loads(body).get("ok") is True
print("GAME CODE EDITOR",code,"recompile=OK")

try:
    load("/game/preview/not-a-valid-token")
    raise AssertionError("Invalid game token was accessible")
except urllib.error.HTTPError as e:
    assert e.code==404,e.code
print("GAME STUDIO LIVE 2D/3D PUBLIC AI ACCEPTANCE PASS")
