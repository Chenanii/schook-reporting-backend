# Docker Hub and VPS deployment

The backend and frontend are separate GitHub repositories. Each repository builds and publishes its own Docker image when a commit reaches `main`. The backend repository also contains the Compose stack and VPS deployment workflow. The stack runs PostgreSQL, the API, the frontend, and Caddy for automatic HTTPS certificates.

## One-time setup

1. Create Docker Hub repositories named `school-reporting-backend` and `school-reporting-frontend` under your account. They may be private.
2. Create a Docker Hub access token with write access for GitHub Actions and a separate read-only token for the VPS deployment workflow.a
3. Install Docker Engine with the Compose plugin on the VPS. Create a deployment user that can run Docker, and allow inbound TCP ports 80 and 443. Point the domain's DNS A/AAAA records at the VPS.
4. Add these GitHub Actions secrets to **both** GitHub repositories (`schook-reporting-backend` and `schook-reporting-frontend`):

   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN` — Docker Hub token with write access
   - `DOCKERHUB_PULL_TOKEN` — Docker Hub read-only token
   - `VPS_HOST`
   - `VPS_USER`
   - `VPS_SSH_PRIVATE_KEY` — private key for the deployment user
   - `VPS_KNOWN_HOSTS` — verified host key line for the VPS
   - `VPS_DEPLOY_PATH` — absolute path without spaces, for example `/opt/nexa-school`

5. From the backend project directory on your computer, copy the deployment files to the VPS. Replace `deploy-user`, `vps-host`, and the path with your values:

   ```sh
   ssh deploy-user@vps-host 'mkdir -p /opt/nexa-school'
   scp docker-compose.yml Caddyfile .env.production.example deploy-user@vps-host:/opt/nexa-school/
   ssh deploy-user@vps-host 'cd /opt/nexa-school && cp .env.production.example .env && chmod 600 .env'
   ```

   Edit `/opt/nexa-school/.env` on the VPS. Replace the Docker Hub username, domain, database password, JWT secret, and public URLs. Use an alphanumeric database password so it can safely be used in the generated PostgreSQL connection URL. Generate secrets with `openssl rand -hex 32`. Set `DOMAIN`, `CORS_ORIGINS`, teacher invitation and password reset URLs, and payment callback/return URLs to the real HTTPS domain. The backend requires HTTPS callback and return URLs when `NODE_ENV=production`. Keep `.env` private and  back it up securely.

6. Push the deployment files and workflows to the backend `main` branch, then push frontend changes to the frontend `main` branch. GitHub Actions will publish the `latest` and commit-SHA image tags, pull images on the VPS, run database migrations, and restart the services. Caddy obtains and renews HTTPS certificates automatically.

## Database notes

PostgreSQL data lives in the named `postgres_data` Docker volume and survives container updates. This stack starts a new database; it does not copy data from a developer machine or an existing VPS database. Import an existing database backup into the new PostgreSQL service before switching users to the new deployment.

## Manual operations

From the deployment directory on the VPS:

```sh
docker compose ps
docker compose logs -f backend
docker compose pull
docker compose up -d
```

Never commit `.env`, access tokens, SSH private keys, or production database backups.
