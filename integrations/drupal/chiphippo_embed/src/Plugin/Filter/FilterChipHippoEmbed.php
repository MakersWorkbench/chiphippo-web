<?php

namespace Drupal\chiphippo_embed\Plugin\Filter;

use Drupal\Component\Utility\Html;
use Drupal\filter\FilterProcessResult;
use Drupal\filter\Plugin\FilterBase;

/**
 * Replaces a constrained Chip Hippo token with an interactive iframe.
 *
 * @Filter(
 *   id = "filter_chiphippo_embed",
 *   title = @Translation("Chip Hippo embed"),
   *   description = @Translation("Embeds curated Chip Hippo lessons and Media Library projects."),
 *   type = Drupal\filter\Plugin\FilterInterface::TYPE_MARKUP_LANGUAGE
 * )
 */
final class FilterChipHippoEmbed extends FilterBase {

  /**
   * {@inheritdoc}
   */
  public function process($text, $langcode): FilterProcessResult {
    $origin = 'https://breadboardlab.themakersworkbench.com';
    $media_origin = 'https://themakersworkbench.com';
    $pattern = '/\[chiphippo\s+type=(lesson|project)\s+id=([A-Za-z0-9_-]{1,64})(?:\s+source="(\/sites\/default\/files\/[^"]{1,500}\.chiphippo)")?(?:\s+title="([^"]{1,120})")?\]/i';
    $changed = preg_replace_callback($pattern, static function (array $match) use ($origin, $media_origin): string {
      $type = $match[1];
      $id = rawurlencode($match[2]);
      $source = $match[3] ?? '';
      $title = Html::escape($match[4] ?? 'Interactive Chip Hippo circuit');
      $path = $type === 'project' ? "/embed/project/$id" : "/embed/$id";
      if ($type === 'project') {
        if ($source === '' || str_contains($source, '..')) {
          return $match[0];
        }
        $path .= '?source=' . rawurlencode($media_origin . $source);
      }
      $src = Html::escape($origin . $path);
      return '<div class="chiphippo-embed" data-chiphippo-embed><iframe src="' . $src . '" title="' . $title . '" loading="lazy" sandbox="allow-scripts allow-same-origin allow-downloads" allow="clipboard-write; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
    }, $text);
    return (new FilterProcessResult($changed ?? $text))
      ->addAttachments(['library' => ['chiphippo_embed/embed']]);
  }

}
