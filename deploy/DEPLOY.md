# Expense Manager → Hostinger VPS deployment

Same VPS as `secretary` and `text2sql_v18` (see
`../../text2sql_v18/deploy/HOSTINGER_VPS_MIGRATION.md` for the full history
of this box). This app runs as a plain systemd service (like `secretary`,
not Dockerized like `text2sql`) — SQLite needs no separate DB container.

- VPS: `187.77.154.93`, SSH port `51322`, user `root`, key auth already set up.
- Domain: `exp.kaoinai.com` (subdomain of `kaoinai.com`, same pattern as
  `app.kaoinai.com` and `sec.kaoinai.com`). Needs a DNS CNAME `exp` →
  `kaoinai.com` added wherever `kaoinai.com`'s DNS is managed.
- Port: app listens on `127.0.0.1:4200` — `8000` is text2sql, `4010` is
  secretary, so this stays clear of both.
- **Real accounts, unlike `secretary`**: this app requires login
  (email + password, bcrypt + server-side sessions). First admin account
  comes from `server/seed.ts` — change its password immediately after
  first login.
- Data: SQLite file (`prisma/prod.db`) + `uploads/` directory (receipt
  files) — both live on the VPS disk, outside git, and are the only
  stateful things this app has. Back them up together.

## First deploy

```bash
ssh -p 51322 root@187.77.154.93

# Deploy key for the private repo (same pattern as secretary — see its
# deploy/DEPLOY.md "Setting up the deploy key" section if this is a fresh box)
ssh-keygen -t ed25519 -f ~/.ssh/expense_deploy_key -N '' -C 'expense-deploy@vps'
cat ~/.ssh/expense_deploy_key.pub   # add as a read-only deploy key on the GitHub repo

cat >> ~/.ssh/config <<'EOF'

Host github.com-expense
    HostName github.com
    User git
    IdentityFile ~/.ssh/expense_deploy_key
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

mkdir -p /opt/expense
cd /opt/expense
git clone git@github.com-expense:ngtatkeong/expense-manager.git expense
cd expense
npm ci

cp deploy/.env.production.example .env
nano .env   # fill in a real SESSION_SECRET (openssl rand -hex 32), SEED_ADMIN_EMAIL/PASSWORD

npm run build
npx prisma migrate deploy
npx tsx server/seed.ts   # creates the first admin account + default categories

cp deploy/expense.service /etc/systemd/system/expense.service
systemctl daemon-reload
systemctl enable --now expense
curl -sf http://127.0.0.1:4200/api/health   # {"ok":true}

cp deploy/nginx.expense.conf /etc/nginx/sites-available/expense
ln -sf /etc/nginx/sites-available/expense /etc/nginx/sites-enabled/expense
nginx -t && systemctl reload nginx

# once DNS has propagated (dig +short exp.kaoinai.com @8.8.8.8 should show the VPS IP):
certbot --nginx -d exp.kaoinai.com --non-interactive --agree-tos --email tk.ng@kaoinai.com
```

## Redeploying after code changes

```bash
ssh -p 51322 root@187.77.154.93
cd /opt/expense/expense
bash deploy/deploy.sh
```

`deploy.sh` does `git pull`, `npm ci`, `npm run build`, applies any new
Prisma migrations, restarts the systemd service, then health-checks.

## Rollback

```bash
cd /opt/expense/expense
git log --oneline -5
git checkout <commit-sha>
bash deploy/deploy.sh --no-pull
```

If the rollback also needs to undo a database migration, that has to be
done by hand (`npx prisma migrate resolve` / a manual down-migration) —
Prisma Migrate doesn't auto-generate down-migrations. Check what changed
in `prisma/migrations/` for the commits you're rolling back before doing
this on production data.

## Backups

```bash
ssh -p 51322 root@187.77.154.93 \
  "tar czf - -C /opt/expense/expense prisma/prod.db uploads" \
  > expense-backup-$(date +%F).tar.gz
```

Consider a daily cron for this once real data is in the system.

## Checking it's healthy

```bash
ssh -p 51322 root@187.77.154.93 "systemctl status expense --no-pager; curl -sf http://127.0.0.1:4200/api/health"
curl -s https://exp.kaoinai.com/api/health
```
