# Everything on ONE Google Cloud VM (uses the $300 credit)

Same stack as `deploy/oracle/docker-compose.yml` (Caddy HTTPS + web + API + Telegram bot + 30-day worker + history queue),
on a Compute Engine VM. No `gcloud` install and no SSH keys needed: everything is done in the browser console.

## 1. Account and project
1. Open https://console.cloud.google.com and claim the credit ("Get started for free"; the card is only for verification).
2. Top bar -> project picker -> **New project** -> name `firetrack` -> Create, and select it.

## 2. Reserve a fixed IP (so the sslip.io addresses never change)
Menu -> **VPC network -> IP addresses -> Reserve external static IP address**: name `firetrack-ip`, Region `us-central1`
(or `southamerica-east1` for São Paulo), Type Regional -> Reserve. Note the IP.

## 3. Create the VM
Menu -> **Compute Engine -> VM instances** (enable the API if asked) -> **Create instance**:
- Name `firetrack`; Region the same as the IP; Machine type **e2-medium** (2 vCPU, 4 GB).
- Boot disk -> Change: **Ubuntu 22.04 LTS**, **30 GB** balanced.
- Networking (Advanced) -> Network interfaces -> External IPv4 address: choose `firetrack-ip`.
- Firewall: tick **Allow HTTP traffic** and **Allow HTTPS traffic**.
- Create.

## 4. Upload the project
Click **SSH** next to the VM (browser terminal). In its top-right gear menu choose **Upload file** and send
`firetrack-app.tgz` (made on your PC: C:\Users\jvnsi\firetrack-app.tgz). Then:
```bash
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER
exit        # close the SSH window and click SSH again so the group applies
mkdir -p firetrack && tar -xzf firetrack-app.tgz -C firetrack && cd firetrack
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

## 5. Configure and start
```bash
cd ~/firetrack
nano .env      # paste the values below (NEW keys), save with Ctrl+O, Enter, Ctrl+X
```
```
DB_BACKEND=supabase
DATABASE_URL=...
FIRMS_MAP_KEY=...
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-opus-5-5
TELEGRAM_BOT_TOKEN=...
API_HOST=api.<IP>.sslip.io
WEB_HOST=app.<IP>.sslip.io
```
```bash
docker compose -f deploy/oracle/docker-compose.yml --env-file .env up -d --build
docker compose -f deploy/oracle/docker-compose.yml ps
curl https://api.<IP>.sslip.io/health
```
Site: `https://app.<IP>.sslip.io`. The first build takes several minutes.
**Stop the bot on your PC before the VM bot starts** (one bot per token) and stop the local history queue.

## 6. Day to day
- Logs: `docker compose -f deploy/oracle/docker-compose.yml logs --tail 30 bot` (also `api`, `worker`, `history`, `web`).
- Update: upload a new tgz, extract, run the `up -d --build` command again.
- Spend: e2-medium plus the disk is a few dollars a month, far below the credit. Stop the VM when not needed.
