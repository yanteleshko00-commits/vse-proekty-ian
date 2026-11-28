# NEXORA runtime configuration

The canonical runtime configuration is nexora/runtime-config.js. Standalone deployment copies preserve isolated build roots; CI detects divergence in runtime config, background tasks, analytics and compression modules. No new dependencies or paid infrastructure were added.

Public navigation uses NEXORA_PUBLIC_LOBBY_URL separately from the backend NEXORA_LOBBY_URL. PROJECT_GENERATOR_URL defaults to the -1 deployment; existing explicit environment overrides win. Bridge secrets must match on both ends. All secrets remain environment-only.

Image concurrency defaults to 2 (configurable 1–4); text/math to 4 (1–8). Configure IMAGE_CONCURRENCY, TEXT_CONCURRENCY, MATH_CONCURRENCY and corresponding *_RATE_MINUTE / *_RATE_HOUR variables based on measured capacity. Rate limiting remains per process. Startup smoke tests require explicit NEXORA_ALLOW_PRODUCTION_SMOKE=1 in production. Prefer CI or controlled manual checks.

For persistent jobs, configure mounted storage with GENERATION_JOBS_DIR=/var/data/generation-jobs (projects) and NEXORA_JOB_DIR=/var/data/nexora-jobs (studios). Free ephemeral storage cannot guarantee recovery across deployments. One-time studio tickets remain process-local; a shared transactional store requires infrastructure and migration. Never disable TLS validation. Provision a trusted PEM bundle using NODE_EXTRA_CA_CERTS for stable GigaChat CA handling.

Project CSS sections 1–11 are served as one bundle in original order. Edit the source sections and regenerate with node scripts/build-project-css.mjs. Sections 12–13 have different document positions and remain separate to preserve cascade.
