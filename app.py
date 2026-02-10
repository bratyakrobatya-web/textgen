import streamlit as st
import requests
import json
import time

st.set_page_config(page_title="HH LLM Gateway Test", layout="centered")
st.title("HH LLM Gateway — проверка доступности")

GATEWAY_URL = "https://llmgtw.hhdev.ru/proxy/anthropic/v1/messages"

MODELS = {
    "Claude Haiku 4.5": "claude-haiku-4-5-20251001",
    "Claude Sonnet 4.5": "claude-sonnet-4-5-20250929",
    "Claude Opus 4.5": "claude-opus-4-5-20251101",
}

api_key = st.text_input("API Token", type="password", placeholder="ваш токен от llmgtw")
model_name = st.selectbox("Модель", list(MODELS.keys()))
user_prompt = st.text_area("Промпт", value="Скажи 'привет' одним словом.", height=100)
max_tokens = st.slider("Max tokens", 64, 4096, 256)

if st.button("Отправить запрос", type="primary", disabled=not api_key):
    model_id = MODELS[model_name]

    # Step 1: DNS + connectivity check
    with st.status("Проверяю доступность gateway...", expanded=True) as status:
        try:
            import socket
            host = "llmgtw.hhdev.ru"
            st.write(f"DNS lookup `{host}`...")
            ip = socket.gethostbyname(host)
            st.write(f"Resolved: `{ip}`")
        except socket.gaierror:
            st.error(f"DNS не резолвит `{host}` — хост недоступен из этой сети.")
            st.info("Это значит, что Streamlit Cloud (или текущая сеть) не имеет доступа к корп-gateway.")
            st.stop()

        # Step 2: actual API call
        st.write(f"Отправляю запрос к `{model_id}`...")
        t0 = time.time()
        try:
            resp = requests.post(
                GATEWAY_URL,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": model_id,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
                timeout=30,
            )
            elapsed = time.time() - t0
        except requests.exceptions.ConnectionError as e:
            st.error(f"Connection failed: {e}")
            st.info("Gateway недоступен — сеть не может установить TCP-соединение.")
            st.stop()
        except requests.exceptions.Timeout:
            st.error("Timeout (30s) — gateway не ответил.")
            st.stop()

        status.update(label="Готово", state="complete")

    # Step 3: show results
    st.divider()
    st.subheader("Результат")
    col1, col2 = st.columns(2)
    col1.metric("HTTP Status", resp.status_code)
    col2.metric("Время", f"{elapsed:.2f}s")

    if resp.status_code == 200:
        data = resp.json()
        text = data.get("content", [{}])[0].get("text", "")
        st.success(text)
        usage = data.get("usage", {})
        st.caption(
            f"model: `{data.get('model')}` · "
            f"input: {usage.get('input_tokens', '?')} · "
            f"output: {usage.get('output_tokens', '?')} tokens"
        )
    else:
        st.error(f"Ошибка {resp.status_code}")
        st.code(resp.text, language="json")

    with st.expander("Raw response"):
        st.code(resp.text, language="json")
