# Home Gym

Personal workout dashboard with cross-device sync.

## Production

- Public app: `https://gym.mangrove-hk.org`
- Sync API: `https://sync.mangrove-hk.org/api/state`
- Host: Lazycat NAS (`lazycat-NAS`)
- NAS app directory: `/lzcsys/data/home/timlihk/gym-sync`
- User service: `gym-sync.service`
- Shared Cloudflare Tunnel: `mangrove-nas` via detached `cloudflared`
- Backup timer: `gym-state-backup.timer`

The NAS service serves both the static dashboard and the sync API:

```text
gym.mangrove-hk.org  -> mangrove-nas -> http://127.0.0.1:4318/
sync.mangrove-hk.org -> mangrove-nas -> http://127.0.0.1:4318/api/state
```

## Files

- `index.html` - single-file dashboard
- `nas-sync/server.mjs` - local Node server for the static app and sync API
- `deploy/systemd-user/` - user-level systemd service/timer templates
- `scripts/deploy/backup-gym-state.sh` - NAS backup script for `state.json`
- `wrangler.toml` - historical/fallback Cloudflare Pages config
- `DEPLOY.md` - NAS deployment and operations runbook

## Health Checks

```bash
curl -fsS https://gym.mangrove-hk.org/health
curl -fsS https://sync.mangrove-hk.org/api/state -H 'Origin: https://gym.mangrove-hk.org'
ssh lazycat-NAS 'systemctl --user is-active gym-sync.service gym-state-backup.timer'
ssh lazycat-NAS 'pgrep -af "cloudflared tunnel --config"'
```
