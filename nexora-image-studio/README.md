# NEXORA Image Studio

Standalone website for NEXORA image creation and editing.

## Render

Create a Node.js Web Service from this repository with:

- Build command: `cd nexora-image-studio && npm install`
- Start command: `cd nexora-image-studio && npm start`
- Health check path: `/health`
- Region: Oregon (same region as NEXORA Lobby)

The frontend and its web server are hosted separately from NEXORA Lobby. Image generation requests are temporarily proxied to the existing NEXORA Image API in `nexora-lobby`; provider credentials remain server-side in that service.

Optional environment variable:

- `NEXORA_IMAGE_API_URL`: base URL of the existing NEXORA Image API. Defaults to `https://nexora-lobby.onrender.com`.

Do not put provider API keys in this service's frontend or repository.
