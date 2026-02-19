# Deploy gratuito com acesso do celular

## Stack
- Hosting: Streamlit Community Cloud (free)
- Login: Google OAuth nativo do Streamlit
- Banco: Postgres (ex.: Supabase Free) para persistencia

## 1) Subir para GitHub
- Envie `app.py`, `requirements.txt` e este projeto para um repositorio.

## 2) Criar banco Postgres gratuito
- Crie um projeto no Supabase e copie a connection string Postgres.
- Troque para SQLAlchemy driver:
  - De: `postgresql://...`
  - Para: `postgresql+psycopg2://...`

## 3) Configurar Google OAuth
- No Google Cloud Console, crie um OAuth Client (Web application).
- Authorized redirect URI:
  - `https://SEU-APP.streamlit.app/oauth2callback`

## 4) Configurar Secrets no Streamlit Cloud
- Abra o app no Streamlit Cloud e cole os secrets baseados em `.streamlit/secrets.example.toml`.
- Defina:
  - `auth.google.client_id`
  - `auth.google.client_secret`
  - `auth.redirect_uri`
  - `auth.cookie_secret`
  - `app.allowed_email` (seu email unico)
  - `database.url` (Postgres)

## 5) Publicar
- Deploy no Streamlit Community Cloud apontando para `app.py`.
- A aplicacao vai permitir acesso somente ao email em `app.allowed_email`.

## 6) Acesso no celular
- Abra a URL `https://SEU-APP.streamlit.app` no Safari/Chrome.
- Login com Google usando o email permitido.
