/**
 * @file Registers the Chip Hippo Circuit toolbar button.
 */

import { Plugin } from 'ckeditor5/src/core';
import { ButtonView } from 'ckeditor5/src/ui';
import ChipHippoEmbedEditing from './chiphippoembedediting';

// Inline SVG (a DIP chip on a breadboard row); raw-loader imports render badly in this build.
const chipIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">' +
  '<rect x="4" y="5" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
  '<path d="M7 5V2M10 5V2M13 5V2M7 15v3M10 15v3M13 15v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
  '<circle cx="7" cy="8" r="0.9" fill="currentColor"/>' +
  '</svg>';

export default class ChipHippoEmbed extends Plugin {
  static get requires() {
    return [ChipHippoEmbedEditing];
  }

  init() {
    const editor = this.editor;

    editor.ui.componentFactory.add('ChipHippoEmbed', (locale) => {
      const command = editor.commands.get('insertChipHippoEmbed');
      const buttonView = new ButtonView(locale);

      buttonView.set({
        label: editor.t('Insert Chip Hippo Circuit'),
        icon: chipIcon,
        tooltip: true,
      });
      buttonView.bind('isOn', 'isEnabled').to(command, 'value', 'isEnabled');
      this.listenTo(buttonView, 'execute', () => {
        editor.execute('insertChipHippoEmbed');
      });
      return buttonView;
    });
  }
}
