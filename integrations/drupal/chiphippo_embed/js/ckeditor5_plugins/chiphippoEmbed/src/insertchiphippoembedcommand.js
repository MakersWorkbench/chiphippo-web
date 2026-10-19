/**
 * @file The command run when the toolbar button is pressed: opens the
 * Drupal dialog, then inserts the placeholder with the chosen values.
 */

import { Command } from 'ckeditor5/src/core';

export default class InsertChipHippoEmbedCommand extends Command {
  execute() {
    const { model } = this.editor;

    Drupal.ckeditor5.openDialog(
      Drupal.url('admin/config/content/chiphippo/embed-dialog'),
      (values) => {
        const project = (values.project || '').trim();
        const lesson = (values.lesson || '').trim();
        model.change((writer) => {
          model.insertContent(
            writer.createElement('chiphippoEmbed', {
              'data-chiphippo-project': project,
              'data-chiphippo-lesson': lesson,
              'data-chiphippo-height': '',
            }),
          );
        });
      },
      { title: Drupal.t('Insert Chip Hippo Circuit') },
    );
  }

  refresh() {
    const { model } = this.editor;
    const allowedIn = model.schema.findAllowedParent(
      model.document.selection.getFirstPosition(),
      'chiphippoEmbed',
    );
    this.isEnabled = allowedIn !== null;
  }
}
