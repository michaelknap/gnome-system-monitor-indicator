[![Available on GNOME Extensions](https://img.shields.io/badge/Available%20on-GNOME%20Extensions-green)](https://extensions.gnome.org/extension/6586/system-monitor-tray-indicator/)

# ![Icon](./screenshots/icon-sm.png) Minimalist System Monitor for GNOME Shell

## Overview
This is a minimalist system monitor extension for GNOME Shell. It displays CPU, Memory, and Swap usage right in your GNOME Shell top bar. 

![Screenshot](./screenshots/screenshot.png)

## Compatibility

Known supported versions of GNOME:
- 45

It may be compatible with older versions, but no tests have been conducted to confirm this.

## Installation

Install via [Gnome Extensions](https://extensions.gnome.org/extension/6586/system-monitor-tray-indicator/) page (recommended). 

Or by downloading this repository. 

```bash
cd /tmp
git clone https://github.com/michaelknap/gnome-system-monitor-indicator.git
cd gnome-system-monitor-indicator
chmod +x install.sh
./install.sh
```
Once done, manually restart the GNOME Shell for the changes to take effect. On **X** you can do this by pressing 
`Alt+F2`, typing `r`, and pressing `Enter`. On **Wayland**, simply log out and back in.

The `install.sh` script copies the extension files to your local GNOME extensions directory. Once GNOME restarts, you can manage extension via Extensions app.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.