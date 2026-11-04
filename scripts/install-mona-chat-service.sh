#!/usr/bin/env bash
# Installs the Ask Mona chat daemon (scripts/wolff-chat-daemon.mjs) as a
# systemd user service on this PC, so Mona answers without a terminal open.
# It starts on boot (needs `loginctl enable-linger`) and restarts on crashes.
#
#   bash scripts/install-mona-chat-service.sh            install + start
#   systemctl --user disable --now mona-chat             stop + remove from boot
#   journalctl --user -u mona-chat -f                    follow its log
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$(command -v node)"
CODEX_DIR="$(dirname "$(command -v codex)")"
UNIT="$HOME/.config/systemd/user/mona-chat.service"

mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<EOF
[Unit]
Description=Mona finance chat daemon (answers Ask Mona via Codex)
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=$REPO
Environment=PATH=$CODEX_DIR:$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE scripts/wolff-chat-daemon.mjs
Restart=always
RestartSec=10
[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now mona-chat.service
sleep 5
systemctl --user status mona-chat.service --no-pager -n 5
