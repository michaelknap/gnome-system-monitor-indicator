#!/bin/bash
EXTENSION_PATH="$HOME/.local/share/gnome-shell/extensions/system-monitor-indicator@mknap.com"

mkdir -p $EXTENSION_PATH
cp -r ./src/* $EXTENSION_PATH

# Compile GSettings schemas (required for preferences to work)
if [ -d "$EXTENSION_PATH/schemas" ]; then
  glib-compile-schemas "$EXTENSION_PATH/schemas"
fi

# Restart GNOME Shell
echo "Restart the gnome-shell and enable extension in gnome-extensions."
