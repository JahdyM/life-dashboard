# Deploy gratuito com acesso do celular

## Stack
- Hosting: Streamlit Community Cloud (free)
- Login: Google OAuth nativo do Streamlit
- Banco: Postgres (ex.: Supabase Free) para persistencia
- Layout: tabs independentes com auto-save por aba

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
  - `https://jahdy-gui-dashboard.streamlit.app/oauth2callback`

## 4) Configurar Secrets no Streamlit Cloud
- Abra o app no Streamlit Cloud e cole os secrets baseados em `.streamlit/secrets.example.toml`.
- Defina:
  - `auth.google.client_id`
  - `auth.google.client_secret`
  - `auth.redirect_uri`
  - `auth.cookie_secret`
  - `app.allowed_emails` (emails permitidos, separados por virgula)
  - `app.JAHDY_GOOGLE_CALENDAR_ICS` e `app.GUILHERME_GOOGLE_CALENDAR_ICS`
  - `app.JAHDY_GOOGLE_ALLOWED_CALENDAR_IDS` e `app.GUILHERME_GOOGLE_ALLOWED_CALENDAR_IDS` (opcional)
  - `app.GOOGLE_TOKEN_ENCRYPTION_KEY` (obrigatorio para escrita no Google Calendar)
  - `calendar_auth.redirect_uri` (URL autorizada para conectar Google Calendar com escopo de escrita)
  - `database.url` (Postgres - obrigatorio; sem isso o app bloqueia entrada para evitar perda de dados)

## 5) Exemplo de bloco de secrets
```toml
[database]
url = "postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require"
```

## 6) Publicar
- Deploy no Streamlit Community Cloud apontando para `app.py`.
- A aplicacao vai permitir acesso somente aos emails em `app.allowed_emails`.
- Se `database.url` estiver configurado com Postgres, a app migra automaticamente os dados locais (SQLite) na primeira execucao.

## 7) Acesso no celular
- Abra a URL `https://jahdy-gui-dashboard.streamlit.app` no Safari/Chrome.
- Login com Google usando o email permitido.
