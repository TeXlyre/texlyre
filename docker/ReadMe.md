# TeXlyre Docker & Cloudflare Tunnel Setup (Production)

This guide explains how to build, serve, and securely expose the production version of [TeXlyre](https://github.com/TeXlyre/texlyre), a local-first collaborative LaTeX editor, using:
By default, this setup runs TeXlyre locally at `http://localhost:5173`.

- Docker and Docker Compose
- Cloudflare Tunnel for secure public access


By default, this setup runs TeXlyre locally at `http://localhost:5173`.

---

## Folder Structure

```
docker/
├── Dockerfile             # Production-ready Docker image
├── docker-compose.yml     # Orchestrates TeXlyre and Cloudflare Tunnel
├── .env                   # (Optional) Stores Cloudflare token
└── README.md              # This file
```

---

## 1. Build the Docker Image

Run the following from the project root:

```
docker build -f docker/Dockerfile -t texlyre:latest .
```

This builds the app using `npm run build` and prepares it for production with `vite preview`.

---

## 2. Start the Application (Local-only)

To serve TeXlyre locally on port `5173`, run:

```
docker compose up -d
```

Access the app by visiting:
[http://localhost:5173](http://localhost:5173)

---

## 3. Enable Public Access (Optional)

If you want to securely access your TeXlyre instance over the internet, you can optionally enable **Cloudflare Tunnel**.

### How to enable Cloudflare Tunnel:

1. **Uncomment the `cloudflared` service**
   in `docker-compose.yml` (lines 12–20).

2. **Create a `.env` file** in the `docker/` directory:

   ```
   CF_TUNNEL_TOKEN=your-cloudflare-tunnel-token
   ```

   You can create a tunnel and obtain the token from the Cloudflare Zero Trust dashboard:
   [https://dash.cloudflare.com](https://dash.cloudflare.com)

3. **Restart the application**:

   ```
   docker compose up -d --build
   ```

Once enabled, your app will be accessible via a unique Cloudflare-provided HTTPS URL (shown in dashboard or logs). No ports need to be exposed.

## 4. Accessing the Application

- Visit [http://localhost:5173](http://localhost:5173) to access locally
- The public URL from Cloudflare Tunnel will appear in:
  - Your Cloudflare dashboard, or
  - Cloudflared container logs

---

## Production Scripts

Example `package.json` scripts used in this setup:

```
"scripts": {
  "build": "node scripts/update-sw-version.js && node scripts/generate-plugins-index.js && tsc && vite build",
  "preview": "vite preview",
  "start": "vite preview --host --port 5173"
}
```

---

## Dockerfile Highlights

```
EXPOSE 5173
CMD ["npm", "start"]
```

Uses a multi-stage build to reduce final image size and starts the production frontend.

---

## Common Docker Commands

| Task                     | Command                                           |
|--------------------------|--------------------------------------------------|
| Build/rebuild the image  | `docker build -f docker/Dockerfile -t texlyre .` |
| Start services           | `docker compose up -d`                           |
| Stop services            | `docker compose down`                            |
| Remove volumes/data      | `docker compose down -v`                         |
| View logs                | `docker compose logs -f`                         |

---

## Security Considerations

- Your machine is not exposed to the internet directly
- Cloudflare handles HTTPS termination, optional authentication, and domain routing

---

## Summary

- TeXlyre builds with Vite and runs in production using Docker
- Runs locally on port 5173 out of the box
- Cloudflare Tunnel can optionally expose it publicly with HTTPS
- No runtime configuration required for port setup

---

## TODO

- [ ] Write a full Cloudflare Tunnel setup guide, including token generation, DNS config, and Zero Trust access
- [ ] Add GitHub Actions CI/CD to automatically build and publish the Docker image to `ghcr.io`, replacing manual builds
- [ ] Add MakeFile for dev-mode,local build and run
---
