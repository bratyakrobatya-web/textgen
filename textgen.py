#!/usr/bin/env python3
"""
HH TextGen — чат с Claude через корпоративный gateway.
Один файл, ноль зависимостей (только Python 3).

Запуск:
    python3 textgen.py

Откроется браузер на http://localhost:8000
Токен вводится в интерфейсе, НЕ хранится в этом файле.
"""

import http.server
import json
import os
import sys
import urllib.request
import urllib.error
import webbrowser

PORT = int(os.environ.get("PORT", 8000))
GATEWAY = "https://llmgtw.hhdev.ru/proxy/anthropic/v1/messages"

HTML = r"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HH TextGen</title>
    <meta name="theme-color" content="#1a1a2e">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg:#1a1a2e;--surface:#16213e;--surface2:#0f3460;--accent:#e94560;--text:#eee;--text2:#aab;--r:12px}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);height:100dvh;display:flex;flex-direction:column}
        header{padding:16px 20px;background:var(--surface);border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:12px;flex-shrink:0}
        header h1{font-size:18px;font-weight:600;flex:1}
        .settings-btn{background:none;border:none;color:var(--text2);cursor:pointer;font-size:22px;padding:4px}
        .settings-btn:hover{color:var(--text)}
        .settings{background:var(--surface);border-bottom:1px solid rgba(255,255,255,.06);padding:16px 20px;display:none;flex-shrink:0}
        .settings.open{display:block}
        .settings label{display:block;font-size:13px;color:var(--text2);margin-bottom:4px}
        .settings input,.settings select{width:100%;padding:10px 12px;background:var(--bg);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:var(--text);font-size:14px;margin-bottom:12px}
        .settings select{appearance:none;cursor:pointer}
        .token-saved{color:#4ade80;font-size:12px;display:none;margin-left:8px}
        #chat{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px}
        .msg{max-width:85%;padding:12px 16px;border-radius:var(--r);line-height:1.5;font-size:15px;white-space:pre-wrap;word-break:break-word}
        .msg.user{align-self:flex-end;background:var(--surface2);border-bottom-right-radius:4px}
        .msg.assistant{align-self:flex-start;background:var(--surface);border-bottom-left-radius:4px}
        .msg .meta{font-size:11px;color:var(--text2);margin-top:8px}
        .msg.error{align-self:center;background:rgba(233,69,96,.15);border:1px solid var(--accent);color:#f87171;font-size:13px}
        .typing{align-self:flex-start;color:var(--text2);font-size:14px;padding:12px 16px}
        .typing::after{content:'...';animation:dots 1.5s steps(4,end) infinite}
        @keyframes dots{0%,20%{content:''}40%{content:'.'}60%{content:'..'}80%,100%{content:'...'}}
        .welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text2);text-align:center;gap:8px}
        .welcome .icon{font-size:48px;margin-bottom:8px}
        .welcome h2{color:var(--text);font-size:20px}
        .welcome p{font-size:14px;max-width:300px}
        .input-area{padding:12px 20px 20px;background:var(--surface);border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}
        .input-row{display:flex;gap:8px;align-items:flex-end}
        #prompt{flex:1;padding:12px 16px;background:var(--bg);border:1px solid rgba(255,255,255,.1);border-radius:var(--r);color:var(--text);font-size:15px;font-family:inherit;resize:none;min-height:48px;max-height:160px;line-height:1.4}
        #prompt:focus{outline:none;border-color:var(--accent)}
        #prompt::placeholder{color:var(--text2)}
        #sendBtn{padding:12px 20px;background:var(--accent);color:#fff;border:none;border-radius:var(--r);font-size:15px;font-weight:600;cursor:pointer;white-space:nowrap}
        #sendBtn:hover{filter:brightness(1.1)}
        #sendBtn:disabled{opacity:.4;cursor:not-allowed}
    </style>
</head>
<body>
<header>
    <h1>HH TextGen</h1>
    <button class="settings-btn" onclick="toggleSettings()" title="Настройки">⚙</button>
</header>
<div class="settings" id="settingsPanel">
    <label>API Token <span class="token-saved" id="tokenSaved">сохранён</span></label>
    <input type="password" id="apiToken" placeholder="вставьте токен от llmgtw">
    <label>Модель</label>
    <select id="model">
        <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — быстрый</option>
        <option value="claude-sonnet-4-5-20250929" selected>Claude Sonnet 4.5 — баланс</option>
        <option value="claude-opus-4-5-20251101">Claude Opus 4.5 — умный</option>
    </select>
    <label>Max tokens</label>
    <input type="number" id="maxTokens" value="2048" min="64" max="8192">
</div>
<div id="chat">
    <div class="welcome" id="welcome">
        <div class="icon">⚡</div>
        <h2>HH TextGen</h2>
        <p>Чат с Claude через корпоративный gateway. Запросы идут с вашей машины.</p>
        <p style="font-size:12px;margin-top:8px">Откройте настройки ⚙ и вставьте токен</p>
    </div>
</div>
<div class="input-area">
    <div class="input-row">
        <textarea id="prompt" rows="1" placeholder="Напишите сообщение..."></textarea>
        <button id="sendBtn" onclick="send()">→</button>
    </div>
</div>
<script>
const GATEWAY='/api/chat';
let messages=[],busy=false;
const tokenInput=document.getElementById('apiToken');
const saved=localStorage.getItem('hh_token');
if(saved)tokenInput.value=saved;
tokenInput.addEventListener('input',()=>{
    localStorage.setItem('hh_token',tokenInput.value);
    const b=document.getElementById('tokenSaved');b.style.display='inline';
    setTimeout(()=>b.style.display='none',2000);
});
const prompt=document.getElementById('prompt');
prompt.addEventListener('input',()=>{prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,160)+'px'});
prompt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
function toggleSettings(){document.getElementById('settingsPanel').classList.toggle('open')}
function addMessage(role,text,meta){
    const w=document.getElementById('welcome');if(w)w.remove();
    const chat=document.getElementById('chat'),div=document.createElement('div');
    div.className='msg '+role;div.textContent=text;
    if(meta){const m=document.createElement('div');m.className='meta';m.textContent=meta;div.appendChild(m)}
    chat.appendChild(div);chat.scrollTop=chat.scrollHeight;return div;
}
function showTyping(){const c=document.getElementById('chat'),d=document.createElement('div');d.className='typing';d.id='typing';d.textContent='Claude думает';c.appendChild(d);c.scrollTop=c.scrollHeight}
function removeTyping(){const e=document.getElementById('typing');if(e)e.remove()}
async function send(){
    if(busy)return;
    const token=tokenInput.value.trim();
    if(!token){toggleSettings();tokenInput.focus();return}
    const text=prompt.value.trim();if(!text)return;
    prompt.value='';prompt.style.height='auto';
    document.getElementById('sendBtn').disabled=true;busy=true;
    addMessage('user',text);messages.push({role:'user',content:text});showTyping();
    try{
        const t0=performance.now();
        const resp=await fetch(GATEWAY,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':token,'anthropic-version':'2023-06-01'},
            body:JSON.stringify({model:document.getElementById('model').value,max_tokens:parseInt(document.getElementById('maxTokens').value)||2048,messages})});
        const elapsed=((performance.now()-t0)/1000).toFixed(1);
        if(!resp.ok){const t=await resp.text();throw new Error('HTTP '+resp.status+': '+t.substring(0,200))}
        const data=await resp.json();
        const reply=data.content?.[0]?.text||'(пустой ответ)';
        const usage=data.usage||{};
        const meta=data.model+' · '+usage.input_tokens+'→'+usage.output_tokens+' tok · '+elapsed+'s';
        removeTyping();addMessage('assistant',reply,meta);messages.push({role:'assistant',content:reply});
    }catch(err){
        removeTyping();
        let msg=err.message;
        if(msg.includes('Failed to fetch')||msg.includes('NetworkError'))msg='Сеть недоступна. Убедитесь, что сервер запущен и вы в корп-сети.';
        addMessage('error',msg);messages.pop();
    }finally{busy=false;document.getElementById('sendBtn').disabled=false;prompt.focus()}
}
</script>
</body>
</html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(HTML.encode())

    def do_POST(self):
        if self.path != "/api/chat":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        api_key = self.headers.get("x-api-key", "")

        req = urllib.request.Request(
            GATEWAY,
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-api-key, anthropic-version")
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write(f"  {args[0]}\n")


if __name__ == "__main__":
    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"\n  ⚡ HH TextGen")
    print(f"  Открой в браузере: {url}")
    print(f"  Остановить: Ctrl+C\n")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Остановлен.")
