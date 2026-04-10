import urllib.request
import json
import sys

req = urllib.request.Request(
    'https://api.cobalt.tools',
    data=json.dumps({"url": "https://www.youtube.com/watch?v=nPo7sjcCdJw", "aFormat": "mp3"}).encode('utf-8'),
    headers={
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
    },
    method='POST'
)

try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"Error {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(e)
