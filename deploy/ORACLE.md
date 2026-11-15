# Everything on one Oracle Cloud Always Free VM

Browser -> Caddy (HTTPS) -> web (Next.js) / api (FastAPI) -> Supabase. Same VM runs the Telegram bot, the 30-day FIRMS
worker and the history queue. No domain needed: `sslip.io` turns the VM's IP into a hostname and Caddy gets a free certificate.

## 1. Create the VM (you: account, card verification and console clicks)
1. https://www.oracle.com/cloud/free/ -> sign up (card is only for verification). Pick a home region and keep it.
2. Compute -> Instances -> Create instance:
   - Image: **Ubuntu 22.04**; Shape: **VM.Standard.A1.Flex (Ampere) with 2 OCPU / 12 GB** (Always Free allows up to 4 / 24).
     If A1 is "out of capacity", retry later or another availability domain. The 1 GB AMD micro is too small to build the site.
   - Add your SSH public key (or download the generated key). Note the **public IP**.
3. Open ports: Networking -> VCN -> Security List -> add ingress rules for TCP **80** and **443** (source 0.0.0.0/0).
4. On the VM also open the local firewall (Ubuntu image from Oracle blocks them):
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 2. Install Docker on the VM
```bash
ssh -i <key> ubuntu@<IP>
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu && exit   # log in again afterwards
```

## 3. Copy the project and the small data files the API reads
From your PC (repo root; replace <IP>):
```bash
tar --exclude=.git --exclude=.venv --exclude=node_modules --exclude=web/.next --exclude='data/*' -czf app.tgz .
scp -i <key> app.tgz ubuntu@<IP>:~
ssh -i <key> ubuntu@<IP> "mkdir -p firetrack && tar -xzf app.tgz -C firetrack && mkdir -p firetrack/data/processed/matopiba"
scp -i <key> data/processed/matopiba/ml_metrics.json data/processed/matopiba/run_meta.json ubuntu@<IP>:~/firetrack/data/processed/matopiba/
```

## 4. Configure and start (on the VM, in ~/firetrack)
Create `.env` with NEW keys (rotate the ones pasted in chat):
```
DB_BACKEND=supabase
DATABASE_URL=...            FIRMS_MAP_KEY=...
ANTHROPIC_API_KEY=...       ANTHROPIC_MODEL=claude-opus-5-5
TELEGRAM_BOT_TOKEN=...
API_HOST=api.<IP>.sslip.io  WEB_HOST=app.<IP>.sslip.io
NEXT_PUBLIC_CARTO_KEY=      # optional
```
```bash
docker compose -f deploy/oracle/docker-compose.yml --env-file .env up -d --build
docker compose -f deploy/oracle/docker-compose.yml logs -f bot     # "bot ... online"
curl https://api.<IP>.sslip.io/health
```
Site: `https://app.<IP>.sslip.io`. **Stop the bot on your PC first** (one bot per token).
Memory tip if the build is killed: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.

## 5. History queue
`history` starts with the stack, downloads the public country archives (no FIRMS quota) and writes straight to Supabase;
regions appear in the app as they finish. Check: `docker compose -f deploy/oracle/docker-compose.yml logs --tail 20 history`.
Regions already loaded are quick to redo. Stop your local queue to avoid two writers.

## Notes
- Updates: copy the new files, then `up -d --build` again.
- Because `./data` is shared, `/world` and `/live` read the worker's local 30-day store (no FIRMS quota fight).
- Oracle may reclaim idle Always Free instances: keep the services busy (they are) and check the console now and then.
