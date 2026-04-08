/*
 * System Monitor Tray Indicator
 *
 * Author: Michael Knap
 * Description: Displays CPU, Memory and Swap usage on the top bar.
 * Version: 7.0
 *
 * License: MIT License
 */

'use strict';

import GLib    from 'gi://GLib';
import Gio     from 'gi://Gio';
import St      from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main      from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension }  from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const UPDATE_INTERVAL_SECONDS = 1;
const SETTINGS_KEY_DECIMAL_PLACES = 'decimal-places';
const SETTINGS_KEY_SHOW_CPU = 'show-cpu';
const SETTINGS_KEY_SHOW_MEMORY = 'show-memory';
const SETTINGS_KEY_SHOW_SWAP = 'show-swap';

const SystemMonitorIndicator = GObject.registerClass(
class SystemMonitorIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'System Monitor Indicator', false);

        this._settings = settings;
        this._settingsChangedId = 0;
        this._decimalPlaces = 2;
        this._showCpu = true;
        this._showMemory = true;
        this._showSwap = true;
        this._swapAvailable = false;
        this._decoder = new TextDecoder('utf-8');
        this._cancellable = new Gio.Cancellable();
        this._destroyed = false;
        this._updateInProgress = false;
        this._updatePending = false;

        this._box = new St.BoxLayout();

        this._cpuLabel = new St.Label({
            text: 'CPU: --%',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 12px;',
        });
        this._box.add_child(this._cpuLabel);

        this._memLabel = new St.Label({
            text: 'Mem: --%',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 12px;',
        });
        this._box.add_child(this._memLabel);

        this._swapLabel = new St.Label({
            text: 'Swap: --%',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._swapLabel);

        this.add_child(this._box);

        // previous CPU totals for diff-based usage
        this._prevUsed  = 0;
        this._prevTotal = 0;
        this._timeoutId = 0;

        if (this._settings) {
            this._syncSettings(true);
            this._settingsChangedId = this._settings.connect('changed', () => {
                this._syncSettings();
            });
        } else {
            this._syncLabelVisibility();
        }

        void this._updateMetrics();
        this._scheduleUpdate();
    }

    _clampDecimalPlaces(value) {
        if (typeof value !== 'number' || Number.isNaN(value))
            return 2;
        return Math.max(0, Math.min(2, Math.trunc(value)));
    }

    _formatPercent(value) {
        // value is expected to be a number (percentage) in [0, 100].
        return value.toFixed(this._decimalPlaces);
    }

    _resetCpuBaseline() {
        this._prevUsed = 0;
        this._prevTotal = 0;
    }

    _syncSettings(initial = false) {
        const previousShowCpu = this._showCpu;

        this._decimalPlaces = this._clampDecimalPlaces(
            this._settings.get_int(SETTINGS_KEY_DECIMAL_PLACES)
        );
        this._showCpu = this._settings.get_boolean(SETTINGS_KEY_SHOW_CPU);
        this._showMemory = this._settings.get_boolean(SETTINGS_KEY_SHOW_MEMORY);
        this._showSwap = this._settings.get_boolean(SETTINGS_KEY_SHOW_SWAP);

        if (!this._showCpu || this._showCpu !== previousShowCpu) {
            this._resetCpuBaseline();
            this._cpuLabel.text = 'CPU: --%';
        }

        if (!this._showMemory)
            this._memLabel.text = 'Mem: --%';

        if (!this._showSwap) {
            this._swapAvailable = false;
            this._swapLabel.text = 'Swap: --%';
        }

        this._syncLabelVisibility();

        if (!initial)
            void this._updateMetrics();
    }

    _syncLabelVisibility() {
        if (this._showCpu)
            this._cpuLabel.show();
        else
            this._cpuLabel.hide();

        if (this._showMemory)
            this._memLabel.show();
        else
            this._memLabel.hide();

        if (this._showSwap && this._swapAvailable)
            this._swapLabel.show();
        else
            this._swapLabel.hide();
    }

    _scheduleUpdate() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT_IDLE,
            UPDATE_INTERVAL_SECONDS,
            () => {
                void this._updateMetrics();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    async _updateMetrics() {
        if (this._destroyed)
            return;

        if (this._updateInProgress) {
            this._updatePending = true;
            return;
        }

        this._updateInProgress = true;
        this._updatePending = false;

        try {
            const [cpuText, memoryText] = await Promise.all([
                this._showCpu
                    ? this._readTextFile('/proc/stat')
                    : Promise.resolve(null),
                this._showMemory || this._showSwap
                    ? this._readTextFile('/proc/meminfo')
                    : Promise.resolve(null),
            ]);

            if (this._destroyed)
                return;

            if (cpuText !== null && this._showCpu)
                this._updateCpuUsage(cpuText);

            if (memoryText !== null && (this._showMemory || this._showSwap))
                this._updateMemoryUsage(memoryText);
        } catch (e) {
            if (this._destroyed)
                return;

            if (typeof e.matches === 'function' &&
                e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                return;
            }

            logError(e, 'System Monitor Indicator: failed to update metrics');
        } finally {
            this._updateInProgress = false;

            if (this._updatePending && !this._destroyed)
                void this._updateMetrics();
        }
    }

    async _readTextFile(path) {
        const file = Gio.File.new_for_path(path);
        const [content] = await file.load_contents_async(this._cancellable);
        return this._decoder.decode(content);
    }

    _updateCpuUsage(text) {
        try {
            const lines = text.split('\n');

            let currentCpuUsed = 0;
            let currentCpuTotal = 0;

            for (const line of lines) {
                const fields = line.trim().split(/\s+/);
                if (fields[0] !== 'cpu')
                    continue;

                const nums = fields.slice(1).map(Number);
                if (!nums.length)
                    break;

                const idle   = nums[3];
                const iowait = nums[4] || 0;

                currentCpuTotal = nums.slice(0, 4).reduce((a, b) => a + b, 0) + iowait;
                currentCpuUsed  = currentCpuTotal - idle - iowait;

                // First run: just prime baseline
                if (this._prevTotal === 0) {
                    this._prevTotal = currentCpuTotal;
                    this._prevUsed  = currentCpuUsed;
                    this._cpuLabel.text = 'CPU: --%';
                    break;
                }

                const totalDiff = currentCpuTotal - this._prevTotal;
                const usedDiff  = currentCpuUsed  - this._prevUsed;

                if (totalDiff > 0) {
                    const usage = (usedDiff / totalDiff) * 100;
                    this._cpuLabel.text = `CPU: ${this._formatPercent(usage)}%`;
                }

                this._prevTotal = currentCpuTotal;
                this._prevUsed  = currentCpuUsed;
                break; // only first "cpu" line
            }
        } catch (e) {
            logError(e, 'System Monitor Indicator: failed to update CPU usage');
        }
    }

    _updateMemoryUsage(text) {
        try {
            const lines = text.split('\n');
            const needsMemory = this._showMemory;
            const needsSwap = this._showSwap;

            let memTotal    = null;
            let memAvail    = null;
            let swapTotal   = null;
            let swapFree    = null;

            for (const line of lines) {
                if (!line.includes(':'))
                    continue;

                let [key, value] = line.split(':');
                if (!value)
                    continue;

                value = parseInt(value.trim(), 10);
                if (Number.isNaN(value))
                    continue;

                switch (key) {
                    case 'MemTotal':
                        if (needsMemory)
                            memTotal = value;
                        break;
                    case 'MemAvailable':
                        if (needsMemory)
                            memAvail = value;
                        break;
                    case 'SwapTotal':
                        if (needsSwap)
                            swapTotal = value;
                        break;
                    case 'SwapFree':
                        if (needsSwap)
                            swapFree = value;
                        break;
                }

                if ((!needsMemory || (memTotal != null && memAvail != null)) &&
                    (!needsSwap || (swapTotal != null && swapFree != null))) {
                    break;
                }
            }

            if (needsMemory && memTotal != null && memAvail != null) {
                const memUsed  = memTotal - memAvail;
                const memUsage = (memUsed / memTotal) * 100;
                this._memLabel.text = `Mem: ${this._formatPercent(memUsage)}%`;
            } else if (needsMemory) {
                this._memLabel.text = 'Mem: --%';
            }

            if (needsSwap && swapTotal != null && swapTotal > 0 && swapFree != null) {
                const swapUsed  = swapTotal - swapFree;
                const swapUsage = (swapUsed / swapTotal) * 100;
                this._swapAvailable = true;
                this._swapLabel.text = `Swap: ${this._formatPercent(swapUsage)}%`;
            } else if (needsSwap) {
                this._swapAvailable = false;
                this._swapLabel.text = 'Swap: --%';
            }

            this._syncLabelVisibility();
        } catch (e) {
            logError(e, 'System Monitor Indicator: failed to update memory usage');
        }
    }

    destroy() {
        this._destroyed = true;

        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }

        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        this._settings = null;

        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        super.destroy();
    }
});

export default class SystemMonitorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new SystemMonitorIndicator(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
    }
}
