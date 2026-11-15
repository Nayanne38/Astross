# Everything on Google Cloud (NASA Space Apps $300 credit)

```
 Browser ──> Cloud Run: firetrack-web (Next.js) ──> Cloud Run: firetrack-api (FastAPI) ──> Supabase (Postgres)
                                                          ^
 Compute Engine VM "firetrack-workers": Telegram bot + 30-day FIRMS worker ──┘ (writes/reads the same DB, calls NASA FIRMS)
```
Cloud Run gives free HTTPS URLs; the VM exists only because the bot and the worker must run 24/7 without an HTTP port.

## 1. One-time setup (you, in the browser/terminal — billing and card stay with you)
1. Claim the offer, create a project and attach the billing account with the credit: https://console.cloud.google.com
2. Install the CLI (https://cloud.google.com/sdk/docs/install), then:
   ```bash
   gcloud auth login
   gcloud config set project <PROJECT_ID>
   gcloud config set run/region us-central1
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
     secretmanager.googleapis.com compute.googleapis.com
   ```
3. Secrets (values are never committed; rotate the ones that were pasted in chat first):
   ```bash
   printf '%s' '<value>' | gcloud secrets create DATABASE_URL --data-file=-
   printf '%s' '<value>' | gcloud secrets create FIRMS_MAP_KEY --data-file=-
   printf '%s' '<value>' | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
   # allow Cloud Run to read them:
   PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
   for s in DATABASE_URL FIRMS_MAP_KEY ANTHROPIC_API_KEY; do
     gcloud secrets add-iam-policy-binding $s --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
       --role=roles/secretmanager.secretAccessor; done
   ```

## 2. API (from the repo root)
```bash
gcloud run deploy firetrack-api --source . --allow-unauthenticated --memory 2Gi --cpu 2 --timeout 300 \
  --set-env-vars DB_BACKEND=supabase,API_CORS_ORIGINS='*' \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,FIRMS_MAP_KEY=FIRMS_MAP_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest
API_URL=$(gcloud run services describe firetrack-api --format='value(status.url)'); echo $API_URL
curl $API_URL/health
```

## 3. Web (Next.js inlines the API address at build time)
```bash
IMAGE=gcr.io/$(gcloud config get-value project)/firetrack-web
gcloud builds submit web --config web/cloudbuild.yaml \
  --substitutions _IMAGE=$IMAGE,_API_URL=$API_URL,_CARTO_KEY=<optional public CARTO key>
gcloud run deploy firetrack-web --image $IMAGE --allow-unauthenticated --memory 1Gi
WEB_URL=$(gcloud run services describe firetrack-web --format='value(status.url)'); echo $WEB_URL
```
Then lock CORS to the site: `gcloud run services update firetrack-api --update-env-vars API_CORS_ORIGINS=$WEB_URL`

## 4. Bot + worker on a VM
```bash
gcloud compute instances create firetrack-workers --zone us-central1-a --machine-type e2-small \
  --image-family cos-stable --image-project cos-cloud
```
Copy the project and a server `.env` to the VM, then start both services (the VM image has Docker):
```bash
gcloud compute scp --recurse . firetrack-workers:~/app --zone us-central1-a
gcloud compute ssh firetrack-workers --zone us-central1-a \
  --command "cd app && docker compose -f deploy/docker-compose.vm.yml up -d --build"
```
`.env` for the VM: `DB_BACKEND`, `DATABASE_URL`, `FIRMS_MAP_KEY`, `TELEGRAM_BOT_TOKEN`, `APP_PUBLIC_URL=$WEB_URL`.
**Stop the local bot first** (Telegram allows one bot instance per token).

## 5. History series
`python -m etl.pipelines.lite --all` (running locally) writes straight into Supabase; each region shows up in the deployed
app as soon as it finishes. No redeploy needed.

## Notes
- The API on Cloud Run cannot see the worker's disk, so `/world` and `/live` query NASA FIRMS directly (cached 10 min).
- Cloud Run scales to zero: the first request after idle takes a few seconds.
- Expected spend is small (Cloud Run only bills while handling requests; the e2-small VM is a few dollars a month), well inside the $300 credit.
