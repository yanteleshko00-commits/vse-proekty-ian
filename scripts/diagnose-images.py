import json
import urllib.parse
import urllib.request
import urllib.error
import time

sources = [
  ("commons", "https://commons.wikimedia.org/w/api.php"),
  ("wikipedia", "https://en.wikipedia.org/w/api.php"),
]
queries = ["solar panels", "photovoltaic panels school", "solar energy rooftop"]
for key, base in sources:
  for query in queries:
    params = {
      "action": "query", "generator": "search", "gsrsearch": query,
      "gsrnamespace": "6", "gsrlimit": "12", "prop": "imageinfo",
      "iiprop": "url|mime", "iiurlwidth": "1400",
      "format": "json", "origin": "*"
    }
    url = base+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={"User-Agent":"IanProjectPresentation/1.1 (educational presentation generator; contact: site owner)","Accept":"application/json"})
    try:
      with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.load(resp)
      pages=list(data.get("query",{}).get("pages",{}).values())
      candidates=[(p.get("title"),p.get("imageinfo",[{}])[0].get("thumburl"),p.get("imageinfo",[{}])[0].get("mime")) for p in pages if p.get("imageinfo")]
      print(key,query,"pages",len(pages),"images",len(candidates),"examples",candidates[:2],"errors",data.get("error"))
    except Exception as e:
      print(key,query,"ERROR",type(e).__name__,str(e)[:180])
