# DHeli GKE Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate DHeli's Next.js app and Python scraper from Docker Compose to a GKE Standard cluster with hand-written Kubernetes manifests, Artifact Registry, Cloud DNS, and Google-managed TLS.

**Architecture:** Two Docker images (app + scraper) pushed to Artifact Registry. App runs as a Deployment (2 replicas) behind a ClusterIP Service + GCE Ingress. Scraper runs as a CronJob at midnight LA time. Supabase remains the external hosted database. Custom domain via Cloud DNS with Google-managed TLS certificate.

**Tech Stack:** GKE Standard, Artifact Registry, Cloud DNS, ManagedCertificate CRD, kubectl, gcloud CLI

---

## File Structure

**New files:**
- `k8s/namespace.yaml` — Kubernetes namespace definition
- `k8s/app-deployment.yaml` — Next.js app Deployment with probes, resources, env
- `k8s/app-service.yaml` — ClusterIP Service for the app
- `k8s/scraper-cronjob.yaml` — CronJob for the daily scraper
- `k8s/managed-certificate.yaml` — Google-managed SSL certificate
- `k8s/ingress.yaml` — GCE Ingress routing external traffic to the app

**Modified files:**
- `app/Dockerfile` — change from dev mode to production build+serve

---

## Task 1: GCP Project Setup & CLI Authentication

This task is done entirely in the terminal. No code files are created.

- [ ] **Step 1: Create a GCP project**

Go to https://console.cloud.google.com and create a new project. Name it something like `dheli` or `dheli-gke`. Note the **Project ID** (e.g. `dheli-123456`) — you'll use it everywhere.

If you're on the free trial, the $300 credit is applied automatically.

- [ ] **Step 2: Install the gcloud CLI**

If not already installed:

```bash
# macOS (Homebrew)
brew install --cask google-cloud-sdk
```

Verify:

```bash
gcloud version
```

Expected: version info printed (e.g. `Google Cloud SDK 480.0.0`).

- [ ] **Step 3: Authenticate and set the project**

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

This opens a browser for OAuth login. After login, verify:

```bash
gcloud config get-value project
```

Expected: prints your project ID.

- [ ] **Step 4: Enable required APIs**

```bash
gcloud services enable \
  container.googleapis.com \
  artifactregistry.googleapis.com \
  dns.googleapis.com \
  compute.googleapis.com
```

Expected: each API listed as `Operation finished successfully`.

- [ ] **Step 5: Install kubectl via gcloud**

```bash
gcloud components install kubectl
```

Verify:

```bash
kubectl version --client
```

Expected: client version info printed.

- [ ] **Step 6: Configure Docker to authenticate with Artifact Registry**

```bash
gcloud auth configure-docker us-west2-docker.pkg.dev
```

Expected: `Adding credentials for: us-west2-docker.pkg.dev` — this updates your `~/.docker/config.json` so `docker push` works.

- [ ] **Step 7: Commit (nothing to commit — this was all CLI setup)**

No commit needed. Move on to Task 2.

---

## Task 2: Create Artifact Registry Repository

- [ ] **Step 1: Create the Docker repository**

```bash
gcloud artifacts repositories create dheli \
  --repository-format=docker \
  --location=us-west2 \
  --description="DHeli Docker images"
```

Expected: `Created repository [dheli].`

- [ ] **Step 2: Verify the repository exists**

```bash
gcloud artifacts repositories list --location=us-west2
```

Expected: table showing `dheli` repository with format `DOCKER`.

---

## Task 3: Update App Dockerfile for Production

**Files:**
- Modify: `app/Dockerfile`

- [ ] **Step 1: Update the Dockerfile**

Replace the entire contents of `app/Dockerfile` with:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
```

The key changes from the original:
- Added `RUN npm run build` to create the Next.js production build
- Changed `CMD` from `npm run dev` to `npm run start`
- Removed the conditional `npm install` fallback — `npm ci` is correct for production (requires lockfile)

- [ ] **Step 2: Test the production build locally**

```bash
cd app
docker build -t dheli-app:test .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='your_database_url' \
  -e SESSION_SECRET='test' \
  -e ADMIN_SECRET='test' \
  -e GEMINI_API_KEY='test' \
  -e NEXT_PUBLIC_SUPABASE_URL='your_supabase_url' \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY='your_anon_key' \
  dheli-app:test
```

Expected: Next.js starts in production mode on port 3000. You should see `Ready in Xs` in the logs. Hit `http://localhost:3000` to verify the page loads. Press Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add app/Dockerfile
git commit -m "feat: update app Dockerfile for production build

Change from npm run dev to npm run build + npm start for GKE deployment."
```

---

## Task 4: Build and Push Docker Images

- [ ] **Step 1: Build the app image tagged with git SHA**

From the project root:

```bash
docker build -t us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD) ./app
```

Expected: build completes successfully, final line shows the image tag.

- [ ] **Step 2: Build the scraper image tagged with git SHA**

```bash
docker build -t us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-scraper:$(git rev-parse --short HEAD) ./scraper
```

Expected: build completes successfully. The Playwright/Chromium install step takes a while on first build.

- [ ] **Step 3: Push the app image**

```bash
docker push us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD)
```

Expected: layers are pushed, digest is printed at the end.

- [ ] **Step 4: Push the scraper image**

```bash
docker push us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-scraper:$(git rev-parse --short HEAD)
```

Expected: layers are pushed, digest is printed at the end.

- [ ] **Step 5: Verify images are in Artifact Registry**

```bash
gcloud artifacts docker images list us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli
```

Expected: two images listed — `dheli-app` and `dheli-scraper` with their SHA tags.

---

## Task 5: Create the GKE Cluster

- [ ] **Step 1: Create the cluster**

```bash
gcloud container clusters create dheli-cluster \
  --zone=us-west2-a \
  --release-channel=regular \
  --num-nodes=1 \
  --min-nodes=1 \
  --max-nodes=3 \
  --enable-autoscaling \
  --machine-type=e2-medium
```

This takes 3-5 minutes. Expected: output showing cluster details including `STATUS: RUNNING`.

- [ ] **Step 2: Get cluster credentials for kubectl**

```bash
gcloud container clusters get-credentials dheli-cluster --zone=us-west2-a
```

Expected: `Fetching cluster endpoint and auth data. kubeconfig entry generated for dheli-cluster.`

- [ ] **Step 3: Verify kubectl is connected**

```bash
kubectl get nodes
```

Expected: 1 node listed with `STATUS: Ready`.

---

## Task 6: Write the Namespace Manifest

**Files:**
- Create: `k8s/namespace.yaml`

- [ ] **Step 1: Create the k8s directory and namespace manifest**

Create `k8s/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: dheli
```

- [ ] **Step 2: Apply and verify**

```bash
kubectl apply -f k8s/namespace.yaml
kubectl get namespaces
```

Expected: `namespace/dheli created`. The `dheli` namespace appears in the list with `STATUS: Active`.

- [ ] **Step 3: Commit**

```bash
git add k8s/namespace.yaml
git commit -m "feat: add Kubernetes namespace manifest

Create dheli namespace to isolate workloads from default."
```

---

## Task 7: Create the Kubernetes Secret

This is done imperatively — no file is committed to git.

- [ ] **Step 1: Create the secret**

Replace the placeholder values with your actual credentials from your `.env` file:

```bash
kubectl create secret generic dheli-secrets -n dheli \
  --from-literal=DATABASE_URL='postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:5432/postgres' \
  --from-literal=SESSION_SECRET='your-session-secret' \
  --from-literal=ADMIN_SECRET='your-admin-secret' \
  --from-literal=GEMINI_API_KEY='your-gemini-key' \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL='https://xxx.supabase.co' \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY='your-anon-key'
```

Expected: `secret/dheli-secrets created`.

- [ ] **Step 2: Verify the secret exists (without exposing values)**

```bash
kubectl get secret dheli-secrets -n dheli
kubectl describe secret dheli-secrets -n dheli
```

Expected: secret listed. `describe` shows key names with byte sizes (not the actual values).

---

## Task 8: Write the App Deployment Manifest

**Files:**
- Create: `k8s/app-deployment.yaml`

- [ ] **Step 1: Create the Deployment manifest**

Create `k8s/app-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dheli-app
  namespace: dheli
  labels:
    app: dheli-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: dheli-app
  template:
    metadata:
      labels:
        app: dheli-app
    spec:
      containers:
        - name: dheli-app
          image: us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-app:YOUR_GIT_SHA
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: dheli-secrets
                  key: DATABASE_URL
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: dheli-secrets
                  key: SESSION_SECRET
            - name: ADMIN_SECRET
              valueFrom:
                secretKeyRef:
                  name: dheli-secrets
                  key: ADMIN_SECRET
            - name: GEMINI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: dheli-secrets
                  key: GEMINI_API_KEY
            - name: NEXT_PUBLIC_SUPABASE_URL
              valueFrom:
                secretKeyRef:
                  name: dheli-secrets
                  key: NEXT_PUBLIC_SUPABASE_URL
            - name: NEXT_PUBLIC_SUPABASE_ANON_KEY
              valueFrom:
                secretKeyRef:
                  name: dheli-secrets
                  key: NEXT_PUBLIC_SUPABASE_ANON_KEY
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /api/halls
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /api/halls
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
```

Replace `YOUR_PROJECT_ID` with your GCP project ID and `YOUR_GIT_SHA` with the output of `git rev-parse --short HEAD` (the same tag you pushed in Task 4).

- [ ] **Step 2: Apply and verify**

```bash
kubectl apply -f k8s/app-deployment.yaml
kubectl rollout status deployment/dheli-app -n dheli
```

Expected: `deployment "dheli-app" successfully rolled out`.

- [ ] **Step 3: Check pods are running**

```bash
kubectl get pods -n dheli
```

Expected: 2 pods with `STATUS: Running` and `READY: 1/1`.

- [ ] **Step 4: Check logs to verify the app started**

```bash
kubectl logs -l app=dheli-app -n dheli --tail=20
```

Expected: Next.js production startup logs — `Ready in Xs` from both replicas.

- [ ] **Step 5: Commit**

```bash
git add k8s/app-deployment.yaml
git commit -m "feat: add app Deployment manifest

2 replicas, health probes on /api/halls, env from dheli-secrets."
```

---

## Task 9: Write the App Service Manifest

**Files:**
- Create: `k8s/app-service.yaml`

- [ ] **Step 1: Create the Service manifest**

Create `k8s/app-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: dheli-app
  namespace: dheli
  labels:
    app: dheli-app
spec:
  type: ClusterIP
  selector:
    app: dheli-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
```

- [ ] **Step 2: Apply and verify**

```bash
kubectl apply -f k8s/app-service.yaml
kubectl get service dheli-app -n dheli
```

Expected: service listed with `TYPE: ClusterIP`, `PORT(S): 80/TCP`, and a `CLUSTER-IP` assigned.

- [ ] **Step 3: Test the service from inside the cluster**

```bash
kubectl run curl-test --rm -it --restart=Never --image=curlimages/curl -n dheli -- curl -s http://dheli-app.dheli.svc.cluster.local/api/halls
```

Expected: JSON response from the `/api/halls` endpoint (array of dining halls). The `curl-test` pod auto-deletes after the command.

- [ ] **Step 4: Commit**

```bash
git add k8s/app-service.yaml
git commit -m "feat: add app ClusterIP Service manifest

Routes port 80 to app pods on port 3000."
```

---

## Task 10: Write the Scraper CronJob Manifest

**Files:**
- Create: `k8s/scraper-cronjob.yaml`

- [ ] **Step 1: Create the CronJob manifest**

Create `k8s/scraper-cronjob.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dheli-scraper
  namespace: dheli
spec:
  schedule: "0 0 * * *"
  timeZone: "America/Los_Angeles"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        metadata:
          labels:
            app: dheli-scraper
        spec:
          containers:
            - name: dheli-scraper
              image: us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-scraper:YOUR_GIT_SHA
              command: ["python", "-u", "scrape.py"]
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: dheli-secrets
                      key: DATABASE_URL
                - name: ADMIN_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: dheli-secrets
                      key: ADMIN_SECRET
                - name: APP_INTERNAL_URL
                  value: "http://dheli-app.dheli.svc.cluster.local"
              resources:
                requests:
                  memory: "512Mi"
                  cpu: "500m"
                limits:
                  memory: "1Gi"
                  cpu: "1000m"
          restartPolicy: OnFailure
```

Replace `YOUR_PROJECT_ID` and `YOUR_GIT_SHA` with your values.

The schedule is `0 0 * * *` (midnight) in the `America/Los_Angeles` timezone — Kubernetes handles the UTC conversion natively via the `timeZone` field. The scraper gets higher resource limits than the app because Playwright + headless Chromium is memory-hungry.

- [ ] **Step 2: Apply the CronJob**

```bash
kubectl apply -f k8s/scraper-cronjob.yaml
kubectl get cronjob dheli-scraper -n dheli
```

Expected: CronJob listed with `SCHEDULE: 0 0 * * *` and `TIMEZONE: America/Los_Angeles`.

- [ ] **Step 3: Test with a manual job trigger**

```bash
kubectl create job dheli-scraper-test --from=cronjob/dheli-scraper -n dheli
```

Expected: `job.batch/dheli-scraper-test created`.

- [ ] **Step 4: Watch the job run**

```bash
kubectl get pods -n dheli -l app=dheli-scraper --watch
```

Wait for the pod to go from `Pending` -> `Running` -> `Completed`. Press Ctrl+C to stop watching.

Then check the logs:

```bash
kubectl logs job/dheli-scraper-test -n dheli
```

Expected: scraper output showing menu items being fetched and inserted.

- [ ] **Step 5: Clean up the test job**

```bash
kubectl delete job dheli-scraper-test -n dheli
```

- [ ] **Step 6: Commit**

```bash
git add k8s/scraper-cronjob.yaml
git commit -m "feat: add scraper CronJob manifest

Runs scrape.py daily at midnight LA time, connects to app via cluster DNS."
```

---

## Task 11: Reserve a Static IP and Set Up Cloud DNS

- [ ] **Step 1: Reserve a global static IP**

```bash
gcloud compute addresses create dheli-ip --global
```

Expected: `Created [https://www.googleapis.com/compute/v1/projects/.../global/addresses/dheli-ip].`

- [ ] **Step 2: Get the IP address**

```bash
gcloud compute addresses describe dheli-ip --global --format='get(address)'
```

Expected: an IP address like `34.120.xxx.xxx`. Note this down — you'll need it for DNS.

- [ ] **Step 3: Create a Cloud DNS zone**

Replace `your-domain.com` with your actual domain:

```bash
gcloud dns managed-zones create dheli-zone \
  --dns-name="your-domain.com." \
  --description="DHeli DNS zone"
```

Note the trailing dot after the domain — this is required for DNS zone names.

Expected: `Created [https://dns.googleapis.com/dns/v1/projects/.../managedZones/dheli-zone].`

- [ ] **Step 4: Get the nameservers**

```bash
gcloud dns managed-zones describe dheli-zone --format='get(nameServers)'
```

Expected: 4 nameservers like:
```
ns-cloud-a1.googledomains.com.
ns-cloud-a2.googledomains.com.
ns-cloud-a3.googledomains.com.
ns-cloud-a4.googledomains.com.
```

- [ ] **Step 5: Update nameservers in GoDaddy**

1. Log in to GoDaddy
2. Go to **My Domains** > click your domain
3. Scroll to **Nameservers** section
4. Click **Change Nameservers** > select **Enter my own nameservers (advanced)**
5. Enter all 4 Google nameservers (without the trailing dot)
6. Save

DNS propagation takes 15-60 minutes.

- [ ] **Step 6: Add an A record pointing to the static IP**

Replace `your-domain.com` and `YOUR_STATIC_IP`:

```bash
gcloud dns record-sets create your-domain.com. \
  --zone=dheli-zone \
  --type=A \
  --ttl=300 \
  --rrdatas=YOUR_STATIC_IP
```

Expected: `Created [https://dns.googleapis.com/dns/v1/projects/.../changes/...].`

- [ ] **Step 7: Add a www CNAME**

```bash
gcloud dns record-sets create www.your-domain.com. \
  --zone=dheli-zone \
  --type=CNAME \
  --ttl=300 \
  --rrdatas=your-domain.com.
```

Expected: CNAME record created.

- [ ] **Step 8: Verify DNS (after propagation)**

```bash
dig your-domain.com +short
```

Expected: your static IP address. If it returns nothing, wait a few more minutes for propagation.

---

## Task 12: Write the ManagedCertificate Manifest

**Files:**
- Create: `k8s/managed-certificate.yaml`

- [ ] **Step 1: Create the ManagedCertificate manifest**

Create `k8s/managed-certificate.yaml` (replace `your-domain.com` with your actual domain):

```yaml
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: dheli-certificate
  namespace: dheli
spec:
  domains:
    - your-domain.com
    - www.your-domain.com
```

- [ ] **Step 2: Apply**

```bash
kubectl apply -f k8s/managed-certificate.yaml
```

Expected: `managedcertificate.networking.gke.io/dheli-certificate created`.

The certificate won't be provisioned until the Ingress is created and DNS is working. That's expected.

- [ ] **Step 3: Commit**

```bash
git add k8s/managed-certificate.yaml
git commit -m "feat: add ManagedCertificate for TLS

Google-managed cert for domain and www subdomain."
```

---

## Task 13: Write the Ingress Manifest

**Files:**
- Create: `k8s/ingress.yaml`

- [ ] **Step 1: Create the Ingress manifest**

Create `k8s/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dheli-ingress
  namespace: dheli
  annotations:
    kubernetes.io/ingress.global-static-ip-name: "dheli-ip"
    networking.gke.io/managed-certificates: "dheli-certificate"
    kubernetes.io/ingress.class: "gce"
spec:
  defaultBackend:
    service:
      name: dheli-app
      port:
        number: 80
```

This uses `defaultBackend` (not `rules`) because all traffic goes to the one app service. The annotations wire up the static IP and managed TLS certificate.

- [ ] **Step 2: Apply**

```bash
kubectl apply -f k8s/ingress.yaml
```

Expected: `ingress.networking.k8s.io/dheli-ingress created`.

- [ ] **Step 3: Verify the Ingress gets the static IP**

```bash
kubectl get ingress dheli-ingress -n dheli
```

Expected: `ADDRESS` column shows your reserved static IP. This may take 2-5 minutes to appear.

- [ ] **Step 4: Test HTTP access**

```bash
curl -s http://YOUR_STATIC_IP/api/halls
```

Expected: JSON response from the halls API. If you get a 502, wait a few minutes — the GCE load balancer health checks take time to pass.

- [ ] **Step 5: Check certificate provisioning status**

```bash
kubectl describe managedcertificate dheli-certificate -n dheli
```

Expected: `Status: Provisioning` initially. It moves to `Active` after DNS is fully propagated and GCP validates domain ownership (can take 15-60 minutes).

- [ ] **Step 6: Test HTTPS access (after certificate is Active)**

```bash
curl -s https://your-domain.com/api/halls
```

Expected: JSON response over HTTPS.

- [ ] **Step 7: Commit**

```bash
git add k8s/ingress.yaml
git commit -m "feat: add GCE Ingress with static IP and managed TLS

Routes all external traffic to dheli-app service."
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Verify all resources are healthy**

```bash
kubectl get all -n dheli
```

Expected output should show:
- 2 `dheli-app` pods in `Running` state
- `dheli-app` Service with ClusterIP
- `dheli-app` Deployment with `2/2` ready
- `dheli-scraper` CronJob

- [ ] **Step 2: Test the full app in the browser**

Open `https://your-domain.com` in a browser. Verify:
- The page loads (Next.js SSR works)
- Dining halls are listed
- Ratings work (click a star rating on a menu item)
- The padlock icon shows in the browser (TLS is working)

- [ ] **Step 3: Test the scraper manually**

```bash
kubectl create job dheli-scraper-verify --from=cronjob/dheli-scraper -n dheli
kubectl logs -f job/dheli-scraper-verify -n dheli
```

Expected: scraper runs, inserts menu items, triggers recipe generation, then the pod exits with `Completed` status.

Clean up:

```bash
kubectl delete job dheli-scraper-verify -n dheli
```

- [ ] **Step 4: Test a deployment rollout**

Make a minor change (e.g., edit a comment in any file), then:

```bash
docker build -t us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD) ./app
docker push us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD)
kubectl set image deployment/dheli-app dheli-app=us-west2-docker.pkg.dev/YOUR_PROJECT_ID/dheli/dheli-app:$(git rev-parse --short HEAD) -n dheli
kubectl rollout status deployment/dheli-app -n dheli
```

Expected: rolling update completes with zero downtime. `deployment "dheli-app" successfully rolled out`.

- [ ] **Step 5: Test rollback**

```bash
kubectl rollout undo deployment/dheli-app -n dheli
kubectl rollout status deployment/dheli-app -n dheli
```

Expected: rolls back to the previous image. `deployment "dheli-app" successfully rolled out`.
