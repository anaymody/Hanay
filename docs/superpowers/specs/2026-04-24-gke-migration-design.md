# DHeli GKE Migration Design

Migrate the DHeli compute layer (Next.js app + Python scraper) from Docker Compose to GKE Standard with hand-written Kubernetes manifests. Supabase remains the hosted database. Goal is hands-on GKE/Kubernetes experience for learning and resume purposes.

## Architecture

```
                         ┌─────────────────────────────────────────────────┐
                         │              GCP Project                        │
                         │                                                 │
   Internet              │  ┌──────────────────────────────────────────┐   │
      │                  │  │         GKE Standard Cluster             │   │
      ▼                  │  │         (us-west2-a)                     │   │
  Cloud DNS ──> Ingress  │  │                                          │   │
             (GCE LB)    │  │  ┌─────────────┐   ┌──────────────────┐  │   │
                  │      │  │  │  Deployment  │   │    CronJob       │  │   │
                  ▼      │  │  │  dheli-app   │   │  dheli-scraper   │  │   │
             Service     │  │  │  (Next.js)   │   │  (midnight LA)   │  │   │
             (ClusterIP) │  │  │  replicas: 2 │   │  Playwright +    │  │   │
                  │      │  │  └──────┬───────┘   │  Chromium         │  │   │
                  ▼      │  │         │           └────────┬─────────┘  │   │
              dheli-app  │  │         │                    │            │   │
              Pods       │  │         ▼                    ▼            │   │
                         │  │     Supabase (external, hosted)          │   │
                         │  │     - PostgreSQL                         │   │
                         │  │     - Realtime                           │   │
                         │  │     - Storage                            │   │
                         │  └──────────────────────────────────────────┘   │
                         │                                                 │
                         │  Artifact Registry (Docker images)              │
                         └─────────────────────────────────────────────────┘
```

## GKE Cluster & Node Pool

- **Cluster type:** GKE Standard, single zone (`us-west2-a` — close to USC/LA for low latency)
- **Release channel:** `regular`
- **Network:** Default VPC
- **Node pool:** 1 pool, 1-3 nodes, cluster autoscaler enabled
- **Machine type:** `e2-medium` (2 vCPU, 4 GB RAM)
- **VM type:** Standard (not spot/preemptible) — $300 free trial credits cover the cost

## Docker Images & Artifact Registry

- **Artifact Registry:** One Docker repository named `dheli` in `us-west2`
- **Images:**
  - `dheli-app` — built from `app/Dockerfile`
  - `dheli-scraper` — built from `scraper/Dockerfile`
- **Tag strategy:** `latest` + git SHA (e.g. `dheli-app:abc123f`)

### App Dockerfile Change

The current Dockerfile runs `npm run dev`. For GKE it must build and serve production:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

### Scraper Dockerfile

No changes. The CronJob manifest overrides the command to run `python -u scrape.py` directly (single execution, exit when done).

## Kubernetes Manifests

All manifests live in `k8s/` at the project root.

```
k8s/
├── namespace.yaml
├── app-deployment.yaml
├── app-service.yaml
├── scraper-cronjob.yaml
├── managed-certificate.yaml
└── ingress.yaml
```

### namespace.yaml

Creates a `dheli` namespace to isolate workloads from `default`.

### Secrets

Created imperatively (not checked into git):

```bash
kubectl create secret generic dheli-secrets -n dheli \
  --from-literal=DATABASE_URL='...' \
  --from-literal=SESSION_SECRET='...' \
  --from-literal=ADMIN_SECRET='...' \
  --from-literal=GEMINI_API_KEY='...' \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL='...' \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY='...'
```

### app-deployment.yaml

- **Replicas:** 2
- **Image:** `us-west2-docker.pkg.dev/PROJECT_ID/dheli/dheli-app:<sha>`
- **Port:** 3000
- **Env vars:** All from `dheli-secrets` Secret, plus `NODE_ENV=production`
- **Resource requests:** 256Mi memory, 250m CPU
- **Resource limits:** 512Mi memory, 500m CPU
- **Liveness probe:** HTTP GET `/api/halls`, period 10s
- **Readiness probe:** HTTP GET `/api/halls`, period 5s

### app-service.yaml

- **Type:** ClusterIP
- **Port:** 80 -> targetPort 3000
- **Selector:** matches `dheli-app` pods

### scraper-cronjob.yaml

- **Schedule:** `0 7 * * *` (UTC) = midnight PDT (LA time)
- **Command override:** `["python", "-u", "scrape.py"]`
- **Env vars:** `DATABASE_URL`, `APP_INTERNAL_URL` (`http://dheli-app.dheli.svc.cluster.local`), `ADMIN_SECRET` from `dheli-secrets`
- **restartPolicy:** OnFailure
- **concurrencyPolicy:** Forbid (prevent overlapping runs)
- **successfulJobsHistoryLimit:** 3
- **failedJobsHistoryLimit:** 3

### ingress.yaml

- **Ingress class:** GCE (GKE default)
- **Annotations:** reference the ManagedCertificate and static IP
- **Rules:** route all traffic to `dheli-app` Service on port 80

### managed-certificate.yaml

- Google-managed SSL certificate for the domain
- Provisioned and renewed automatically by GKE

## Domain, DNS & TLS

1. **Buy domain** on GoDaddy (or any registrar)
2. **Create Cloud DNS zone** in GCP for the domain — GCP provides 4 nameservers
3. **Update nameservers** in GoDaddy to point to the 4 Google Cloud DNS nameservers
4. **Reserve a static IP** in GCP (`gcloud compute addresses create dheli-ip --global`)
5. **Create A record** in Cloud DNS: domain -> static IP
6. **Create CNAME** for `www` subdomain -> root domain
7. **ManagedCertificate** + Ingress annotation handles TLS automatically

DNS propagation takes 15-60 minutes after nameserver change. TLS certificate provisioning requires DNS to be working first.

## Deployment Workflow

### One-Time Setup

1. Create GCP project, enable APIs (GKE, Artifact Registry, Cloud DNS, Compute Engine)
2. Install & configure `gcloud` CLI, authenticate
3. Create Artifact Registry repository
4. Create GKE cluster & node pool
5. Get cluster credentials (`gcloud container clusters get-credentials`)
6. Create namespace, secrets, static IP, Cloud DNS zone, managed certificate
7. Buy domain, point nameservers to Cloud DNS
8. Apply all manifests (`kubectl apply -f k8s/`)

### Per-Deploy Workflow

```bash
# 1. Build & tag images
docker build -t us-west2-docker.pkg.dev/PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD) ./app
docker build -t us-west2-docker.pkg.dev/PROJECT_ID/dheli/dheli-scraper:$(git rev-parse --short HEAD) ./scraper

# 2. Push to Artifact Registry
docker push us-west2-docker.pkg.dev/PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD)
docker push us-west2-docker.pkg.dev/PROJECT_ID/dheli/dheli-scraper:$(git rev-parse --short HEAD)

# 3. Update deployment image
kubectl set image deployment/dheli-app dheli-app=us-west2-docker.pkg.dev/PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD) -n dheli

# 4. Verify rollout
kubectl rollout status deployment/dheli-app -n dheli
```

### Rollback

```bash
kubectl rollout undo deployment/dheli-app -n dheli
```

### Manual Scrape Trigger

```bash
kubectl create job --from=cronjob/dheli-scraper dheli-scraper-manual -n dheli
```

## What Stays the Same

- Supabase (PostgreSQL, Realtime, Storage) — no changes
- Application code — no changes to Next.js routes, React components, or scraper logic
- Gemini API integration — no changes
- Session management (anonymous cookies) — no changes

## What Changes

| Before | After |
|---|---|
| `docker compose up` locally | GKE Standard cluster in `us-west2-a` |
| Dev Dockerfile (`npm run dev`) | Production Dockerfile (`npm run build` + `npm start`) |
| `scheduler.py` long-running process | Kubernetes CronJob (run and exit) |
| `http://app:3000` (compose network) | `http://dheli-app.dheli.svc.cluster.local` (cluster DNS) |
| No domain/TLS | Custom domain + Google-managed TLS |
| `.env` file | Kubernetes Secret |
