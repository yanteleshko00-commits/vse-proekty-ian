# NEXORA Image Studio

Standalone image-generation website and API.

## Render service

- Service: `nexora-image-studio`
- Root directory: repository root
- Build command: `cd nexora-image-studio && npm install`
- Start command: `cd nexora-image-studio && npm start`
- Health check: `/health`
- Region: Oregon

The website, API, rate limiter, provider selection, GigaChat OAuth and image retrieval all run in this service. Image requests do not call NEXORA Lobby.

## Secrets

Set provider credentials only in the Render Environment for `nexora-image-studio`:

- `GIGACHAT_API_KEY` or `GIGACHAT_AUTH_KEY` — primary GigaChat Basic authorization key
- `GIGACHAT_BACKUP_AUTH` — optional backup GigaChat Basic authorization key
- `GIGACHAT_SCOPE` — optional; defaults to `GIGACHAT_API_PERS`
- `GIGACHAT_IMAGE_MODEL` — optional model override
- `OPENAI_API_KEY` — optional second provider; requests are raced and the first successful result is returned

The startup launcher downloads and validates the official Russian Trusted Root CA and adds it to Node.js trust for GigaChat TLS. If certificate loading fails, the app still starts and logs the certificate problem.

Never put provider keys in GitHub, frontend code, or URLs.
