/*
 * System Monitor Tray Indicator - Preferences
 *
 * License: MIT License
 */

'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SETTINGS_KEY_DECIMAL_PLACES = 'decimal-places';
const METRIC_SETTINGS = [
    {
        key: 'show-cpu',
        title: 'CPU',
        subtitle: 'Show CPU usage in the top bar.',
    },
    {
        key: 'show-memory',
        title: 'RAM',
        subtitle: 'Show memory usage in the top bar.',
    },
    {
        key: 'show-swap',
        title: 'Swap',
        subtitle: 'Show swap usage in the top bar.',
    },
];

export default class SystemMonitorIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Page
        const page = new Adw.PreferencesPage({
            title: 'System Monitor Tray Indicator',
            icon_name: 'utilities-system-monitor-symbolic',
        });

        const metricsGroup = new Adw.PreferencesGroup({
            title: 'Metrics',
            description: 'Choose which metrics are shown in the top bar.',
        });

        const metricRows = new Map();
        for (const metric of METRIC_SETTINGS) {
            const row = new Adw.SwitchRow({
                title: metric.title,
                subtitle: metric.subtitle,
            });

            row.connect('notify::active', () => {
                if (settings.get_boolean(metric.key) !== row.active)
                    settings.set_boolean(metric.key, row.active);
            });

            metricRows.set(metric.key, row);
            metricsGroup.add(row);
        }

        // Display group
        const displayGroup = new Adw.PreferencesGroup({
            title: 'Display',
            description: 'Control how values are shown in the top bar.',
        });

        const decimalModel = new Gtk.StringList();
        decimalModel.append('No decimals');
        decimalModel.append('1 decimal');
        decimalModel.append('2 decimals');

        const decimalsRow = new Adw.ComboRow({
            title: 'Decimal places',
            subtitle: 'Applies to CPU, memory and swap percentages.',
            model: decimalModel,
        });

        // Keep UI in sync with settings (and vice versa).
        const clamp = (v) => Math.max(0, Math.min(2, v));

        const syncFromSettings = () => {
            const v = clamp(settings.get_int(SETTINGS_KEY_DECIMAL_PLACES));
            if (decimalsRow.selected !== v)
                decimalsRow.selected = v;

            let enabledCount = 0;
            for (const metric of METRIC_SETTINGS) {
                const active = settings.get_boolean(metric.key);
                const row = metricRows.get(metric.key);

                if (row.active !== active)
                    row.active = active;

                if (active)
                    enabledCount++;
            }

            for (const metric of METRIC_SETTINGS) {
                const active = settings.get_boolean(metric.key);
                const row = metricRows.get(metric.key);
                row.sensitive = enabledCount !== 1 || !active;
            }
        };

        syncFromSettings();

        let changedId = settings.connect('changed', syncFromSettings);

        decimalsRow.connect('notify::selected', () => {
            const v = clamp(decimalsRow.selected);
            if (settings.get_int(SETTINGS_KEY_DECIMAL_PLACES) !== v)
                settings.set_int(SETTINGS_KEY_DECIMAL_PLACES, v);
        });

        // Ensure we don't leak the settings signal if the window is destroyed.
        window.connect('close-request', () => {
            if (changedId) {
                settings.disconnect(changedId);
                changedId = 0;
            }
            return false;
        });

        page.add(metricsGroup);
        displayGroup.add(decimalsRow);
        page.add(displayGroup);

        window.add(page);
    }
}
