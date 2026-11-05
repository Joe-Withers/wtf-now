# Deployment

**Status:** the Docker, Compose and Tailscale files here have not been run. Docker wasn't available where they were written, so expect to fix small things on first use. Serving the app, pushing to the remote and rebuilding from it are covered by tests.

The app is one container that serves the API and the built frontend. It sits behind Tailscale, so only your devices can reach it and there's no login. Project data lives on a Docker volume and is pushed to a private GitHub repo after every change.

## Set up

1. Get a small VPS with Docker and Docker Compose, and clone this repo onto it.
2. Create an empty private GitHub repo for the project data.
3. Make a deploy key for it, in `deploy/`, and add `bundle-key.pub` to that repo with write access:
   ```bash
   ssh-keygen -t ed25519 -f deploy/bundle-key -N ""
   ```
4. Create an auth key in the Tailscale admin console, and enable HTTPS certificates there.
5. Copy `.env.example` to `.env` at the repo root and fill it in, including:
   ```
   BUNDLE_REMOTE=git@github.com:<you>/<project-data>.git
   ```
6. Start it:
   ```bash
   cd deploy
   TS_AUTHKEY=<your key> docker compose up -d --build
   ```
7. Install Tailscale on your phone, open `https://wtf-now.<your-tailnet>.ts.net`, and add it to your home screen.

## Rebuilding on a new server

Follow the same steps with the same `BUNDLE_REMOTE`. With an empty data volume, the app clones the project from the remote.

Photos are only backed up if `S3_BUCKET` is set. Create a bucket with Cloudflare R2 or Backblaze B2, and put its details in `.env`. Without it, photos stay on the server's volume.

Chat history and pending proposals are not backed up. They're short-lived, and everything worth keeping is in the wiki.

## Updating

```bash
git pull
cd deploy
TS_AUTHKEY=<your key> docker compose up -d --build
```
