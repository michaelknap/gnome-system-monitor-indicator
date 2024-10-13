/*
 * System Monitor Tray Indicator
 * 
 * Author: Michael Knap
 * Description: Displays CPU and Memory usage on the top bar.
 * Version: 3.0
 * GNOME Shell Version: 45, 46, 47 (Tested) 
 * 
 * License: MIT License
 */

'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {
    Button
} from 'resource:///org/gnome/shell/ui/panelMenu.js';
import GObject from 'gi://GObject';
import {
    panel
} from 'resource:///org/gnome/shell/ui/main.js';


// Define the main class for the system monitor indicator
export class SystemMonitorIndicator extends Button {

    // Initialize the indicator
    _init() {
        super._init(0, 'System Monitor Indicator', false);

        // Create a layout box to contain labels
        this.box = new St.BoxLayout();

        // Initialize CPU usage label
        this.cpu_usage_label = new St.Label({
            text: 'CPU: 0%',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 12px;'
        });
        this.box.add_child(this.cpu_usage_label);

        // Initialize Memory usage label
        this.mem_usage_label = new St.Label({
            text: 'Mem: 0%',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 12px;'
        });
        this.box.add_child(this.mem_usage_label);

        // Initialize Swap usage label
        this.swap_usage_label = new St.Label({
            text: 'Swap: 0%',
            y_align: Clutter.ActorAlign.CENTER
        });
        this.box.add_child(this.swap_usage_label);

        // Add the layout box to this actor
        this.add_child(this.box);

        // Initialize previous CPU values
        this.prev_idle = 0;
        this.prev_total = 0;

        // Start updating metrics
        this._update_metrics();
    }

    // Function to update all metrics (CPU, Memory)
    _update_metrics() {
        const priority = GLib.PRIORITY_DEFAULT_IDLE;
        const refresh_time = 1; // Time in seconds

        // Update individual metrics
        this._update_cpu_usage();
        this._update_memory_usage();

        // Remove existing timeout if any
        if (this._timeout) {
            GLib.source_remove(this._timeout);
        }

        // Set a timeout to refresh metrics
        this._timeout = GLib.timeout_add_seconds(priority, refresh_time, () => {
            this._update_metrics();
            return true;
        });
    }

    // Function to update CPU usage
    _update_cpu_usage() {
        try {
            const input_file = Gio.File.new_for_path('/proc/stat');
            const [, content] = input_file.load_contents(null);
            const text_decoder = new TextDecoder('utf-8');
            const content_str = text_decoder.decode(content);
            const content_lines = content_str.split('\n');

            let current_cpu_used = 0;
            let current_cpu_total = 0;
            let current_cpu_usage = 0;

            for (let i = 0; i < content_lines.length; i++) {
                const fields = content_lines[i].trim().split(/\s+/);

                if (fields[0] === 'cpu') {
                    const nums = fields.slice(1).map(Number);
                    const user = nums[0];
                    const nice = nums[1];
                    const system = nums[2];
                    const idle = nums[3];
                    const iowait = nums[4] || 0; // Include iowait, defaulting to 0 if not present

                    current_cpu_total = nums.slice(0, 4).reduce((a, b) => a + b, 0) +
                        iowait;
                    current_cpu_used = current_cpu_total - idle - iowait;

                    // Ensure previous values are set on the first run
                    this.prev_used = this.prev_used || current_cpu_used;
                    this.prev_total = this.prev_total || current_cpu_total;

                    // Calculate CPU usage as the difference from the previous measurement
                    const total_diff = current_cpu_total - this.prev_total;
                    const used_diff = current_cpu_used - this.prev_used;

                    if (total_diff > 0) { // Check to avoid division by zero
                        current_cpu_usage = (used_diff / total_diff) * 100;
                        this.cpu_usage_label.set_text(
                            `CPU: ${current_cpu_usage.toFixed(2)}%`);
                    }

                    // Store current values for the next calculation
                    this.prev_used = current_cpu_used;
                    this.prev_total = current_cpu_total;

                    break; // Break after processing the first 'cpu' line
                }
            }
        } catch (e) {
            logError(e, `Failed to update CPU usage.`);
        }
    }

    // Function to update Memory usage
    _update_memory_usage() {
        try {
            const meminfo_file = Gio.File.new_for_path('/proc/meminfo');
            const [, contents] = meminfo_file.load_contents(null);
            const text_decoder = new TextDecoder('utf-8');
            const content_string = text_decoder.decode(contents);
            const content_lines = content_string.split('\n');

            let mem_total = null;
            let mem_available = null;
            let mem_used = null;
            let mem_usage = null;
            let swap_total = null;
            let swap_free = null;
            let swap_used = null;
            let swap_usage = null;

            content_lines.forEach((line) => {
                let [key, value] = line.split(':');
                if (value) {
                    value = parseInt(value.trim(), 10);
                }

                switch (key) {
                    case 'MemTotal':
                        mem_total = value;
                        break;
                    case 'MemAvailable':
                        mem_available = value;
                        break;
                    case 'SwapTotal':
                        swap_total = value;
                        break;
                    case 'SwapFree':
                        swap_free = value;
                        break;
                }
            });

            // Update RAM usage label
            if (mem_total !== null && mem_available !== null) {
                mem_used = mem_total - mem_available;
                mem_usage = (mem_used / mem_total) * 100;
                this.mem_usage_label.set_text(`Mem: ${mem_usage.toFixed(2)}%`);
            }

            // Update Swap usage label only if swap is available
            if (swap_total !== null && swap_total > 0 && swap_free !== null) {
                swap_used = swap_total - swap_free;
                swap_usage = (swap_used / swap_total) * 100;
                this.swap_usage_label.set_text(`Swap: ${swap_usage.toFixed(2)}%`);
                this.swap_usage_label.show();
            } else {
                this.swap_usage_label.hide(); // Hide the label because there's no swap
            }
        } catch (e) {
            logError(e, `Failed to update memory usage.`);
        }
    }

    // Stop updates
    stop() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
        }
        this._timeout = undefined;
    }
}

// Register the SystemMonitorIndicator class
GObject.registerClass({
    GTypeName: 'SystemMonitorIndicator'
}, SystemMonitorIndicator);


// Export the main extension class
export default class SystemMonitorExtension {
    _indicator;

    // Enable the extension
    enable() {
        this._indicator = new SystemMonitorIndicator();
        panel.addToStatusArea('system-indicator', this._indicator);
    }

    // Disable the extension
    disable() {
        this._indicator.stop();
        this._indicator.destroy();
        this._indicator = undefined;
    }
}
