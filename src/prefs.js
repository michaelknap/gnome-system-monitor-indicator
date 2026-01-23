/*
 * System Monitor Tray Indicator - Preferences
 *
 * License: MIT License
 */

'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SystemMonitorIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Page
        const page = new Adw.PreferencesPage({
            title: 'System Monitor Tray Indicator',
            icon_name: 'utilities-system-monitor-symbolic',
        });

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

        // CPU usage toggle
        const cpuUsageRow = new Adw.SwitchRow({
            title: 'Show CPU usage',
            subtitle: 'Display CPU usage percentage in the top bar.',
        });

        // Keep UI in sync with settings (and vice versa).
        const clamp = (v) => Math.max(0, Math.min(2, v));

        // Sync Settings -> UI
        const syncFromSettings = () => {
            const v = clamp(settings.get_int('decimal-places'));
            if (decimalsRow.selected !== v)
                decimalsRow.selected = v;
        };
        const syncCpuUsageFromSettings = () => {
            const v = settings.get_boolean('show-cpu-usage');
            if (cpuUsageRow.get_active() !== v)
                cpuUsageRow.set_active(v);
        };

        syncFromSettings();
        syncCpuUsageFromSettings();

        // Sync UI -> Settings
        decimalsRow.connect('notify::selected', () => {
            const v = clamp(decimalsRow.selected);
            if (settings.get_int('decimal-places') !== v)
                settings.set_int('decimal-places', v);
        });

        cpuUsageRow.connect('notify::active', () => {
            const active = cpuUsageRow.get_active();
            if (settings.get_boolean('show-cpu-usage') !== active)
                settings.set_boolean('show-cpu-usage', active);
        });

        const changedId = settings.connect('changed::decimal-places', syncFromSettings);
        const cpuUsageChangedId = settings.connect('changed::show-cpu-usage', syncCpuUsageFromSettings);

        // Ensure we don't leak the settings signal if the window is destroyed.
        window.connect('close-request', () => {
            if (changedId)
                settings.disconnect(changedId);
            if (cpuUsageChangedId)
                settings.disconnect(cpuUsageChangedId);
            return false;
        });

        displayGroup.add(decimalsRow);
        displayGroup.add(cpuUsageRow);
        page.add(displayGroup);

        window.add(page);
    }
}
