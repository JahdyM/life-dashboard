# Life Dashboard — Deploy gratuito (Streamlit + FastAPI)

Este repositorio agora suporta **duas camadas**:
1. **Streamlit UI** (login, visualizacao, fallback local)
2. **FastAPI Backend + Worker** (persistencia rapida, sync Google em background)

## Stack
- Streamlit Community Cloud (UI)
- Render (API + Worker)
- Neon Postgres (dados)
- Upstash Redis (fila/cache opcional)
- Google OAuth (login + Calendar)

---

## 1) Subir para GitHub
- Envie todo o projeto para um repositorio privado.

## 2) Criar banco Postgres gratuito (Neon)
- Crie um projeto no Neon e copie a connection string.
- Use o formato:
  - `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`

## 3) Criar Redis gratuito (Upstash)
- Crie um banco Redis.
- Copie o `REST_URL` e `REST_TOKEN`.

## 4) Google Cloud (OAuth + Calendar API)
- Ative **Google Calendar API**.
- Crie **OAuth Client** (Web application).
- Authorized redirect URIs:
  - `https://jahdy-gui-dashboard.streamlit.app/oauth2callback` (login Streamlit)
  - `https://jahdy-gui-dashboard.streamlit.app` (connect Calendar)
  - `https://<seu-backend>.onrender.com/v1/oauth/google/callback` (backend OAuth)
- Authorized JavaScript origin:
  - `https://jahdy-gui-dashboard.streamlit.app`
- Adicione `jahdy.moreno@gmail.com` e `guilherme.m.rods@gmail.com` como test users (se o app estiver em modo Teste).

## 5) Render (API + Worker)
- Crie dois serviços a partir do repo:
  - **Web service**: FastAPI
  - **Worker**: sync de Google Calendar
- Use o `render.yaml` incluido.
- Configure ENV:
  - `DATABASE_URL`
  - `BACKEND_SESSION_SECRET`
  - `GOOGLE_TOKEN_ENCRYPTION_KEY`
  - `CALENDAR_CLIENT_ID`
  - `CALENDAR_CLIENT_SECRET`
  - `CALENDAR_REDIRECT_URI` (ex.: `https://jahdy-gui-dashboard.streamlit.app`)
  - `ALLOWED_EMAILS`
  - `REDIS_URL` (opcional)

## 6) Streamlit Secrets (UI)
- Use `.streamlit/secrets.example.toml` como base.
- Preencha:
  - `auth.*` (login Streamlit)
  - `app.allowed_emails`
  - `app.JAHDY_GOOGLE_CALENDAR_ICS` / `app.GUILHERME_GOOGLE_CALENDAR_ICS`
  - `app.GOOGLE_TOKEN_ENCRYPTION_KEY`
  - `calendar_auth.redirect_uri`
  - `database.url` (Postgres)

## 7) Rodar local (opcional)
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
streamlit run app.py
```

## 8) Acesso no celular
- Abra `https://jahdy-gui-dashboard.streamlit.app` no Safari/Chrome.
- Login com Google (emails permitidos).
