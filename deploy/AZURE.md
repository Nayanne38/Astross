# Everything on Azure (NASA Space Apps $200 credit / 30 days)

```
 Browser -> Container App firetrack-web -> Container App firetrack-api -> Supabase (Postgres)
            Container Apps (no ingress, always on): firetrack-bot | firetrack-worker | firetrack-history
```
Azure Container Apps gives free HTTPS URLs and can run background processes without a port, so one service
covers the site, the API, the Telegram bot, the 30-day FIRMS worker and the history queue (nothing stays on your PC).
Images are built in the cloud with `az acr build`; local Docker is not needed.

## 0. One-time (you: account, card and credit stay with you)
Claim the offer, then install the Azure CLI (https://aka.ms/installazurecliwindows) and:
```bash
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.ContainerRegistry
```
Rotate the keys that were pasted in chat before using them below.

## 1. Environment and registry
```bash
RG=firetrack; LOC=eastus; ACR=firetrack$RANDOM       # ACR name must be globally unique
az group create -n $RG -l $LOC
az acr create -n $ACR -g $RG --sku Basic --admin-enabled true
az containerapp env create -n firetrack-env -g $RG -l $LOC
DOMAIN=$(az containerapp env show -n firetrack-env -g $RG --query properties.defaultDomain -o tsv)
API_URL=https://firetrack-api.$DOMAIN ; WEB_URL=https://firetrack-web.$DOMAIN
echo $API_URL $WEB_URL
```

## 2. Build images in the cloud (from the repo root)
```bash
az acr build -r $ACR -g $RG -t firetrack-api:1 .
az acr build -r $ACR -g $RG -t firetrack-web:1 --build-arg NEXT_PUBLIC_API_URL=$API_URL web
REG=$ACR.azurecr.io
USER=$(az acr credential show -n $ACR --query username -o tsv)
PASS=$(az acr credential show -n $ACR --query "passwords[0].value" -o tsv)
```

## 3. Deploy (replace <...> with the real values; they are stored as Container Apps secrets, never in git)
```bash
COMMON="-g $RG --environment firetrack-env --registry-server $REG --registry-username $USER --registry-password $PASS"
SECRETS="db=<DATABASE_URL> firms=<FIRMS_MAP_KEY> claude=<ANTHROPIC_API_KEY> tg=<TELEGRAM_BOT_TOKEN>"
ENVV="DB_BACKEND=supabase DATABASE_URL=secretref:db FIRMS_MAP_KEY=secretref:firms ANTHROPIC_API_KEY=secretref:claude"

# API (public)
az containerapp create -n firetrack-api $COMMON --image $REG/firetrack-api:1 --target-port 8080 --ingress external \
  --cpu 1 --memory 2Gi --min-replicas 1 --secrets $SECRETS --env-vars $ENVV API_CORS_ORIGINS=$WEB_URL
curl $API_URL/health

# Site (public)
az containerapp create -n firetrack-web $COMMON --image $REG/firetrack-web:1 --target-port 8080 --ingress external \
  --cpu 0.5 --memory 1Gi --min-replicas 1

# Telegram bot + 30-day worker + history queue (no ingress, always on). STOP the local bot first.
az containerapp create -n firetrack-bot $COMMON --image $REG/firetrack-api:1 --cpu 0.5 --memory 1Gi --min-replicas 1 \
  --secrets $SECRETS --env-vars $ENVV TELEGRAM_BOT_TOKEN=secretref:tg APP_PUBLIC_URL=$WEB_URL \
  --command python --args "-m" "alerts.bot"
az containerapp create -n firetrack-worker $COMMON --image $REG/firetrack-api:1 --cpu 0.5 --memory 1Gi --min-replicas 1 \
  --secrets $SECRETS --env-vars $ENVV --command python --args "-m" "etl.worker" "--loop"
az containerapp create -n firetrack-history $COMMON --image $REG/firetrack-api:1 --cpu 1 --memory 3Gi --min-replicas 1 \
  --secrets $SECRETS --env-vars $ENVV --command python --args "-m" "etl.pipelines.lite" "--all"
```
(The history queue skips regions already loaded: it reuses the per-year checkpoints only on the same disk, so on Azure it
starts those regions again from the free country archives; it takes a few minutes each. Stop the local queue to avoid
two writers: `Stop-Process` the `etl.pipelines.lite` process.)

## 4. Check and logs
```bash
az containerapp logs show -n firetrack-bot -g $RG --tail 20
az containerapp logs show -n firetrack-history -g $RG --tail 20
```

## Notes
- Cost: ~5 always-on small containers fit comfortably in $200 for a month; scale `firetrack-history` to 0 after it finishes:
  `az containerapp update -n firetrack-history -g $RG --min-replicas 0 --max-replicas 0`.
- The API cannot see the worker's disk, so `/world` and `/live` query NASA FIRMS directly (cached 10 min).
- Changing `NEXT_PUBLIC_API_URL` needs a rebuild of the web image.
