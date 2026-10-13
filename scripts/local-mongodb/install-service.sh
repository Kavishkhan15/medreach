#!/usr/bin/env bash
# Installs only the local MongoDB service override. Never seeds or migrates data.
set -euo pipefail
root=/home/anonymous/medreach
backup=/home/anonymous/.local/share/medreach-recovery/20261011T185227
override=/etc/systemd/system/mongod.service.d/medreach-local.conf
if [[ $EUID -ne 0 ]]; then
  echo "Run this script with sudo in your own terminal. Do not share your password."
  exit 1
fi
[[ -f "$root/data/WiredTiger.wt" && -f "$backup/logical-backup-verification.json" && -f "$backup/canonical-verification.json" ]] || {
  echo "Verified canonical dataset and backups are required; stopping."
  exit 1
}
[[ ! -e "$override" && ! -L "$override" ]] || {
  echo "A local override already exists; inspect it before changing anything."
  exit 1
}
mapfile -t mongo_pids < <(pgrep -x mongod || true)
[[ ${#mongo_pids[@]} -le 1 ]] || {
  echo "Multiple MongoDB processes exist; stopping without changes."
  exit 1
}
if [[ ${#mongo_pids[@]} -eq 1 ]]; then
  args=$(tr '\0' ' ' < "/proc/${mongo_pids[0]}/cmdline")
  [[ "$args" == *"--config $root/scripts/local-mongodb/mongod.conf"* ]] || {
    echo "Running MongoDB does not use the canonical configuration; stopping."
    exit 1
  }
fi
mkdir -m 700 "$backup/system-service-before"
cp -p /etc/mongod.conf "$backup/system-service-before/mongod.conf"
systemctl cat mongod > "$backup/system-service-before/mongod.service.txt"
systemctl is-enabled mongod > "$backup/system-service-before/enabled-state.txt" || true
systemctl stop mongod
if [[ ${#mongo_pids[@]} -eq 1 ]] && kill -0 "${mongo_pids[0]}" 2>/dev/null; then
  kill -TERM "${mongo_pids[0]}"
  for ((i=0; i<100; i++)); do
    kill -0 "${mongo_pids[0]}" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "${mongo_pids[0]}" 2>/dev/null; then
    echo "Canonical MongoDB did not stop cleanly; no override installed."
    exit 1
  fi
fi
install -d -m 755 /etc/systemd/system/mongod.service.d
install -m 644 "$root/scripts/local-mongodb/medreach-local.conf" "$override"
systemctl daemon-reload
systemctl enable mongod
systemctl start mongod
systemctl is-active --quiet mongod
echo "MongoDB system service is active using /home/anonymous/medreach/data."
echo "Original /etc/mongod.conf and all source datasets were retained."
