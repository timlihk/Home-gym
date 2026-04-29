# Home Gym Deployment

The Home Gym dashboard is deployed on the Lazycat NAS and exposed through the shared Cloudflare Tunnel `mangrove-nas`.

## Topology

```text
https://gym.mangrove-hk.org
  -> Cloudflare DNS / Tunnel
  -> mangrove-nas tunnel on lazycat-NAS
  -> http://127.0.0.1:4318/
  -> ~/gym-sync/index.html

https://sync.mangrove-hk.org/api/state
  -> Cloudflare DNS / Tunnel
  -> mangrove-nas tunnel on lazycat-NAS
  -> http://127.0.0.1:4318/api/state
  -> ~/gym-sync/state.json
```

## Production Pieces

| Component | Value |
| --- | --- |
| Public app | `https://gym.mangrove-hk.org` |
| Sync API | `https://sync.mangrove-hk.org/api/state` |
| NAS SSH host | `lazycat-NAS` |
| NAS directory | `/lzcsys/data/home/timlihk/gym-sync` |
| App/sync service | user systemd `gym-sync.service` |
| Tunnel process | detached `cloudflared tunnel --config ... run` process |
| State file | `/lzcsys/data/home/timlihk/gym-sync/state.json` |
| Backup timer | user systemd `gym-state-backup.timer` |
| Backup directory | `/lzcsys/data/home/timlihk/backup/gym-sync` |

## Deploy To NAS

From this folder:

```bash
rsync -az index.html nas-sync/server.mjs nas-sync/gym-sync.service lazycat-NAS:/lzcsys/data/home/timlihk/gym-sync/
ssh lazycat-NAS 'cp ~/gym-sync/gym-sync.service ~/.config/systemd/user/gym-sync.service'
ssh lazycat-NAS 'systemctl --user daemon-reload'
ssh lazycat-NAS 'systemctl --user enable --now gym-sync.service'
ssh lazycat-NAS 'systemctl --user restart gym-sync.service'
```

Verify:

```bash
curl -fsS https://gym.mangrove-hk.org/health
curl -fsS https://gym.mangrove-hk.org/ | grep 'Bulk-Up Home Gym'
curl -fsS https://sync.mangrove-hk.org/api/state -H 'Origin: https://gym.mangrove-hk.org'
```

## Shared Cloudflare Tunnel

`gym.mangrove-hk.org` and `sync.mangrove-hk.org` are routed through the shared `mangrove-nas` tunnel. The tunnel ingress is maintained in the Selena repo:

```text
/Users/timli/Code/selena/deploy/cloudflared/mangrove-nas-config.yml
```

Expected ingress entries:

```yaml
- hostname: gym.mangrove-hk.org
  service: http://127.0.0.1:4318

- hostname: sync.mangrove-hk.org
  service: http://127.0.0.1:4318
```

Check tunnel status:

```bash
cloudflared tunnel info mangrove-nas
ssh lazycat-NAS 'pgrep -af "cloudflared tunnel --config"'
ssh lazycat-NAS 'tail -80 ~/logs/mangrove-nas-cloudflared.log'
```

The NAS user currently has `Linger=no`, so the shared tunnel is intentionally run as a detached process instead of relying on the optional user systemd tunnel service.

## Backups

The sync state is backed up daily with `gym-state-backup.timer`.

Install/update backup files:

```bash
scp scripts/deploy/backup-gym-state.sh lazycat-NAS:/lzcsys/data/home/timlihk/bin/backup-gym-state.sh
scp deploy/systemd-user/gym-state-backup.service deploy/systemd-user/gym-state-backup.timer lazycat-NAS:/lzcsys/data/home/timlihk/.config/systemd/user/
ssh lazycat-NAS 'chmod 700 ~/bin/backup-gym-state.sh'
ssh lazycat-NAS 'systemctl --user daemon-reload'
ssh lazycat-NAS 'systemctl --user enable --now gym-state-backup.timer'
```

Run and verify a backup:

```bash
ssh lazycat-NAS 'systemctl --user start gym-state-backup.service'
ssh lazycat-NAS 'ls -lh ~/backup/gym-sync'
ssh lazycat-NAS 'python3 -m json.tool ~/backup/gym-sync/state_latest.json >/dev/null'
```

Backups are timestamped:

```text
~/backup/gym-sync/state_YYYYMMDD_HHMMSS.json
~/backup/gym-sync/state_latest.json -> latest timestamped backup
```

Retention defaults to 45 days in `scripts/deploy/backup-gym-state.sh`.

## Restore State

```bash
ssh lazycat-NAS 'systemctl --user stop gym-sync.service'
ssh lazycat-NAS 'cp ~/backup/gym-sync/state_latest.json ~/gym-sync/state.json'
ssh lazycat-NAS 'python3 -m json.tool ~/gym-sync/state.json >/dev/null'
ssh lazycat-NAS 'systemctl --user start gym-sync.service'
```

## Historical Cloudflare Pages Path

`wrangler.toml` remains as a fallback for static-only deployment to Cloudflare Pages:

```bash
wrangler pages deploy . --project-name gym-dashboard --commit-dirty=true
```

The primary production route is now NAS + Cloudflare Tunnel so the static app and sync API are deployed together.
