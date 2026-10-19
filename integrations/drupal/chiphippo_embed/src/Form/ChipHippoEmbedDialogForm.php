<?php

namespace Drupal\chiphippo_embed\Form;

use Drupal\Core\Ajax\AjaxResponse;
use Drupal\Core\Ajax\CloseModalDialogCommand;
use Drupal\Core\Form\FormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Url;
use Drupal\editor\Ajax\EditorDialogSave;

/**
 * The CKEditor button's "insert a circuit" dialog.
 */
class ChipHippoEmbedDialogForm extends FormBase {

  public function getFormId() {
    return 'chiphippo_embed_dialog_form';
  }

  public function buildForm(array $form, FormStateInterface $form_state) {
    $form['#prefix'] = '<div id="chiphippo-embed-dialog-wrapper">';
    $form['#suffix'] = '</div>';

    $options = ['' => $this->t('-- Blank workbench --')];
    $storage = \Drupal::entityTypeManager()->getStorage('media');
    $ids = $storage->getQuery()
      ->condition('bundle', 'chiphippo_project')
      ->accessCheck(TRUE)
      ->sort('name')
      ->execute();
    foreach ($storage->loadMultiple($ids) as $media) {
      $options[$media->id()] = $media->label();
    }
    $form['project_media_id'] = [
      '#type' => 'select',
      '#title' => $this->t('Existing project'),
      '#options' => $options,
      '#description' => $this->t('Projects arrive via Save to Media Library in the simulator, or Content > Media > Add media > Chip Hippo Project.'),
    ];
    $form['lesson'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Built-in lesson ID (optional)'),
      '#description' => $this->t('For example 74ls00-intro. Used only when no project is selected.'),
      '#maxlength' => 64,
    ];
    $form['actions'] = ['#type' => 'actions'];
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $this->t('Insert'),
      '#ajax' => ['callback' => '::ajaxSubmit', 'event' => 'click'],
    ];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state) {
    // Handled in ajaxSubmit(); this form is only reached via CKEditor's modal.
  }

  public function ajaxSubmit(array &$form, FormStateInterface $form_state): AjaxResponse {
    $response = new AjaxResponse();
    $project = '';
    $lesson = '';
    $media_id = $form_state->getValue('project_media_id');
    if ($media_id) {
      $media = \Drupal::entityTypeManager()->getStorage('media')->load($media_id);
      if ($media && $media->bundle() === 'chiphippo_project') {
        $project = Url::fromRoute('chiphippo_embed.project_file', ['media' => $media_id])->setAbsolute()->toString();
      }
    }
    else {
      $candidate = trim((string) $form_state->getValue('lesson'));
      if (preg_match('/^[A-Za-z0-9-]{1,64}$/', $candidate)) {
        $lesson = $candidate;
      }
    }
    $response->addCommand(new EditorDialogSave(['project' => $project, 'lesson' => $lesson]));
    $response->addCommand(new CloseModalDialogCommand());
    return $response;
  }

}
