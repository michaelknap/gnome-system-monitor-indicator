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

        // Keep UI in sync with settings (and vice versa).
        const clamp = (v) => Math.max(0, Math.min(2, v));

        const syncFromSettings = () => {
            const v = clamp(settings.get_int('decimal-places'));
            if (decimalsRow.selected !== v)
                decimalsRow.selected = v;
        };

        syncFromSettings();

        const changedId = settings.connect('changed::decimal-places', syncFromSettings);

        decimalsRow.connect('notify::selected', () => {
            const v = clamp(decimalsRow.selected);
            if (settings.get_int('decimal-places') !== v)
                settings.set_int('decimal-places', v);
        });

        // Ensure we don't leak the settings signal if the window is destroyed.
        window.connect('close-request', () => {
            if (changedId)
                settings.disconnect(changedId);
            return false;
        });

        displayGroup.add(decimalsRow);
        page.add(displayGroup);

        window.add(page);
    }
}
