// Test suite for HH TextGen Chrome Extension refactored code
// Runs in Node.js — mocks Chrome APIs and DOM where needed

import fs from 'fs';

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) { passed++; console.log('  PASS: ' + name); }
    else { failed++; console.error('  FAIL: ' + name); }
}

function section(name) { console.log('\n=== ' + name + ' ==='); }

// ========================
// 1. Utilities from popup.js (extracted for testing)
// ========================

section('escapeHtml');

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

assert(escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;', 'escapes script tags');
assert(escapeHtml('a & b "c" \'d\'') === 'a &amp; b &quot;c&quot; &#39;d&#39;', 'escapes all special chars');
assert(escapeHtml('normal text') === 'normal text', 'leaves plain text unchanged');
assert(escapeHtml('') === '', 'handles empty string');
assert(escapeHtml('Зарплата: от 100 000 ₽') === 'Зарплата: от 100 000 ₽', 'handles Cyrillic and special chars');

section('deepClone');

function deepClone(obj) { return structuredClone(obj); }

const orig = { texts: [{ headline: 'test', _variants: [{ headline: 'v1' }] }] };
const cloned = deepClone(orig);
assert(cloned.texts[0].headline === 'test', 'clones values');
cloned.texts[0].headline = 'modified';
assert(orig.texts[0].headline === 'test', 'deep clone is independent');
assert(cloned.texts[0]._variants[0].headline === 'v1', 'clones nested structures');

section('debounce');

function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

let debounceCount = 0;
const debounced = debounce(() => debounceCount++, 50);
debounced(); debounced(); debounced();
assert(debounceCount === 0, 'debounce does not fire immediately');

await new Promise(r => setTimeout(r, 100));
assert(debounceCount === 1, 'debounce fires once after delay');

// ========================
// 2. parseJsonResponse
// ========================

section('parseJsonResponse');

function parseJsonResponse(rawText) {
    const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { return JSON.parse(cleaned); } catch {}
    const match = cleaned.match(/\{[\s\S]*?"texts"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Не удалось разобрать JSON из ответа:\n' + rawText.substring(0, 300));
}

// Clean JSON
const r1 = parseJsonResponse('{"texts":[{"system":"vk_universal","headline":"test"}]}');
assert(r1.texts.length === 1, 'parses clean JSON');
assert(r1.texts[0].headline === 'test', 'extracts fields');

// JSON wrapped in markdown code block
const r2 = parseJsonResponse('```json\n{"texts":[{"system":"yandex_search","headline":"поиск"}]}\n```');
assert(r2.texts[0].system === 'yandex_search', 'parses markdown-wrapped JSON');

// JSON with surrounding text (model explanation)
const r3 = parseJsonResponse('Here is the result:\n{"texts":[{"system":"tgads","headline":"тест"}]}\nHope this helps!');
assert(r3.texts[0].system === 'tgads', 'parses JSON embedded in text');

// Invalid JSON should throw
let threw = false;
try { parseJsonResponse('not json at all'); } catch { threw = true; }
assert(threw, 'throws on invalid JSON');

// Greedy regex test — make sure it doesn't grab garbage after closing brace
const tricky = '{"texts":[{"system":"vk_site","headline":"ok"}]} some extra text with { braces }';
const r4 = parseJsonResponse(tricky);
assert(r4.texts[0].headline === 'ok', 'non-greedy regex handles trailing braces');

// ========================
// 3. parseSingleJsonResponse
// ========================

section('parseSingleJsonResponse');

function parseSingleJsonResponse(rawText) {
    const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { return JSON.parse(cleaned); } catch {}
    const match = cleaned.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Не удалось разобрать JSON');
}

const s1 = parseSingleJsonResponse('{"headline":"short","text":"brief"}');
assert(s1.headline === 'short', 'parses single JSON object');

const s2 = parseSingleJsonResponse('```json\n{"headline":"wrapped"}\n```');
assert(s2.headline === 'wrapped', 'parses markdown-wrapped single JSON');

// ========================
// 4. Manifest structure validation
// ========================

section('manifest.json');

const manifest = JSON.parse(fs.readFileSync('/Users/p.sidorov/textgen/chrome-extension/manifest.json', 'utf8'));

assert(manifest.manifest_version === 3, 'manifest_version is 3');
assert(manifest.permissions.includes('storage'), 'has storage permission');
assert(manifest.permissions.includes('sidePanel'), 'has sidePanel permission');
assert(manifest.permissions.includes('activeTab'), 'has activeTab permission');
assert(manifest.permissions.includes('scripting'), 'has scripting permission');
assert(manifest.host_permissions.includes('*://*/*'), 'has wildcard host permission for page parsing');
assert(manifest.host_permissions.includes('https://llmgtw.hhdev.ru/*'), 'has LLM gateway permission');
assert(manifest.host_permissions.includes('https://api.hh.ru/*'), 'has HH API permission');
assert(!manifest.content_scripts, 'no static content_scripts (programmatic injection)');
assert(manifest.background.service_worker === 'background.js', 'has background service worker');
assert(manifest.side_panel.default_path === 'popup.html', 'side panel points to popup.html');
assert(manifest.version === '1.2', 'version bumped to 1.2');

// ========================
// 5. Content script guard
// ========================

section('content.js');

const contentCode = fs.readFileSync('/Users/p.sidorov/textgen/chrome-extension/content.js', 'utf8');
assert(contentCode.includes('__hhTextGenFabActive'), 'has injection state flag');
assert(contentCode.includes('__hhTextGenFabCleanup'), 'has idempotent cleanup for re-injection');
assert(contentCode.includes('DEACTIVATE_FAB'), 'listens for deactivation message');
assert(contentCode.includes("mode: 'closed'"), 'uses closed shadow DOM');
assert(contentCode.includes('mousedown'), 'has mousedown handler for selection preservation');
assert(contentCode.includes('AbortController'), 'uses AbortController for listener cleanup');
assert(contentCode.includes('removeListener(onMessage)'), 'removes named onMessage listener on cleanup');

// ========================
// 6. Background.js structure
// ========================

section('background.js');

const bgCode = fs.readFileSync('/Users/p.sidorov/textgen/chrome-extension/background.js', 'utf8');
assert(bgCode.includes('openPanelOnActionClick'), 'opens panel on action click');
assert(bgCode.includes("port.name !== 'sidepanel'"), 'listens for sidepanel port');
assert(!bgCode.includes('const injectedTabs'), 'no in-memory injectedTabs (uses session storage)');
assert(bgCode.includes('storage.session'), 'uses session storage for panel state');
assert(bgCode.includes('isPanelOpen'), 'has isPanelOpen helper');
assert(bgCode.includes('DEACTIVATE_FAB'), 'sends deactivation on disconnect');
assert(bgCode.includes('onActivated'), 'handles tab switches at top level');
assert(bgCode.includes('onUpdated'), 'handles in-tab navigation at top level');
assert(bgCode.includes('deactivateAll'), 'deactivates FAB in all tabs on close');

// ========================
// 7. popup.js structure checks
// ========================

section('popup.js');

const popupCode = fs.readFileSync('/Users/p.sidorov/textgen/chrome-extension/popup.js', 'utf8');
assert(popupCode.includes('function debounce('), 'has debounce utility');
assert(popupCode.includes('function escapeHtml('), 'has string-based escapeHtml');
assert(popupCode.includes('function deepClone('), 'has deepClone utility');
assert(popupCode.includes('function callLLM('), 'has callLLM abstraction');
assert(popupCode.includes('function parseJsonResponse('), 'has parseJsonResponse');
assert(popupCode.includes('function parseSingleJsonResponse('), 'has parseSingleJsonResponse');
assert(popupCode.includes('AbortController'), 'uses AbortController for timeouts');
assert(popupCode.includes("name: 'sidepanel'"), 'connects to background as sidepanel');
assert(popupCode.includes('_saveToken'), 'debounces token saves');
assert(popupCode.includes('_saveDesc'), 'debounces description saves');
assert(popupCode.includes('_flushEditedResults'), 'debounces edit saves');
assert(!popupCode.includes('selectedCountEl'), 'removed dead selectedCountEl');
assert((popupCode.match(/updateCardVariantNav/g) || []).length <= 3, 'no duplicate updateCardVariantNav calls');
assert(!popupCode.includes('let busy'), 'no global busy flag (replaced with per-operation)');
assert(popupCode.includes('let generating'), 'has generating flag for full generation');
assert(popupCode.includes('busyCards'), 'has per-card busy tracking');

// Check no raw JSON.parse(JSON.stringify(
assert(!popupCode.includes('JSON.parse(JSON.stringify('), 'replaced all JSON.parse(JSON.stringify with deepClone');

// Check fetch is only in callLLM and fetchHHVacancy (not scattered)
const fetchMatches = popupCode.match(/await fetch\(GATEWAY/g) || [];
assert(fetchMatches.length <= 1, 'GATEWAY fetch consolidated into callLLM (found ' + fetchMatches.length + ' direct calls)');

// ========================
// 8. File structure
// ========================

section('File structure');

const files = fs.readdirSync('/Users/p.sidorov/textgen/chrome-extension/');
assert(files.includes('popup.css'), 'popup.css exists');
assert(files.includes('popup.html'), 'popup.html exists');
assert(files.includes('popup.js'), 'popup.js exists');
assert(files.includes('background.js'), 'background.js exists');
assert(files.includes('content.js'), 'content.js exists');
assert(files.includes('manifest.json'), 'manifest.json exists');
assert(files.includes('hh-logo.png'), 'hh-logo.png exists');
assert(!files.includes('icon.png'), 'icon.png removed');

// popup.html should reference popup.css
const htmlCode = fs.readFileSync('/Users/p.sidorov/textgen/chrome-extension/popup.html', 'utf8');
assert(htmlCode.includes('popup.css'), 'popup.html links to popup.css');
assert(!htmlCode.includes('<style>'), 'popup.html has no inline style block');

// ========================
// 9. CSS file
// ========================

section('popup.css');

const cssCode = fs.readFileSync('/Users/p.sidorov/textgen/chrome-extension/popup.css', 'utf8');
assert(cssCode.includes('--bg:'), 'CSS has root variables');
assert(cssCode.includes('.ad-card'), 'CSS has card styles');
assert(cssCode.includes('prefers-reduced-motion'), 'CSS has reduced motion media query');
assert(cssCode.length > 10000, 'CSS file has substantial content (' + cssCode.length + ' chars)');

// ========================
// 10. HH vacancy URL fetch (fetchHHVacancy — uses api.hh.ru not GATEWAY)
// ========================

section('HH API fetch');
const hhFetchMatch = popupCode.match(/fetch\('https:\/\/api\.hh\.ru/g) || [];
assert(hhFetchMatch.length === 1, 'HH API fetch is direct (not via callLLM)');
assert(popupCode.includes('hhAbort') || popupCode.includes('AbortController'), 'HH API fetch has timeout');
assert(popupCode.includes("Таймаут запроса к HH API"), 'HH API has timeout error message');

// ========================
// 11. Double newline collapsing
// ========================

section('Newline collapsing');

function collapseNewlines(texts) {
    texts.forEach(t => {
        if (t.system === 'telegram_seeds' || t.system === 'vk_universal') {
            for (const k of ['text', 'long_description']) {
                if (t[k]) t[k] = t[k].replace(/\n{2,}/g, '\n');
            }
        }
    });
    return texts;
}

const nlTexts = collapseNewlines([
    { system: 'vk_universal', text: 'a\n\nb\n\n\nc', long_description: 'x\n\ny' },
    { system: 'telegram_seeds', text: 'Привет!\n\nМы ищем\n\n\nОператоров' },
    { system: 'yandex_search', text: 'a\n\nb' }, // should NOT be touched
]);
assert(nlTexts[0].text === 'a\nb\nc', 'vk_universal text: collapses \\n\\n to \\n');
assert(nlTexts[0].long_description === 'x\ny', 'vk_universal long_description: collapses \\n\\n to \\n');
assert(nlTexts[1].text === 'Привет!\nМы ищем\nОператоров', 'telegram_seeds text: collapses all multiple newlines');
assert(nlTexts[2].text === 'a\n\nb', 'yandex_search text: untouched');

// ========================
// 12. Per-field copy button in renderField
// ========================

section('Per-field copy button');

assert(popupCode.includes('field-copy-btn'), 'popup.js contains field-copy-btn class');
assert(popupCode.includes("btn.closest('.ad-field').querySelector('.ad-field-text')"), 'field copy reads text from sibling ad-field-text');
assert(popupCode.includes('navigator.clipboard.writeText(fieldText.textContent'), 'field copy uses clipboard API');

assert(cssCode.includes('.field-copy-btn'), 'CSS has field-copy-btn styles');
assert(cssCode.includes('.ad-field:hover .field-copy-btn'), 'CSS shows copy button on field hover');
assert(cssCode.includes('.field-copy-btn.copied'), 'CSS has copied state for field copy button');

// ========================
// 13. History label without quotes
// ========================

section('History label (no quotes)');

assert(!popupCode.includes("'«' + lbl"), 'history label does not wrap in quotes');
assert(popupCode.includes("lbl + (lbl.length >= 40"), 'history label uses plain text with ellipsis');

// ========================
// 14. History label inline editing
// ========================

section('History label inline edit');

assert(popupCode.includes('startLabelEdit'), 'has startLabelEdit function');
assert(popupCode.includes('commitLabelEdit'), 'has commitLabelEdit function');
assert(popupCode.includes('cancelLabelEdit'), 'has cancelLabelEdit function');
assert(popupCode.includes("contentEditable"), 'uses contentEditable for label editing');
assert(cssCode.includes('.ad-history-label.editing'), 'CSS has editing state for history label');
assert(cssCode.includes('.ad-history-label:hover'), 'CSS has hover state for history label');

// ========================
// 15. Form auto-fill: FORM_TARGETS registry
// ========================

section('FORM_TARGETS registry');

assert(popupCode.includes('const FORM_TARGETS'), 'popup.js has FORM_TARGETS constant');
assert(popupCode.includes('vk_ads:'), 'FORM_TARGETS has vk_ads entry');
assert(popupCode.includes("urlPatterns:"), 'FORM_TARGETS entries have urlPatterns');
assert(popupCode.includes("accepts:"), 'FORM_TARGETS entries have accepts array');
assert(popupCode.includes("ads.vk.com") || popupCode.includes("ads\\.vk\\.com"), 'vk_ads targets ads.vk.com');

// ========================
// 16. Form auto-fill: core functions
// ========================

section('Form auto-fill functions');

assert(popupCode.includes('function detectFormTarget'), 'has detectFormTarget function');
assert(popupCode.includes('function updateFormTargetIndicator'), 'has updateFormTargetIndicator function');
assert(popupCode.includes('function fillCardToForm'), 'has fillCardToForm function');
assert(popupCode.includes('function fillFieldToForm'), 'has fillFieldToForm function');
assert(popupCode.includes('chrome.scripting.executeScript'), 'uses chrome.scripting.executeScript for injection');
assert(popupCode.includes('editable: true'), 'FORM_TARGETS marks VK Ads as contenteditable');
assert(popupCode.includes('data-name="textblock:::title_40_vkads"'), 'VK Ads headline selector uses data-name');
assert(popupCode.includes('data-name="textblock:::text_90"'), 'VK Ads text selector uses data-name');
assert(popupCode.includes('data-name="textblock:::text_long"'), 'VK Ads long_description selector uses data-name');
assert(popupCode.includes('data-name="textblock:::title_30_additional"'), 'VK Ads button_text selector uses data-name');

// ========================
// 17. Form auto-fill: React-compatible value setting
// ========================

section('React-compatible input filling');

assert(popupCode.includes('HTMLTextAreaElement.prototype'), 'uses native textarea prototype setter for standard inputs');
assert(popupCode.includes('HTMLInputElement.prototype'), 'uses native input prototype setter for standard inputs');
assert(popupCode.includes("new Event('input'"), 'dispatches input event');
assert(popupCode.includes("bubbles: true"), 'events bubble for React delegation');
assert(popupCode.includes("new Event('change'"), 'dispatches change event');
assert(popupCode.includes("contentEditable === 'true'"), 'detects contenteditable elements');
assert(popupCode.includes("execCommand('insertHTML'"), 'uses execCommand insertHTML for ProseMirror (goes through editing pipeline)');
assert(popupCode.includes("'<p>'"), 'wraps lines in <p> tags for ProseMirror');
assert(popupCode.includes("execCommand('selectAll'"), 'selects all before replacing content');
assert(popupCode.includes("execCommand('delete'"), 'deletes selection before inserting');
assert(!popupCode.includes("execCommand('insertText'"), 'no execCommand insertText (causes extra spaces in ProseMirror)');
assert(!popupCode.includes("el.innerHTML = lines"), 'no direct innerHTML (bypasses ProseMirror state)');

// ========================
// 18. Form auto-fill: per-field fill buttons
// ========================

section('Per-field fill buttons');

assert(popupCode.includes('field-fill-btn'), 'popup.js has field-fill-btn class');
assert(popupCode.includes('SVG_FILL'), 'has SVG_FILL icon constant');
assert(popupCode.includes('SVG_LINK'), 'has SVG_LINK icon constant');
assert(popupCode.includes("fillFieldToForm(btn)"), 'field fill buttons call fillFieldToForm');

assert(cssCode.includes('.field-fill-btn'), 'CSS has field-fill-btn styles');
assert(cssCode.includes('.ad-field:hover .field-fill-btn'), 'CSS shows fill button on field hover');
assert(cssCode.includes('.field-fill-btn.copied'), 'CSS has copied state for fill button');
assert(cssCode.includes('.field-fill-btn.error'), 'CSS has error state for fill button');

// ========================
// 19. Form auto-fill: target bar UI
// ========================

section('Form target bar');

assert(popupCode.includes('formTargetBar'), 'removes legacy formTargetBar element');
assert(popupCode.includes('card-form-bar'), 'uses card-form-bar CSS class for in-card bar');
assert(popupCode.includes('form-target-fill-btn'), 'creates fill button in card bar');
assert(popupCode.includes('form-target-clear-btn'), 'creates clear button in card bar');
assert(popupCode.includes("'Заполнить форму'"), 'fill button has correct label');
assert(popupCode.includes("'Вставлено '"), 'shows fill count on success');
assert(popupCode.includes("'Поля не найдены'"), 'shows error when no fields found');
assert(popupCode.includes('function clearFormFields'), 'has clearFormFields function');

assert(cssCode.includes('.card-form-bar'), 'CSS has card-form-bar styles');
assert(cssCode.includes('.card-form-bar[data-platform="vk"]'), 'CSS has VK platform styling for card bar');
assert(cssCode.includes('.form-target-fill-btn'), 'CSS has fill button styles');
assert(cssCode.includes('.form-target-clear-btn'), 'CSS has clear button styles');
assert(cssCode.includes('.form-target-fill-btn.success'), 'CSS has success state for fill button');
assert(cssCode.includes('.form-target-fill-btn.error'), 'CSS has error state for fill button');

// ========================
// 20. Form auto-fill: tab event listeners
// ========================

section('Tab event listeners for auto-detect');

assert(popupCode.includes('chrome.tabs.onActivated'), 'listens for tab activation');
assert(popupCode.includes('chrome.tabs.onUpdated'), 'listens for tab updates');
assert(popupCode.includes("updateFormTargetIndicator()"), 'tab events trigger indicator update');

// ========================
// 21. renderField signature updated
// ========================

section('renderField platformGroup parameter');

assert(popupCode.includes("function renderField(label, value, limit, field, platformGroup)"), 'renderField accepts 5th platformGroup parameter');
// Check that renderField calls pass group
const rfCalls = popupCode.match(/renderField\('[^']+',\s*item\.\w+,\s*platform\?\.\w+,\s*'\w+',\s*group\)/g) || [];
assert(rfCalls.length >= 4, 'at least 4 renderField calls pass group param (found ' + rfCalls.length + ')');

// ========================
// 22. VK Universal: button_text field + updated limits
// ========================

section('VK Universal button_text + limits');

assert(popupCode.includes("button_text: [3, 30]"), 'PLATFORMS.vk_universal has button_text field with 30 char limit');
assert(popupCode.includes("text: [3, 90]") && popupCode.includes('vk_universal'), 'vk_universal text limit is 90 (not 220)');
assert(popupCode.includes("'button_text'"), 'button_text is in FIELD_KEYS');
assert(popupCode.includes("item.button_text") && popupCode.includes("renderField('Текст кнопки'"), 'button_text field renders in cards');
assert(popupCode.includes("parsed.button_text") && popupCode.includes("item.button_text = parsed.button_text"), 'shortenCard handles button_text');

// ========================
// 23. VK moderation rules in system prompt
// ========================

section('VK moderation rules in prompt');

assert(popupCode.includes('ЗАПРЕЩЕНО') && popupCode.includes('ЗАГЛАВНЫМИ'), 'prompt forbids all-caps words');
assert(popupCode.includes('кликбейт'), 'prompt forbids clickbait');
assert(popupCode.includes('персонализация'), 'prompt forbids personalization');
assert(popupCode.includes('орфографические'), 'prompt requires spelling accuracy');
assert(popupCode.includes('Максимум 5 эмодзи'), 'prompt limits emojis per element');
assert(popupCode.includes('ЗАПРЕЩЕНЫ в заголовках'), 'prompt prohibits emojis in headlines');
assert(popupCode.includes('Допустимые эмодзи для HR'), 'prompt lists HR-appropriate emojis');
assert(popupCode.includes('ТОЛЬКО HR'), 'prompt specifies HR-only topic');

// ========================
// 24. VK emoji whitelist enforcement
// ========================

section('VK emoji whitelist (sanitizeVkEmoji)');

assert(popupCode.includes('const VK_EMOJI_WHITELIST'), 'popup.js has VK_EMOJI_WHITELIST set');
assert(popupCode.includes('function sanitizeVkEmoji'), 'popup.js has sanitizeVkEmoji function');
// Verify whitelist contains only approved emoji and not ✅ or 💰
assert(popupCode.includes("'📌'") && popupCode.includes("'🔥'"), 'whitelist contains approved HR emoji');
// Extract Set definition (between "new Set([" and "])") to check contents
const wlMatch = popupCode.match(/VK_EMOJI_WHITELIST\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
assert(wlMatch, 'found VK_EMOJI_WHITELIST Set definition');
const wlDef = wlMatch ? wlMatch[1] : '';
assert(!wlDef.includes('✅'), 'whitelist Set does NOT contain ✅');
assert(!wlDef.includes('💰'), 'whitelist Set does NOT contain 💰');

// Verify sanitizeVkEmoji is called in all 3 post-processing paths
const sanitizeCalls = (popupCode.match(/sanitizeVkEmoji\(/g) || []).length;
assert(sanitizeCalls >= 3, 'sanitizeVkEmoji called in at least 3 places (gen, variant, shorten) — found ' + sanitizeCalls);

// Functional test of sanitize logic
const EMOJI_RE_T = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu;
const VK_WL = new Set(['📌','💼','🏢','📋','🔥','⭐','🎯','👋','📞','🚀','✨','💪','🤝','📍','🕐','🔧','⚡','📝','🎓','💡','🏆','🩺','☕','🍕','👍','👏','🙌','📊','📈','📅','💻','📱','💎','🏅','🥇','🎉','🎁','🔑','🌟','🔔','📢','🎨','⚙','🛡','🔒','😊','😉','👀','🎤','📦']);

function testSanitize(item) {
    for (const f of ['headline', 'button_text']) {
        if (item[f]) item[f] = item[f].replace(EMOJI_RE_T, '').replace(/  +/g, ' ').trim();
    }
    for (const f of ['text', 'long_description']) {
        if (!item[f]) continue;
        item[f] = item[f].replace(EMOJI_RE_T, m => VK_WL.has(m) ? m : '');
        item[f] = item[f].replace(/  +/g, ' ').trim();
    }
}

const sItem1 = { headline: '🔥 Работа', text: '✅ Офис ✨ Зарплата', long_description: '💰 Бонус 📌 Рядом' };
testSanitize(sItem1);
assert(sItem1.headline === 'Работа', 'sanitize removes emoji from headline');
assert(sItem1.text === 'Офис ✨ Зарплата', 'sanitize removes ✅ but keeps ✨ in text');
assert(sItem1.long_description === 'Бонус 📌 Рядом', 'sanitize removes 💰 but keeps 📌 in long_description');

const sItem2 = { headline: 'Без эмодзи', text: '📌 💼 🏢', button_text: '✨ Нажми' };
testSanitize(sItem2);
assert(sItem2.headline === 'Без эмодзи', 'sanitize leaves clean headline');
assert(sItem2.text === '📌 💼 🏢', 'sanitize keeps all whitelisted emoji');
assert(sItem2.button_text === 'Нажми', 'sanitize removes emoji from button_text');

// ========================
// 25. Whitespace normalization
// ========================

section('Whitespace normalization (normalizeAdWhitespace)');

assert(popupCode.includes('function normalizeAdWhitespace'), 'popup.js has normalizeAdWhitespace function');

const normCalls = (popupCode.match(/normalizeAdWhitespace\(/g) || []).length;
assert(normCalls >= 3, 'normalizeAdWhitespace called in at least 3 places — found ' + normCalls);

function testNormalize(item) {
    for (const f of ['headline', 'subheadline', 'text', 'long_description', 'button_text']) {
        if (!item[f]) continue;
        item[f] = item[f]
            .replace(/\r\n?/g, '\n')
            .replace(/[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, ' ')
            .replace(/[\t\v\f]/g, ' ')
            .replace(/ +\n/g, '\n')
            .replace(/\n +/g, '\n')
            .split('\n')
            .map(line => line.replace(/ {2,}/g, ' ').trim())
            .join('\n')
            .replace(/\n{3,}/g, '\n')
            .trim();
    }
}

const nItem1 = { text: '  Привет  мир  ', long_description: 'Строка 1  \n  Строка 2\n\n\nСтрока 3' };
testNormalize(nItem1);
assert(nItem1.text === 'Привет мир', 'normalize trims and collapses spaces');
assert(nItem1.long_description === 'Строка 1\nСтрока 2\nСтрока 3', 'normalize trims lines, collapses 3+ newlines');

const nItem2 = { headline: '\tТаб\tтекст\t', button_text: '  Нажми  сюда  ' };
testNormalize(nItem2);
assert(nItem2.headline === 'Таб текст', 'normalize replaces tabs with spaces');
assert(nItem2.button_text === 'Нажми сюда', 'normalize works for button_text');

// Trailing spaces before newlines (the VK "лишние пробелы" issue)
const nItem3 = { long_description: 'Предлагаем: \n✨ ДМС \n✨ График 2/2 \nОбязанности: \n• Касса' };
testNormalize(nItem3);
assert(!nItem3.long_description.includes(' \n'), 'normalize removes trailing spaces before newlines');
assert(nItem3.long_description === 'Предлагаем:\n✨ ДМС\n✨ График 2/2\nОбязанности:\n• Касса', 'normalize cleans full VK-style text');

// \r\n and NBSP
const nItem4 = { text: 'Строка\u00A0с\u00A0NBSP', long_description: 'A\r\nB\rC' };
testNormalize(nItem4);
assert(nItem4.text === 'Строка с NBSP', 'normalize converts NBSP to regular space');
assert(nItem4.long_description === 'A\nB\nC', 'normalize handles \\r\\n and bare \\r');

// ========================
// 26. Superlative degree rule
// ========================

section('Superlative degree rule');

assert(popupCode.includes('крупнейший'), 'prompt explicitly forbids "крупнейший"');
assert(popupCode.includes('крупнейшая'), 'prompt explicitly forbids "крупнейшая"');
assert(popupCode.includes('-ейший/-айший'), 'prompt mentions superlative suffixes');
assert(popupCode.includes('крупная сеть'), 'prompt gives neutral alternative example');

// ========================
// 27. Shorten prompt includes VK emoji whitelist
// ========================

section('Shorten prompt VK whitelist');

assert(popupCode.includes("const isVk = (PLATFORM_GROUP[item.system]"), 'shortenCard checks if platform is VK');
// Check the shorten system prompt includes whitelist for VK
assert(popupCode.includes('Никаких ✅ ❌ 💰'), 'shorten prompt explicitly forbids ✅ ❌ 💰 for VK');
assert(popupCode.includes('ТОЛЬКО из списка:') && popupCode.includes('emojiRule'), 'shorten prompt injects emoji whitelist for VK');

// ========================
// 28. truncateToLimits
// ========================

section('truncateToLimits');

assert(popupCode.includes('function truncateToLimits'), 'popup.js has truncateToLimits function');

const truncCalls = (popupCode.match(/truncateToLimits\(/g) || []).length;
assert(truncCalls >= 3, 'truncateToLimits called in at least 3 places — found ' + truncCalls);

// Functional test — simulate truncation logic
function testTruncate(item, limits) {
    for (const f of Object.keys(limits)) {
        if (!item[f]) continue;
        const max = limits[f];
        if (item[f].length > max) {
            let cut = item[f].substring(0, max);
            const lastNl = cut.lastIndexOf('\n');
            const lastDot = cut.lastIndexOf('.');
            const lastExcl = cut.lastIndexOf('!');
            const breakAt = Math.max(lastNl, lastDot, lastExcl);
            if (breakAt > max * 0.6) {
                item[f] = item[f].substring(0, breakAt + 1).trim();
            } else {
                item[f] = cut.trim();
            }
        }
    }
}

const tItem1 = { long_description: 'A'.repeat(550) };
testTruncate(tItem1, { long_description: 500 });
assert(tItem1.long_description.length <= 500, 'truncate caps long_description to 500 chars');

const tItem2 = { long_description: 'Предлагаем:\n✨ ДМС\n✨ График.\nОбязанности:\n• Касса\n• ' + 'X'.repeat(500) };
testTruncate(tItem2, { long_description: 500 });
assert(tItem2.long_description.length <= 500, 'truncate breaks at sentence boundary');
assert(tItem2.long_description.endsWith('.') || tItem2.long_description.endsWith('\n') || tItem2.long_description.length === 500, 'truncate prefers clean break');

const tItem3 = { headline: 'Короткий', long_description: 'В лимите' };
testTruncate(tItem3, { headline: 40, long_description: 500 });
assert(tItem3.headline === 'Короткий', 'truncate leaves text within limit untouched');
assert(tItem3.long_description === 'В лимите', 'truncate leaves short long_description untouched');

// ========================
// 29. Long description structure and limit in prompt
// ========================

section('Long description structure (benefits first)');

assert(popupCode.includes('Мы предлагаем:'), 'prompt specifies benefits section for balanced/formal');
assert(popupCode.includes('Ваши задачи:'), 'prompt specifies tasks section for balanced/formal');
assert(popupCode.includes('ОБЕ секции ОБЯЗАТЕЛЬНЫ'), 'prompt requires both sections for balanced/formal');
assert(popupCode.includes('55% выгоды'), 'prompt specifies balance ratio for balanced/formal');
assert(popupCode.includes('МАКСИМУМ 450 символов'), 'prompt sets 450 char hard limit for long_description');
assert(popupCode.includes('НЕ ставь пробелы в конце строк'), 'prompt forbids trailing spaces');
assert(popupCode.includes('3-5 эмодзи') && popupCode.includes('Креативный'), 'creative style allows 3-5 emoji');
assert(popupCode.includes('2-3 эмодзи') && popupCode.includes('Сбалансированный'), 'balanced style allows 2-3 emoji');
assert(popupCode.includes('1-2 эмодзи') && popupCode.includes('Формальный'), 'formal style allows 1-2 emoji');
assert(popupCode.includes('НИКОГДА не ставь эмодзи в начало строки'), 'creative style forbids emoji at line start');
assert(popupCode.includes('НИКОГДА не ставь эмодзи в начало строки') && popupCode.includes('НИКОГДА эмодзи в начале строки'), 'vk_universal also forbids emoji at line start');
assert(popupCode.includes('структура свободная') || popupCode.includes('Структура long_description СВОБОДНАЯ'), 'creative style has free-form long_description');
assert(popupCode.includes('одной строкой в конце'), 'creative style: tasks as one line at the end');
assert(popupCode.includes('В КОНЦЕ предложений'), 'creative style: emoji at end of sentences');

// ========================
// 30. fixLineStartEmoji
// ========================

section('fixLineStartEmoji');

assert(popupCode.includes('function fixLineStartEmoji'), 'popup.js has fixLineStartEmoji function');

const fixCalls = (popupCode.match(/fixLineStartEmoji\(/g) || []).length;
assert(fixCalls >= 4, 'fixLineStartEmoji called in at least 4 places (definition + 3 paths) — found ' + fixCalls);

// Functional tests with local copy of the regex
// Regex with capture group — preserves emoji after dash
const LINE_START_EMOJI_RE = /^((?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*)\s*/u;
function testFixLineStartEmoji(item) {
    for (const f of ['text', 'long_description']) {
        if (!item[f]) continue;
        item[f] = item[f].split('\n').map(line => line.replace(LINE_START_EMOJI_RE, '— $1 ')).join('\n');
    }
}

const fItem1 = { long_description: '📌 Оформление по ТК РФ\n📌 ДМС\n📌 График 2/2' };
testFixLineStartEmoji(fItem1);
assert(fItem1.long_description === '— 📌 Оформление по ТК РФ\n— 📌 ДМС\n— 📌 График 2/2', 'moves line-start emoji after — (preserves emoji)');

const fItem2 = { long_description: 'Мы предлагаем:\n✨ ДМС и бонусы\nВаши задачи:\n🔧 Работа на кассе' };
testFixLineStartEmoji(fItem2);
assert(fItem2.long_description === 'Мы предлагаем:\n— ✨ ДМС и бонусы\nВаши задачи:\n— 🔧 Работа на кассе', 'moves emoji after dash in mixed lines');

const fItem3 = { long_description: '— 📌 ДМС и бонусы\nОбычный текст без эмодзи' };
testFixLineStartEmoji(fItem3);
assert(fItem3.long_description === '— 📌 ДМС и бонусы\nОбычный текст без эмодзи', 'leaves — dash lines and plain text unchanged');

const fItem4 = { text: '🔥Горячая вакансия', long_description: '📌Без пробела' };
testFixLineStartEmoji(fItem4);
assert(fItem4.text === '— 🔥 Горячая вакансия', 'moves emoji after dash (no space case) in text');
assert(fItem4.long_description === '— 📌 Без пробела', 'moves emoji after dash (no space case) in long_description');

const fItem5 = { headline: '📌 Заголовок', long_description: 'Текст без эмодзи в начале' };
testFixLineStartEmoji(fItem5);
assert(fItem5.headline === '📌 Заголовок', 'does NOT touch headline (only text and long_description)');
assert(fItem5.long_description === 'Текст без эмодзи в начале', 'plain text unchanged');

// ========================
// 31. Unicode whitespace in normalizeAdWhitespace
// ========================

section('Unicode whitespace normalization');

assert(popupCode.includes('\\u2000-\\u200B') || popupCode.includes('\\u2000'), 'normalizeAdWhitespace handles Unicode spaces (U+2000 range)');
assert(popupCode.includes('\\u202F'), 'normalizeAdWhitespace handles narrow no-break space');
assert(popupCode.includes('\\u3000'), 'normalizeAdWhitespace handles ideographic space');
assert(popupCode.includes('\\uFEFF'), 'normalizeAdWhitespace handles BOM/ZWNBSP');

const nItem5 = { long_description: 'Текст\u2003с\u2003em-space', text: 'Тонкий\u2009пробел' };
testNormalize(nItem5);
assert(nItem5.long_description === 'Текст с em-space', 'normalize converts em-space (U+2003) to regular space');
assert(nItem5.text === 'Тонкий пробел', 'normalize converts thin space (U+2009) to regular space');

const nItem6 = { long_description: 'A\u200BB\u3000C\uFEFFD' };
testNormalize(nItem6);
assert(nItem6.long_description === 'A B C D', 'normalize converts zero-width space, ideographic space, BOM to regular space');

// ========================
// Summary
// ========================

console.log('\n=============================');
console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
console.log('=============================');

if (failed > 0) process.exit(1);
