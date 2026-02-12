const GATEWAY = 'https://llmgtw.hhdev.ru/proxy/anthropic/v1/messages';
let busy = false;

// --- SVG Icons ---
const SVG_CLIPBOARD = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>';
const SVG_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

// --- Ad Text system prompt ---
const AD_SYSTEM_PROMPT = `Ты опытный копирайтер, специализирующийся на HR-рекламе и вакансиях. Твоя задача — создавать эффективные рекламные тексты для размещения на различных рекламных площадках.

Стили написания:
- Креативный — яркий, эмоциональный язык. Метафоры и образные выражения. Яркие заголовки. Сильный призыв к действию.
- Формальный — строгий деловой стиль. Четкие информативные заголовки. Корректный призыв к действию. Фокус на фактах.
- Сбалансированный — эффективный и лаконичный. Короткие цепляющие заголовки. Призыв к действию без кликбейта.

Базовые правила:
1. Текст ТОЛЬКО на русском языке
2. Строго соблюдай лимиты символов для каждой рекламной системы
3. Каждый текст содержит призыв к действию
4. Без кликбейта и манипуляций
5. Фокус на выгодах для соискателя

Рекламные системы и лимиты:
VK:
- vk_universal: заголовок 3–40 символов, текст 3–220 символов
- vk_site: заголовок 3–25 символов, текст 3–90 символов
- vk_lead: заголовок 3–60 символов, текст 3–220 символов
- vk_carousel: заголовок 3–40 символов, текст 3–47 символов

Яндекс.Директ:
- yandex_search: заголовок 1–56 символов, подзаголовок 1–30 символов, текст 1–81 символов
- yandex_rsya: заголовок 1–56 символов, текст 1–81 символов

Telegram:
- telegram_seeds: заголовок 1–56 символов, текст 1–764 символов. Используй переносы строк, 1-2 ключевых фразы жирным (**текст**), 1-2 эмодзи. Рекомендуемый объём текста: 450-500 символов.
- tgads: заголовок 1–40 символов, текст 1–160 символов. Заголовок — короткая цепляющая фраза (например: «Ищем операторов на производство!»). Не дублируй содержание заголовка в тексте. Добавь 1 эмодзи.

Формат ответа — строго JSON без markdown-обёртки:
{"texts":[{"system":"точный_id_системы","headline":"заголовок","subheadline":"подзаголовок (только для yandex_search)","text":"основной текст"}]}

В поле system — только точный ID (vk_universal, vk_site, vk_lead, vk_carousel, yandex_search, yandex_rsya, telegram_seeds, tgads). Генерируй по одному блоку для каждой запрошенной системы.`;

// Platform metadata
const PLATFORMS = {
    vk_universal:   { label: 'VK Универсальная', headline: [3, 40], text: [3, 220] },
    vk_site:        { label: 'VK Сайт', headline: [3, 25], text: [3, 90] },
    vk_lead:        { label: 'VK Лид-формы', headline: [3, 60], text: [3, 220] },
    vk_carousel:    { label: 'VK Карусель', headline: [3, 40], text: [3, 47] },
    yandex_search:  { label: 'Яндекс Поиск', headline: [1, 56], subheadline: [1, 30], text: [1, 81] },
    yandex_rsya:    { label: 'Яндекс РСЯ', headline: [1, 56], text: [1, 81] },
    telegram_seeds: { label: 'Telegram Посевы', headline: [1, 56], text: [1, 764], target_chars: { text: 500 }, formatting_notes: 'Используй переносы строк, 1-2 ключевых фразы **жирным**, 1-2 эмодзи.' },
    tgads:          { label: 'Telegram Ads', headline: [1, 40], text: [1, 160], formatting_notes: 'Заголовок — короткая цепляющая фраза. Не дублируй заголовок в тексте. 1 эмодзи.' },
};

const PLATFORM_GROUP = {
    vk_universal: 'vk', vk_site: 'vk', vk_lead: 'vk', vk_carousel: 'vk',
    yandex_search: 'yandex', yandex_rsya: 'yandex',
    telegram_seeds: 'tg', tgads: 'tg',
};

const STYLE_LABELS = { creative: 'Креативный', balanced: 'Сбалансированный', formal: 'Формальный' };

// --- DOM ---
const tokenInput = document.getElementById('apiToken');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('sp');
const generateBtn = document.getElementById('generateBtn');
const adDescription = document.getElementById('adDescription');
const adResults = document.getElementById('adResults');
const selectedCountEl = document.getElementById('selectedCount');
const styleSelector = document.getElementById('styleSelector');

let adStyle = 'balanced';
let lastResults = null;
let adHistory = [];
let historyIndex = -1;
// per-card variants (no global variantCount)
let customPrompt = null;
const EMPTY_HTML = '<div class="ad-empty"><div class="ad-empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg></div><p>Выберите площадки, стиль и опишите вакансию для генерации рекламных текстов</p></div>';

// ========================
// Load/save settings
// ========================

chrome.storage.local.get(['hh_token', 'hh_model', 'ad_platforms', 'ad_style', 'ad_description', 'ad_history', 'ad_custom_prompt'], (d) => {
    if (d.hh_token) tokenInput.value = d.hh_token;
    if (d.hh_model) document.getElementById('model').value = d.hh_model;
    if (d.ad_style) {
        adStyle = d.ad_style;
        const radio = document.getElementById('style-' + adStyle);
        if (radio) radio.checked = true;
    }
    if (d.ad_platforms && Array.isArray(d.ad_platforms)) {
        document.querySelectorAll('.cb-pill input').forEach(cb => {
            cb.checked = d.ad_platforms.includes(cb.value);
            cb.closest('.cb-pill').classList.toggle('checked', cb.checked);
        });
    }
    if (d.ad_description) adDescription.value = d.ad_description;
    if (d.ad_history && d.ad_history.length) {
        adHistory = d.ad_history;
        historyIndex = 0;
        renderAdCards(adHistory[0].texts, adHistory[0].meta);
        updateHistoryNav();
    }
    updateSelectedCount();
    if (d.ad_custom_prompt) customPrompt = d.ad_custom_prompt;
    const promptArea = document.getElementById('systemPromptText');
    if (promptArea) promptArea.value = customPrompt || AD_SYSTEM_PROMPT;
});

tokenInput.addEventListener('input', () => {
    chrome.storage.local.set({ hh_token: tokenInput.value });
    const b = document.getElementById('ts');
    b.style.display = 'inline';
    setTimeout(() => b.style.display = 'none', 2000);
});
document.getElementById('model').addEventListener('change', (e) => {
    chrome.storage.local.set({ hh_model: e.target.value });
});
adDescription.addEventListener('input', () => {
    chrome.storage.local.set({ ad_description: adDescription.value });
});

// ========================
// Settings
// ========================

settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('open'));

// ========================
// Pill checkboxes
// ========================

document.querySelectorAll('.cb-pill input').forEach(cb => {
    cb.addEventListener('change', () => {
        cb.closest('.cb-pill').classList.toggle('checked', cb.checked);
        updateSelectedCount();
        saveAdPrefs();
        // Auto-close settings when interacting with platforms
        settingsPanel.classList.remove('open');
    });
});

function updateSelectedCount() {
    // Element removed from DOM — no-op, kept for compatibility
}

function getSelectedPlatforms() {
    return Array.from(document.querySelectorAll('.cb-pill input:checked')).map(cb => cb.value);
}

// ========================
// Style selector
// ========================

styleSelector.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
        adStyle = radio.value;
        saveAdPrefs();
    });
});

function saveAdPrefs() {
    chrome.storage.local.set({
        ad_platforms: getSelectedPlatforms(),
        ad_style: adStyle,
    });
}

// ========================
// Skeleton loading
// ========================

function showSkeletons(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += '<div class="skeleton-card" style="animation:cardIn 0.25s ease-out both;animation-delay:' + (i * 60) + 'ms">';
        for (let j = 0; j < 5; j++) html += '<div class="skeleton-line"></div>';
        html += '</div>';
    }
    return html;
}

// ========================
// Structured prompt builder
// ========================

function buildStructuredPrompt(platforms, style, description) {
    const FIELD_KEYS = ['headline', 'subheadline', 'text'];
    const systems = platforms.map(id => {
        const p = PLATFORMS[id];
        if (!p) return null;
        const fields = {};
        for (const key of FIELD_KEYS) {
            if (p[key]) {
                fields[key] = { max_chars: p[key][1] };
                if (p.target_chars?.[key]) fields[key].target_chars = p.target_chars[key];
            }
        }
        const sys = { id, label: p.label, fields };
        if (p.formatting_notes) sys.formatting_notes = p.formatting_notes;
        return sys;
    }).filter(Boolean);
    return JSON.stringify({
        task: 'generate_ad_texts',
        input: { raw_description: description },
        style: STYLE_LABELS[style] || style,
        systems,
    }, null, 2);
}

// per-card variant helpers — see generateCardVariant / switchVariant below

// ========================
// Generate
// ========================

generateBtn.addEventListener('click', generateAdTexts);

async function generateAdTexts() {
    if (busy) return;
    const token = tokenInput.value.trim();
    if (!token) {
        settingsPanel.classList.add('open');
        tokenInput.focus();
        return;
    }

    const platforms = getSelectedPlatforms();
    if (platforms.length === 0) {
        adResults.innerHTML = '<div class="ad-error">Выберите хотя бы одну площадку</div>';
        return;
    }

    const description = adDescription.value.trim();
    if (!description) {
        adDescription.focus();
        return;
    }

    generateBtn.disabled = true;
    generateBtn.classList.add('loading');
    busy = true;
    adResults.innerHTML = showSkeletons(platforms.length);

    const userMessage = buildStructuredPrompt(platforms, adStyle, description);

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
                max_tokens: parseInt(document.getElementById('maxTokens').value) || 4096,
                system: customPrompt || AD_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userMessage }],
            }),
        });

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

        if (!resp.ok) {
            const t = await resp.text();
            throw new Error('HTTP ' + resp.status + ': ' + t.substring(0, 200));
        }

        const data = await resp.json();
        const rawText = data.content?.[0]?.text || '';
        const usage = data.usage || {};
        const meta = data.model + ' \u00b7 ' + usage.input_tokens + '\u2192' + usage.output_tokens + ' tok \u00b7 ' + elapsed + 's';

        let parsed;
        try {
            const jsonStr = rawText.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim();
            parsed = JSON.parse(jsonStr);
        } catch {
            const match = rawText.match(/\{[\s\S]*"texts"[\s\S]*\}/);
            if (match) {
                parsed = JSON.parse(match[0]);
            } else {
                throw new Error('Failed to parse JSON from response:\n' + rawText.substring(0, 300));
            }
        }

        const texts = parsed.texts || [];
        const entry = {
            id: Date.now(),
            ts: new Date().toISOString(),
            label: description.substring(0, 40),
            style: adStyle,
            platforms: platforms.slice(),
            texts: JSON.parse(JSON.stringify(texts)),
            meta: meta,
        };
        adHistory.unshift(entry);
        if (adHistory.length > 10) adHistory = adHistory.slice(0, 10);
        historyIndex = 0;
        renderAdCards(texts, meta);
        chrome.storage.local.set({ ad_history: adHistory });
        updateHistoryNav();
        // variants are per-card now
    } catch (err) {
        let msg = err.message;
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            msg = 'Сеть недоступна. Убедитесь, что вы в корпоративной сети.';
        }
        adResults.innerHTML = '<div class="ad-error">' + escapeHtml(msg) + '</div>';
    } finally {
        busy = false;
        generateBtn.disabled = false;
        generateBtn.classList.remove('loading');
    }
}

// ========================
// Per-card variant generation
// ========================

async function generateCardVariant(cardIndex) {
    if (busy || !lastResults) return;
    const token = tokenInput.value.trim();
    if (!token) return;
    const item = lastResults.texts[cardIndex];
    if (!item) return;

    // Init _variants from current data if first time
    if (!item._variants) {
        const v0 = {};
        for (const k of ['headline', 'subheadline', 'text']) { if (item[k]) v0[k] = item[k]; }
        item._variants = [v0];
        item._vi = 0;
    }
    if (item._variants.length >= 4) return; // max 4 variants

    const card = adResults.querySelector('.ad-card[data-index="' + cardIndex + '"]');
    const btn = card?.querySelector('.ad-card-variant-btn');
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    busy = true;

    const entry = adHistory[historyIndex];
    const description = adDescription.value.trim() || entry?.label || '';
    const style = entry?.style || adStyle;
    const userMessage = buildStructuredPrompt([item.system], style, description)
        + '\n\nСоздай ДРУГОЙ вариант текстов, отличающийся от предыдущих по тону и формулировкам.';

    try {
        const t0 = performance.now();
        const resp = await fetch(GATEWAY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: document.getElementById('model').value,
                max_tokens: parseInt(document.getElementById('maxTokens').value) || 4096,
                system: customPrompt || AD_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userMessage }],
            }),
        });
        if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP ' + resp.status + ': ' + t.substring(0, 200)); }

        const data = await resp.json();
        const rawText = data.content?.[0]?.text || '';
        let parsed;
        try {
            parsed = JSON.parse(rawText.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim());
        } catch {
            const match = rawText.match(/\{[\s\S]*"texts"[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
            else throw new Error('Не удалось разобрать ответ');
        }

        const newItem = (parsed.texts || [])[0];
        if (!newItem) throw new Error('Пустой ответ');

        // Save current DOM edits before switching
        saveVariantFromDOM(card, item);

        // Push new variant
        const v = {};
        for (const k of ['headline', 'subheadline', 'text']) { if (newItem[k]) v[k] = newItem[k]; }
        item._variants.push(v);
        item._vi = item._variants.length - 1;

        // Apply new variant to item fields
        applyVariant(item);

        // Update card DOM
        updateCardContent(card, item);

        // Save to storage
        adHistory[historyIndex].texts = JSON.parse(JSON.stringify(lastResults.texts));
        chrome.storage.local.set({ ad_history: adHistory });

    } catch (err) {
        if (card) {
            const errEl = document.createElement('div');
            errEl.className = 'ad-error';
            errEl.textContent = err.message;
            errEl.style.marginTop = '8px';
            card.appendChild(errEl);
            setTimeout(() => errEl.remove(), 3000);
        }
    } finally {
        busy = false;
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
        if (item._variants && item._variants.length >= 4 && btn) btn.style.display = 'none';
    }
}

function switchVariant(cardIndex, delta) {
    const item = lastResults?.texts[cardIndex];
    if (!item?._variants || item._variants.length < 2) return;

    const card = adResults.querySelector('.ad-card[data-index="' + cardIndex + '"]');
    if (!card) return;

    // Save current edits
    saveVariantFromDOM(card, item);

    // Switch
    const newVi = item._vi + delta;
    if (newVi < 0 || newVi >= item._variants.length) return;
    item._vi = newVi;
    applyVariant(item);

    // Update DOM
    updateCardContent(card, item);

    // Save
    adHistory[historyIndex].texts = JSON.parse(JSON.stringify(lastResults.texts));
    chrome.storage.local.set({ ad_history: adHistory });
}

function applyVariant(item) {
    const v = item._variants[item._vi];
    for (const k of ['headline', 'subheadline', 'text']) {
        if (v[k] !== undefined) item[k] = v[k];
        else delete item[k];
    }
}

function saveVariantFromDOM(card, item) {
    if (!card || !item?._variants) return;
    const v = item._variants[item._vi];
    card.querySelectorAll('.ad-field-text[data-field]').forEach(el => {
        v[el.dataset.field] = el.textContent;
        item[el.dataset.field] = el.textContent;
    });
}

function updateCardContent(card, item) {
    const platform = PLATFORMS[item.system];
    // Update fields
    card.querySelectorAll('.ad-field').forEach(f => f.remove());
    const meta = card.querySelector('.ad-meta');
    let fieldsHtml = '';
    if (item.headline) fieldsHtml += renderField('Заголовок', item.headline, platform?.headline, 'headline');
    if (item.subheadline) fieldsHtml += renderField('Подзаголовок', item.subheadline, platform?.subheadline, 'subheadline');
    if (item.text) fieldsHtml += renderField('Текст', item.text, platform?.text, 'text');

    const tmp = document.createElement('div');
    tmp.innerHTML = fieldsHtml;
    const header = card.querySelector('.ad-card-header');
    while (tmp.firstChild) {
        if (meta) card.insertBefore(tmp.firstChild, meta);
        else card.appendChild(tmp.firstChild);
    }

    // Reattach live edit listeners
    card.querySelectorAll('.ad-field-text').forEach(el => {
        el.addEventListener('input', () => {
            if (el.dataset.max) updateFieldCount(el);
            saveEditedResults();
        });
    });

    // Update shorten button visibility
    let hasOverLimit = false;
    if (platform) {
        if (item.headline && platform.headline && item.headline.replace(/\*\*/g,'').length > platform.headline[1]) hasOverLimit = true;
        if (item.text && platform.text && item.text.replace(/\*\*/g,'').length > platform.text[1]) hasOverLimit = true;
    }
    const oldShorten = card.querySelector('.ad-card-shorten');
    if (hasOverLimit && !oldShorten) {
        const idx = parseInt(card.dataset.index);
        const sb = document.createElement('button');
        sb.className = 'ad-card-shorten';
        sb.dataset.cardIndex = idx;
        sb.textContent = 'Сократить';
        sb.addEventListener('click', () => shortenCard(idx));
        card.querySelector('.ad-card-actions')?.prepend(sb);
    } else if (!hasOverLimit && oldShorten) {
        oldShorten.remove();
    }

    // Update variant nav
    updateCardVariantNav(card, item);

    // Update variant nav visibility
    updateCardVariantNav(card, item);
}

function updateCardVariantNav(card, item) {
    const nav = card.querySelector('.ad-card-variant-nav');
    if (!nav) return;
    if (!item._variants || item._variants.length < 2) {
        nav.style.display = 'none';
        return;
    }
    nav.style.display = 'inline-flex';
    nav.querySelector('.vnav-pos').textContent = (item._vi + 1) + '/' + item._variants.length;
    nav.querySelector('.vnav-prev').disabled = item._vi <= 0;
    nav.querySelector('.vnav-next').disabled = item._vi >= item._variants.length - 1;
}

// ========================
// HH.ru URL parser
// ========================

async function fetchHHVacancy() {
    const urlInput = document.getElementById('hhUrlInput');
    const btn = document.getElementById('hhUrlBtn');
    const url = urlInput.value.trim();

    const match = url.match(/hh\.ru\/vacancy\/(\d+)/);
    if (!match) {
        urlInput.style.borderColor = 'var(--accent)';
        setTimeout(() => urlInput.style.borderColor = '', 2000);
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const resp = await fetch('https://api.hh.ru/vacancies/' + match[1]);
        if (!resp.ok) throw new Error('Вакансия не найдена');
        const data = await resp.json();

        const parts = [];
        parts.push('Профессия: ' + data.name);
        if (data.employer?.name) parts.push('Компания: ' + data.employer.name);
        if (data.salary) {
            const s = data.salary;
            let sal = 'Зарплата: ';
            if (s.from && s.to) sal += 'от ' + s.from.toLocaleString('ru') + ' до ' + s.to.toLocaleString('ru');
            else if (s.from) sal += 'от ' + s.from.toLocaleString('ru');
            else if (s.to) sal += 'до ' + s.to.toLocaleString('ru');
            if (s.currency) sal += ' ' + s.currency;
            sal += s.gross ? ' (до вычета НДФЛ)' : ' (на руки)';
            parts.push(sal);
        }
        if (data.experience?.name) parts.push('Опыт: ' + data.experience.name);
        if (data.employment?.name) parts.push('Занятость: ' + data.employment.name);
        if (data.schedule?.name) parts.push('График: ' + data.schedule.name);
        if (data.area?.name) parts.push('Город: ' + data.area.name);
        if (data.key_skills?.length) parts.push('Навыки: ' + data.key_skills.map(s => s.name).join(', '));
        if (data.description) {
            const tmp = document.createElement('div');
            tmp.innerHTML = data.description;
            const text = tmp.textContent.trim();
            if (text) parts.push('\nОписание:\n' + text);
        }

        adDescription.value = parts.join('\n');
        chrome.storage.local.set({ ad_description: adDescription.value });
    } catch (err) {
        const errDiv = document.createElement('div');
        errDiv.className = 'ad-error';
        errDiv.textContent = err.message;
        errDiv.style.marginBottom = '8px';
        urlInput.parentElement.after(errDiv);
        setTimeout(() => errDiv.remove(), 3000);
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

// ========================
// Auto-shorten card
// ========================

async function shortenCard(cardIndex) {
    if (busy) return;
    const token = tokenInput.value.trim();
    if (!token) return;
    const item = lastResults?.texts[cardIndex];
    if (!item) return;
    const platform = PLATFORMS[item.system];
    if (!platform) return;

    const card = adResults.querySelector('.ad-card[data-index="' + cardIndex + '"]');
    const shortenBtn = card?.querySelector('.ad-card-shorten');
    if (shortenBtn) { shortenBtn.disabled = true; shortenBtn.classList.add('loading'); }
    busy = true;

    const limits = [];
    if (item.headline && platform.headline) limits.push('Заголовок: \u2264' + platform.headline[1] + ' символов (цель: ' + Math.round(platform.headline[1] * 0.7) + ')');
    if (item.subheadline && platform.subheadline) limits.push('Подзаголовок: \u2264' + platform.subheadline[1] + ' символов (цель: ' + Math.round(platform.subheadline[1] * 0.7) + ')');
    if (item.text && platform.text) limits.push('Текст: \u2264' + platform.text[1] + ' символов (цель: ' + Math.round(platform.text[1] * 0.7) + ')');

    const shortenSystem = 'Ты — редактор-сократитель. Задача — максимально сократить рекламный текст, сохранив смысл и призыв к действию.\nПРАВИЛА: Убери лишнее. Короткие синонимы. Без причастных оборотов. Без вводных.\nФормат ответа — строго JSON: {"headline":"...","subheadline":"...(если есть)","text":"..."}';
    const shortenUser = 'Площадка: ' + platform.label + ' (' + item.system + ')\nТЕКУЩИЕ ТЕКСТЫ:\nЗаголовок: ' + (item.headline || '') +
        (item.subheadline ? '\nПодзаголовок: ' + item.subheadline : '') +
        '\nТекст: ' + (item.text || '') + '\n\nЛИМИТЫ:\n' + limits.join('\n') +
        '\n\nСоздай МАКСИМАЛЬНО КОРОТКУЮ версию.';

    try {
        const resp = await fetch(GATEWAY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: document.getElementById('model').value,
                max_tokens: 1024,
                system: shortenSystem,
                messages: [{ role: 'user', content: shortenUser }],
            }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const rawText = data.content?.[0]?.text || '';

        let parsed;
        try { parsed = JSON.parse(rawText.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim()); }
        catch { const m = rawText.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error('Не удалось разобрать'); }

        if (parsed.headline) item.headline = parsed.headline;
        if (parsed.subheadline) item.subheadline = parsed.subheadline;
        if (parsed.text) item.text = parsed.text;

        lastResults.texts[cardIndex] = item;
        if (adHistory[historyIndex]) {
            adHistory[historyIndex].texts = JSON.parse(JSON.stringify(lastResults.texts));
            chrome.storage.local.set({ ad_history: adHistory });
        }
        renderAdCards(lastResults.texts, lastResults.meta);
    } catch (err) {
        if (shortenBtn) { shortenBtn.textContent = 'Ошибка'; setTimeout(() => { shortenBtn.textContent = 'Сократить'; }, 2000); }
    } finally {
        busy = false;
        if (shortenBtn) { shortenBtn.disabled = false; shortenBtn.classList.remove('loading'); }
    }
}

// ========================
// Render result cards
// ========================

function renderAdCards(texts, meta) {
    lastResults = { texts: JSON.parse(JSON.stringify(texts)), meta };
    adResults.innerHTML = '';

    if (!texts.length) {
        adResults.innerHTML = '<div class="ad-error">Пустой ответ от модели</div>';
        return;
    }

    texts.forEach((item, index) => {
        const platform = PLATFORMS[item.system];
        const group = PLATFORM_GROUP[item.system] || '';
        const card = document.createElement('div');
        card.className = 'ad-card ad-card-enter';
        card.style.animationDelay = (index * 80) + 'ms';
        card.dataset.index = index;
        if (group) card.dataset.platform = group;

        let hasOverLimit = false;
        if (platform) {
            if (item.headline && platform.headline && item.headline.replace(/\*\*/g,'').length > platform.headline[1]) hasOverLimit = true;
            if (item.subheadline && platform.subheadline && item.subheadline.replace(/\*\*/g,'').length > platform.subheadline[1]) hasOverLimit = true;
            if (item.text && platform.text && item.text.replace(/\*\*/g,'').length > platform.text[1]) hasOverLimit = true;
        }

        const hasVariants = item._variants && item._variants.length > 1;

        let html = '<div class="ad-card-header">';
        html += '<span class="ad-card-platform">' + escapeHtml(platform?.label || item.system) + '</span>';
        // Variant nav (hidden if < 2 variants)
        html += '<span class="ad-card-variant-nav" style="' + (hasVariants ? '' : 'display:none') + '">';
        html += '<button class="vnav-prev"' + (item._vi <= 0 ? ' disabled' : '') + '>\u25C0</button>';
        html += '<span class="vnav-pos">' + ((item._vi || 0) + 1) + '/' + (item._variants?.length || 1) + '</span>';
        html += '<button class="vnav-next"' + (item._vi >= (item._variants?.length || 1) - 1 ? ' disabled' : '') + '>\u25B6</button>';
        html += '</span>';
        html += '<div class="ad-card-actions" style="display:flex;gap:6px;align-items:center">';
        if (hasOverLimit) html += '<button class="ad-card-shorten" data-card-index="' + index + '">Сократить</button>';
        const hideVariantBtn = item._variants && item._variants.length >= 4;
        html += '<button class="ad-card-variant-btn"' + (hideVariantBtn ? ' style="display:none"' : '') + '>+ Вариант</button>';
        html += '<button class="ad-card-copy">' + SVG_CLIPBOARD + ' Копировать</button>';
        html += '</div></div>';

        if (item.headline) html += renderField('Заголовок', item.headline, platform?.headline, 'headline');
        if (item.subheadline) html += renderField('Подзаголовок', item.subheadline, platform?.subheadline, 'subheadline');
        if (item.text) html += renderField('Текст', item.text, platform?.text, 'text');
        if (meta) html += '<div class="ad-meta">' + escapeHtml(meta) + '</div>';

        card.innerHTML = html;

        // Copy reads from DOM (edited text)
        const copyBtn = card.querySelector('.ad-card-copy');
        copyBtn.addEventListener('click', () => {
            const parts = [];
            card.querySelectorAll('.ad-field-text').forEach(el => {
                const t = el.textContent.trim();
                if (t) parts.push(t);
            });
            navigator.clipboard.writeText(parts.join('\n\n')).then(() => {
                copyBtn.innerHTML = SVG_CHECK + ' Скопировано';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = SVG_CLIPBOARD + ' Копировать';
                    copyBtn.classList.remove('copied');
                }, 1500);
            });
        });

        // Live edit: update char count + save
        card.querySelectorAll('.ad-field-text').forEach(el => {
            el.addEventListener('input', () => {
                if (el.dataset.max) updateFieldCount(el);
                saveEditedResults();
            });
        });

        // Shorten button
        const shortenBtn = card.querySelector('.ad-card-shorten');
        if (shortenBtn) shortenBtn.addEventListener('click', () => shortenCard(index));

        // Variant button + nav
        card.querySelector('.ad-card-variant-btn')?.addEventListener('click', () => generateCardVariant(index));
        card.querySelector('.vnav-prev')?.addEventListener('click', () => switchVariant(index, -1));
        card.querySelector('.vnav-next')?.addEventListener('click', () => switchVariant(index, 1));


        adResults.appendChild(card);
    });
}

function renderField(label, value, limit, field) {
    const clean = value.replace(/\*\*/g, '');
    const len = clean.length;
    const display = escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*\*/g, '');
    let html = '<div class="ad-field">';
    html += '<div class="ad-field-label">' + escapeHtml(label) + '</div>';
    html += '<div class="ad-field-text" contenteditable="true" data-field="' + field + '"' + (limit ? ' data-max="' + limit[1] + '"' : '') + '>' + display + '</div>';
    if (limit) {
        const max = limit[1];
        const pct = Math.min((len / max) * 100, 100);
        const cls = len > max ? 'over' : len > max * 0.9 ? 'warn' : 'ok';
        html += '<div class="ad-char-count ' + cls + '">' + len + ' / ' + max + '</div>';
        html += '<div class="ad-char-bar"><div class="ad-char-bar-fill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></div></div>';
    }
    html += '</div>';
    return html;
}

function updateFieldCount(el) {
    const max = parseInt(el.dataset.max);
    const len = el.textContent.length;
    const pct = Math.min((len / max) * 100, 100);
    const cls = len > max ? 'over' : len > max * 0.9 ? 'warn' : 'ok';
    const field = el.closest('.ad-field');
    const countEl = field.querySelector('.ad-char-count');
    const barFill = field.querySelector('.ad-char-bar-fill');
    if (countEl) {
        countEl.textContent = len + ' / ' + max;
        countEl.className = 'ad-char-count ' + cls;
    }
    if (barFill) {
        barFill.style.width = pct.toFixed(1) + '%';
        barFill.className = 'ad-char-bar-fill ' + cls;
    }
}

function saveEditedResults() {
    if (!lastResults || historyIndex < 0 || !adHistory[historyIndex]) return;
    adResults.querySelectorAll('.ad-card[data-index]').forEach(card => {
        const i = parseInt(card.dataset.index);
        const item = lastResults.texts[i];
        if (!item) return;
        card.querySelectorAll('.ad-field-text[data-field]').forEach(el => {
            item[el.dataset.field] = el.textContent;
            // Also save into current variant
            if (item._variants && item._variants[item._vi]) {
                item._variants[item._vi][el.dataset.field] = el.textContent;
            }
        });
    });
    adHistory[historyIndex].texts = JSON.parse(JSON.stringify(lastResults.texts));
    chrome.storage.local.set({ ad_history: adHistory });
}

// ========================
// History navigation
// ========================

function updateHistoryNav() {
    const nav = document.getElementById('historyNav');
    if (!nav) return;
    if (!adHistory.length) { nav.style.display = 'none'; return; }
    nav.style.display = 'flex';
    const total = adHistory.length;
    document.getElementById('historyPos').textContent = (historyIndex + 1) + ' из ' + total;
    const entry = adHistory[historyIndex];
    const lbl = entry.label || '';
    document.getElementById('historyLabel').textContent = '«' + lbl + (lbl.length >= 40 ? '…' : '') + '»';
    const d = new Date(entry.ts);
    const mo = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    document.getElementById('historyTime').textContent = d.getDate() + ' ' + mo[d.getMonth()] + ', ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    document.getElementById('historyPrev').disabled = historyIndex >= total - 1;
    document.getElementById('historyNext').disabled = historyIndex <= 0;
}

function navigateHistory(delta) {
    const ni = historyIndex + delta;
    if (ni < 0 || ni >= adHistory.length) return;
    historyIndex = ni;
    renderAdCards(adHistory[historyIndex].texts, adHistory[historyIndex].meta);
    updateHistoryNav();
}

function deleteHistoryEntry() {
    if (historyIndex < 0 || !adHistory.length) return;
    adHistory.splice(historyIndex, 1);
    if (!adHistory.length) {
        historyIndex = -1;
        lastResults = null;
        adResults.innerHTML = EMPTY_HTML;
    } else {
        if (historyIndex >= adHistory.length) historyIndex = adHistory.length - 1;
        renderAdCards(adHistory[historyIndex].texts, adHistory[historyIndex].meta);
    }
    chrome.storage.local.set({ ad_history: adHistory });
    updateHistoryNav();
}

document.getElementById('historyPrev')?.addEventListener('click', () => navigateHistory(1));
document.getElementById('historyNext')?.addEventListener('click', () => navigateHistory(-1));
document.getElementById('historyDel')?.addEventListener('click', deleteHistoryEntry);

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ========================
// HH URL + More variants
// ========================

document.getElementById('hhUrlBtn')?.addEventListener('click', fetchHHVacancy);
document.getElementById('hhUrlInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchHHVacancy(); });
document.getElementById('parsePageBtn')?.addEventListener('click', parseCurrentPage);

// Parse focus toggle
const parseFocusToggle = document.getElementById('parseFocusToggle');
const parseFocusPanel = document.getElementById('parseFocusPanel');
const parseFocusText = document.getElementById('parseFocusText');

parseFocusToggle?.addEventListener('click', () => {
    parseFocusPanel.classList.toggle('open');
    parseFocusToggle.classList.toggle('active', parseFocusPanel.classList.contains('open'));
    if (parseFocusPanel.classList.contains('open')) parseFocusText?.focus();
});
parseFocusText?.addEventListener('input', () => {
    chrome.storage.local.set({ parse_focus: parseFocusText.value });
});
chrome.storage.local.get(['parse_focus'], (d) => {
    if (d.parse_focus) {
        parseFocusText.value = d.parse_focus;
        parseFocusPanel?.classList.add('open');
        parseFocusToggle?.classList.add('active');
    }
});

// ========================
// Parse current page (Side Panel mode)
// ========================

const PARSE_SYSTEM_PROMPT = `Ты — HR-ассистент. Из сырого текста веб-страницы извлеки ТОЛЬКО информацию, полезную для составления рекламных текстов вакансии.

Извлеки и структурируй (в скобках — типичные вариации заголовков на карьерных сайтах):
- Должность / профессия (Вакансия, Позиция, название в заголовке)
- Компания и краткое описание (О компании, О нас, Кто мы)
- Зарплата (Оплата, Доход, Компенсация, Вознаграждение)
- Обязанности (Чем предстоит заниматься, Задачи, Функционал, Что нужно делать, Роль, Зона ответственности, Ваши задачи, Функциональные обязанности)
- Требования (Что мы ожидаем, Кого мы ищем, Ожидания, Профиль кандидата, Нам важно, Квалификация, Что для нас важно, Мы ждём от вас)
- Условия и преимущества (Что мы предлагаем, Почему мы?, Наши преимущества, Мы предлагаем, Бонусы, Плюшки, Льготы и компенсации, ДМС, обучение)
- Навыки (Ключевые навыки, Hard skills, Стек технологий, Инструменты)
- Локация и график (Место работы, Формат, График, Удалёнка, Гибрид)
- Контакты / способ отклика (если есть)

ПРАВИЛА:
1. Убери всё лишнее: навигацию, рекламу, футеры, куки-баннеры, юридические тексты, похожие вакансии, отзывы
2. Если страница НЕ о вакансии — извлеки ключевую суть для рекламного текста (продукт, услуга, УТП)
3. ФОРМАТ ОТВЕТА — только plain text. ЗАПРЕЩЕНО: **жирный**, *курсив*, # заголовки, - списки с дефисом в начале строки, любая markdown- или HTML-разметка. Используй простые переносы строк для разделения секций. Названия секций пиши без двоеточий и спецсимволов, просто текстом
4. Названия должностей, компаний, брендов и термины копируй БУКВА В БУКВУ с оригинала. Не перефразируй, не исправляй регистр, не изменяй ни одного символа в именах собственных
5. Если на странице НЕСКОЛЬКО вакансий/позиций — извлекай данные по ВСЕМ, чётко разделяя. Если пользователь указал конкретную — извлекай ТОЛЬКО её, полностью игнорируя остальные
6. НЕ пропускай секции — если на странице есть информация о преимуществах, условиях, обязанностях или требованиях, она ДОЛЖНА быть в ответе
7. Будь лаконичен, но не теряй факты. Ориентир — 1500–2500 символов`;

async function parseCurrentPage() {
    const btn = document.getElementById('parsePageBtn');
    if (!btn) return;

    // Check if chrome.scripting is available (not in local-preview)
    if (!chrome.scripting) {
        adDescription.value = '[Парсинг страницы доступен только в режиме расширения Chrome]';
        return;
    }

    const token = tokenInput.value.trim();
    if (!token) {
        settingsPanel.classList.add('open');
        tokenInput.focus();
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');
    const origHTML = btn.innerHTML;

    try {
        // Step 1: Extract raw page content
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('Не найдена активная вкладка');

        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
            throw new Error('Нельзя парсить системные страницы Chrome');
        }

        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Парсинг...';

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const title = document.title || '';
                const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
                // Expanded selectors for career sites
                const mainEl = document.querySelector(
                    'article, main, [role="main"], ' +
                    '.vacancy-description, .vacancy-section, .vacancy-body, .vacancy-content, ' +
                    '.job-description, .job-details, .job-content, ' +
                    '.content, .article, ' +
                    '[class*="vacancy"], [class*="job-detail"], [class*="position-detail"]'
                );
                const root = mainEl || document.body;
                // Try to extract structured sections (heading + content pairs)
                const sections = [];
                root.querySelectorAll('h1, h2, h3, h4').forEach(h => {
                    const heading = h.textContent.trim();
                    if (!heading) return;
                    let content = '';
                    let sibling = h.nextElementSibling;
                    while (sibling && !sibling.matches('h1, h2, h3, h4')) {
                        content += (sibling.innerText || sibling.textContent || '') + '\n';
                        sibling = sibling.nextElementSibling;
                    }
                    content = content.trim();
                    if (content) sections.push(heading + ':\n' + content);
                });
                const structuredText = sections.join('\n\n');
                // Use structured text if it captured meaningful content, otherwise fall back to innerText
                const bodyText = (structuredText.length > 200 ? structuredText : root.innerText) || '';
                return {
                    url: location.href,
                    title: title.substring(0, 200),
                    metaDescription: metaDesc.substring(0, 300),
                    bodyText: bodyText.substring(0, 12000),
                };
            },
        });

        const data = results[0]?.result;
        if (!data) throw new Error('Пустой результат парсинга');

        // Clean raw text
        const rawText = [data.title, data.metaDescription, data.bodyText]
            .filter(Boolean)
            .join('\n')
            .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .substring(0, 10000);

        // Build system prompt with optional focus instruction (system-level = highest priority for the model)
        const focusInstruction = parseFocusText?.value.trim() || '';
        let systemPrompt = PARSE_SYSTEM_PROMPT;
        if (focusInstruction) {
            systemPrompt += '\n\nВАЖНО — ИНСТРУКЦИЯ ПОЛЬЗОВАТЕЛЯ (наивысший приоритет):\n' + focusInstruction;
        }
        const userContent = 'URL: ' + data.url + '\n\n' + rawText;

        // Step 2: AI processing via Haiku — extract HR-relevant info
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> AI обработка...';

        const resp = await fetch(GATEWAY, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': token,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{ role: 'user', content: userContent }],
            }),
        });

        if (!resp.ok) {
            const t = await resp.text();
            throw new Error('AI: HTTP ' + resp.status + ' — ' + t.substring(0, 150));
        }

        const aiData = await resp.json();
        let cleaned = aiData.content?.[0]?.text || '';

        if (!cleaned.trim()) throw new Error('AI вернул пустой результат');

        // Strip any markdown formatting that slipped through
        cleaned = cleaned
            .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
            .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
            .replace(/^#{1,4}\s+/gm, '')        // # headings → plain text
            .replace(/^[-*]\s+/gm, '')           // - list items → plain text
            .trim();

        adDescription.value = cleaned;
        chrome.storage.local.set({ ad_description: adDescription.value });

        // Success feedback
        btn.classList.add('success');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Готово';
        setTimeout(() => { btn.innerHTML = origHTML; btn.classList.remove('success'); }, 2000);

    } catch (err) {
        btn.innerHTML = origHTML;
        const errDiv = document.createElement('div');
        errDiv.className = 'ad-error';
        errDiv.textContent = err.message;
        errDiv.style.cssText = 'margin-top:8px;font-size:12px';
        btn.after(errDiv);
        setTimeout(() => errDiv.remove(), 4000);
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

// ========================
// System prompt editor
// ========================

const promptText = document.getElementById('systemPromptText');
const promptResetBtn = document.getElementById('promptResetBtn');
const promptSaveBtn = document.getElementById('promptSaveBtn');

promptSaveBtn?.addEventListener('click', () => {
    const val = promptText.value.trim();
    if (val && val !== AD_SYSTEM_PROMPT) {
        customPrompt = val;
        chrome.storage.local.set({ ad_custom_prompt: customPrompt });
    } else {
        customPrompt = null;
        chrome.storage.local.remove?.('ad_custom_prompt') || chrome.storage.local.set({ ad_custom_prompt: '' });
    }
    promptSaveBtn.textContent = 'Сохранено';
    setTimeout(() => { promptSaveBtn.textContent = 'Сохранить'; }, 1500);
});

promptResetBtn?.addEventListener('click', () => {
    if (promptText) promptText.value = AD_SYSTEM_PROMPT;
    customPrompt = null;
    chrome.storage.local.remove?.('ad_custom_prompt') || chrome.storage.local.set({ ad_custom_prompt: '' });
});
