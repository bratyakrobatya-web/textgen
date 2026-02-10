const GATEWAY = 'https://llmgtw.hhdev.ru/proxy/anthropic/v1/messages';
let messages = [];
let busy = false;

// DOM
const tokenInput = document.getElementById('apiToken');
const promptEl = document.getElementById('prompt');
const sendBtn = document.getElementById('sendBtn');
const chatEl = document.getElementById('chat');
const settingsBtn = document.getElementById('settingsBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsPanel = document.getElementById('sp');

// Load saved settings
chrome.storage.local.get(['hh_token', 'hh_model', 'hh_max_tokens'], (d) => {
    if (d.hh_token) tokenInput.value = d.hh_token;
    if (d.hh_model) document.getElementById('model').value = d.hh_model;
    if (d.hh_max_tokens) document.getElementById('maxTokens').value = d.hh_max_tokens;
});

// Save settings on change
tokenInput.addEventListener('input', () => {
    chrome.storage.local.set({ hh_token: tokenInput.value });
    const b = document.getElementById('ts');
    b.style.display = 'inline';
    setTimeout(() => b.style.display = 'none', 2000);
});
document.getElementById('model').addEventListener('change', (e) => {
    chrome.storage.local.set({ hh_model: e.target.value });
});
document.getElementById('maxTokens').addEventListener('change', (e) => {
    chrome.storage.local.set({ hh_max_tokens: e.target.value });
});

// Auto-resize textarea
promptEl.addEventListener('input', () => {
    promptEl.style.height = 'auto';
    promptEl.style.height = Math.min(promptEl.scrollHeight, 120) + 'px';
});

// Enter to send
promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

// Buttons
settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('open'));
clearBtn.addEventListener('click', () => {
    messages = [];
    chatEl.innerHTML = '';
});
sendBtn.addEventListener('click', send);

function addMsg(role, text, meta) {
    const w = document.getElementById('welcome');
    if (w) w.remove();
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    if (meta) {
        const m = document.createElement('div');
        m.className = 'meta';
        m.textContent = meta;
        div.appendChild(m);
    }
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
    return div;
}

function showTyping() {
    const d = document.createElement('div');
    d.className = 'typing';
    d.id = 'typing';
    d.textContent = 'Claude думает';
    chatEl.appendChild(d);
    chatEl.scrollTop = chatEl.scrollHeight;
}

function hideTyping() {
    const e = document.getElementById('typing');
    if (e) e.remove();
}

async function send() {
    if (busy) return;
    const token = tokenInput.value.trim();
    if (!token) {
        settingsPanel.classList.add('open');
        tokenInput.focus();
        return;
    }
    const text = promptEl.value.trim();
    if (!text) return;

    promptEl.value = '';
    promptEl.style.height = 'auto';
    sendBtn.disabled = true;
    busy = true;

    addMsg('user', text);
    messages.push({ role: 'user', content: text });
    showTyping();

    try {
        const t0 = performance.now();
        const resp = await fetch(GATEWAY, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': token,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: document.getElementById('model').value,
                max_tokens: parseInt(document.getElementById('maxTokens').value) || 2048,
                messages: messages,
            }),
        });

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

        if (!resp.ok) {
            const t = await resp.text();
            throw new Error('HTTP ' + resp.status + ': ' + t.substring(0, 200));
        }

        const data = await resp.json();
        const reply = data.content?.[0]?.text || '(пустой ответ)';
        const usage = data.usage || {};
        const meta = data.model + ' · ' + usage.input_tokens + '→' + usage.output_tokens + ' tok · ' + elapsed + 's';

        hideTyping();
        addMsg('assistant', reply, meta);
        messages.push({ role: 'assistant', content: reply });
    } catch (err) {
        hideTyping();
        let msg = err.message;
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            msg = 'Сеть недоступна. Убедитесь, что вы в корп-сети.';
        }
        addMsg('error', msg);
        messages.pop();
    } finally {
        busy = false;
        sendBtn.disabled = false;
        promptEl.focus();
    }
}

// Focus prompt on open
promptEl.focus();
