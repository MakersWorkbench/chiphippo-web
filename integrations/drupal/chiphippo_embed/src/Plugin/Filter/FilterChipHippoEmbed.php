<?php

namespace Drupal\chiphippo_embed\Plugin\Filter;

use Drupal\Component\Utility\Html;
use Drupal\Core\Url;
use Drupal\filter\FilterProcessResult;
use Drupal\filter\Plugin\FilterBase;

/**
 * Turns the CKEditor placeholder div into the Chip Hippo iframe.
 *
 * @Filter(
 *   id = "filter_chiphippo_embed",
 *   title = @Translation("Chip Hippo embed"),
 *   description = @Translation("Renders Chip Hippo circuits inserted with the CKEditor button."),
 *   type = Drupal\filter\Plugin\FilterInterface::TYPE_TRANSFORM_REVERSIBLE,
 *   weight = 10
 * )
 */
final class FilterChipHippoEmbed extends FilterBase {

  /**
   * {@inheritdoc}
   */
  public function process($text, $langcode): FilterProcessResult {
    $result = new FilterProcessResult($text);
    if (!str_contains($text, 'chiphippo-embed-wrapper')) {
      return $result;
    }
    $dom = Html::load($text);
    $nodes = (new \DOMXPath($dom))->query('//div[contains(@class, "chiphippo-embed-wrapper")]');
    if ($nodes->length === 0) {
      return $result;
    }

    $config = \Drupal::config('chiphippo_embed.settings');
    $base = rtrim((string) $config->get('base_url'), '/');
    if ($base === '') {
      // Not configured yet (Settings > Chip Hippo Embed): render nothing rather
      // than an iframe pointing at this site.
      $result->addCacheableDependency($config);
      return $result;
    }
    $default_height = (int) ($config->get('default_embed_height') ?: 720);
    $result->addCacheableDependency($config);
    $result->addCacheContexts(['url.site']);

    foreach (iterator_to_array($nodes) as $node) {
      $project = (string) $node->getAttribute('data-chiphippo-project');
      $lesson = (string) $node->getAttribute('data-chiphippo-lesson');
      $height_attr = $node->getAttribute('data-chiphippo-height');
      $height = ctype_digit($height_attr) ? (int) $height_attr : $default_height;

      // The media ID in the stored URL is authoritative, so the absolute URL
      // is rebuilt against the current host (local, staging, or live).
      if (preg_match('#/chiphippo-project/(\d+)/file/?$#', $project, $m)) {
        $source = Url::fromRoute('chiphippo_embed.project_file', ['media' => $m[1]], ['absolute' => TRUE])->toString();
        $src = $base . '/embed/project/' . $m[1] . '?source=' . rawurlencode($source);
      }
      elseif (preg_match('/^[A-Za-z0-9-]{1,64}$/', $lesson)) {
        $src = $base . '/embed/' . $lesson;
      }
      else {
        $src = $base . '/app/';
      }

      $build = [
        '#theme' => 'chiphippo_embed',
        '#src' => $src,
        '#title' => 'Interactive Chip Hippo circuit',
        '#height' => $height,
      ];
      $html = (string) \Drupal::service('renderer')->renderInIsolation($build);
      $embed_body = Html::load($html)->getElementsByTagName('body')->item(0);
      if ($embed_body) {
        foreach ($embed_body->childNodes as $child) {
          $node->parentNode->insertBefore($dom->importNode($child, TRUE), $node);
        }
      }
      $node->parentNode->removeChild($node);
    }

    $result->setProcessedText(Html::serialize($dom));
    $result->addAttachments([
      'library' => ['chiphippo_embed/embed'],
      'drupalSettings' => ['chiphippoEmbed' => ['origin' => $base]],
    ]);
    return $result;
  }

  /**
   * {@inheritdoc}
   */
  public function tips($long = FALSE) {
    return $this->t('Chip Hippo circuits inserted with the toolbar button render as live simulators.');
  }

}
