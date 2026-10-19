/**
 * @file Schema and converters for the Chip Hippo placeholder element.
 */

import { Plugin } from 'ckeditor5/src/core';
import { Widget, toWidget } from 'ckeditor5/src/widget';
import InsertChipHippoEmbedCommand from './insertchiphippoembedcommand';

const ATTRS = [
  'data-chiphippo-project',
  'data-chiphippo-lesson',
  'data-chiphippo-height',
];

export default class ChipHippoEmbedEditing extends Plugin {
  static get requires() {
    return [Widget];
  }

  init() {
    this._defineSchema();
    this._defineConverters();
    this.editor.commands.add(
      'insertChipHippoEmbed',
      new InsertChipHippoEmbedCommand(this.editor),
    );
  }

  _defineSchema() {
    this.editor.model.schema.register('chiphippoEmbed', {
      isObject: true,
      allowWhere: '$block',
      isBlock: true,
      allowAttributes: ATTRS,
    });
  }

  _defineConverters() {
    const { conversion } = this.editor;
    const read = (viewElement) =>
      Object.fromEntries(ATTRS.map((a) => [a, viewElement.getAttribute(a) || '']));

    conversion.for('upcast').elementToElement({
      view: { name: 'div', classes: ['chiphippo-embed-wrapper'] },
      model: (viewElement, { writer }) =>
        writer.createElement('chiphippoEmbed', read(viewElement)),
    });

    conversion.for('dataDowncast').elementToElement({
      model: 'chiphippoEmbed',
      view: (modelElement, { writer }) =>
        writer.createContainerElement('div', {
          class: 'chiphippo-embed-wrapper',
          ...Object.fromEntries(ATTRS.map((a) => [a, modelElement.getAttribute(a) || ''])),
        }),
    });

    // The simulator never runs inside the editor: just a labelled card.
    conversion.for('editingDowncast').elementToElement({
      model: 'chiphippoEmbed',
      view: (modelElement, { writer }) => {
        const project = modelElement.getAttribute('data-chiphippo-project') || '';
        const lesson = modelElement.getAttribute('data-chiphippo-lesson') || '';
        const summary = project
          ? `Chip Hippo circuit: ${project}`
          : lesson
            ? `Chip Hippo lesson: ${lesson}`
            : 'Chip Hippo circuit: blank workbench';
        const container = writer.createContainerElement('div', {
          class: 'chiphippo-embed-wrapper chiphippo-embed-editor',
        });
        writer.insert(writer.createPositionAt(container, 0), writer.createText(summary));
        return toWidget(container, writer, { label: 'Chip Hippo Circuit' });
      },
    });
  }
}
