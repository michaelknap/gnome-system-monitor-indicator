/*
 * System Monitor Tray Indicator
 *
 * Author: Michael Knap
 * Description: Displays CPU, Memory and Swap usage on the top bar.
 * Version: 5.0
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

const UPDATE_INTERVAL_SECONDS = 1;

const SystemMonitorIndicator = GObject.registerClass(
class SystemMonitorIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'System Monitor Indicator', false);

        this._settings = settings;
        this._settingsChangedId = 0;
        this._decimalPlaces = 2;

        if (this._settings) {
            this._decimalPlaces = this._clampDecimalPlaces(
                this._settings.get_int('decimal-places')
            );

            this._settingsChangedId = this._settings.connect(
                'changed::decimal-places',
                () => {
                    this._decimalPlaces = this._clampDecimalPlaces(
                        this._settings.get_int('decimal-places')
                    );

                    // Refresh immediately so the new formatting is applied.
                    this._updateMetrics();
                }
            );
        }

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

        this._scheduleUpdate(true);
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

    _scheduleUpdate(first = false) {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        if (!first)
            this._updateMetrics();

        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT_IDLE,
            UPDATE_INTERVAL_SECONDS,
            () => {
                this._updateMetrics();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _updateMetrics() {
        this._updateCpuUsage();
        this._updateMemoryUsage();
    }

    _updateCpuUsage() {
        try {
            const file = Gio.File.new_for_path('/proc/stat');
            const [, content] = file.load_contents(null);

            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(content);
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
                if (!this._prevTotal || !this._prevUsed) {
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

    _updateMemoryUsage() {
        try {
            const file = Gio.File.new_for_path('/proc/meminfo');
            const [, content] = file.load_contents(null);

            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(content);
            const lines = text.split('\n');

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
                        memTotal = value;
                        break;
                    case 'MemAvailable':
                        memAvail = value;
                        break;
                    case 'SwapTotal':
                        swapTotal = value;
                        break;
                    case 'SwapFree':
                        swapFree = value;
                        break;
                }
            }

            if (memTotal != null && memAvail != null) {
                const memUsed  = memTotal - memAvail;
                const memUsage = (memUsed / memTotal) * 100;
                this._memLabel.text = `Mem: ${this._formatPercent(memUsage)}%`;
            } else {
                this._memLabel.text = 'Mem: --%';
            }

            if (swapTotal != null && swapTotal > 0 && swapFree != null) {
                const swapUsed  = swapTotal - swapFree;
                const swapUsage = (swapUsed / swapTotal) * 100;
                this._swapLabel.text = `Swap: ${this._formatPercent(swapUsage)}%`;
                this._swapLabel.show();
            } else {
                this._swapLabel.text = 'Swap: --%';
                this._swapLabel.hide();
            }
        } catch (e) {
            logError(e, 'System Monitor Indicator: failed to update memory usage');
        }
    }

    destroy() {
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