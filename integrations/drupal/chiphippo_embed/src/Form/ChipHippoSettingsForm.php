<?php

namespace Drupal\chiphippo_embed\Form;

use Drupal\Component\Utility\Crypt;
use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Configures the Chip Hippo simulator this site embeds and accepts saves from.
 */
class ChipHippoSettingsForm extends ConfigFormBase {

  protected function getEditableConfigNames() {
    return ['chiphippo_embed.settings'];
  }

  public function getFormId() {
    return 'chiphippo_embed_settings_form';
  }

  public function buildForm(array $form, FormStateInterface $form_state) {
    $config = $this->config('chiphippo_embed.settings');

    $form['base_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Chip Hippo simulator base URL'),
      '#description' => $this->t('For example https://circuits.example.com (no trailing slash), where this Chip Hippo Web copy is hosted. For local testing use http://127.0.0.1:4173.'),
      '#default_value' => $config->get('base_url'),
      '#required' => TRUE,
    ];
    $form['default_embed_height'] = [
      '#type' => 'number',
      '#title' => $this->t('Default embed height (pixels)'),
      '#default_value' => $config->get('default_embed_height') ?: 720,
      '#min' => 400,
      '#max' => 1400,
      '#required' => TRUE,
    ];
    $form['save_to_media'] = [
      '#type' => 'details',
      '#title' => $this->t('Save to Media Library (from the simulator)'),
      '#description' => $this->t("Lets the simulator push a circuit into this site's media library from its File toolbar."),
      '#open' => TRUE,
    ];
    $form['save_to_media']['token_status'] = [
      '#type' => 'item',
      '#title' => $this->t('API token status'),
      '#markup' => $config->get('save_api_token_hash')
        ? $this->t('A token is set. Generating a new one immediately invalidates it.')
        : $this->t('No token set yet. The save endpoint refuses every request until one is generated.'),
    ];
    $form['save_to_media']['generate_token'] = [
      '#type' => 'submit',
      '#value' => $this->t('Generate new token'),
      '#submit' => ['::generateToken'],
      '#limit_validation_errors' => [],
    ];
    $form['save_to_media']['allowed_origins'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Allowed origins (CORS)'),
      '#description' => $this->t('One per line: scheme + host + port, no path (for example https://circuits.example.com). Only these origins can call the save endpoint from a browser.'),
      '#default_value' => implode("\n", $config->get('save_allowed_origins') ?: []),
      '#rows' => 4,
    ];
    return parent::buildForm($form, $form_state);
  }

  public function submitForm(array &$form, FormStateInterface $form_state) {
    $origins = array_values(array_filter(array_map('trim', explode("\n", (string) $form_state->getValue('allowed_origins')))));
    $this->config('chiphippo_embed.settings')
      ->set('base_url', rtrim($form_state->getValue('base_url'), '/'))
      ->set('default_embed_height', (int) $form_state->getValue('default_embed_height'))
      ->set('save_allowed_origins', $origins)
      ->save();
    parent::submitForm($form, $form_state);
  }

  /**
   * Generates a token; only its hash is stored, the raw value is shown once.
   */
  public function generateToken(array &$form, FormStateInterface $form_state) {
    $token = Crypt::randomBytesBase64(32);
    $this->config('chiphippo_embed.settings')
      ->set('save_api_token_hash', Crypt::hashBase64($token))
      ->save();
    $this->messenger()->addWarning($this->t('New API token (copy it now, it will not be shown again): @token', ['@token' => $token]));
  }

}
