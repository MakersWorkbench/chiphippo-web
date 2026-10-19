<?php

namespace Drupal\chiphippo_embed\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\file\FileInterface;
use Drupal\media\MediaInterface;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Serves a "Chip Hippo Project" media item's file with CORS enabled.
 *
 * The simulator runs on its own origin, so a plain link under
 * sites/default/files would be blocked by the browser's CORS check.
 */
class ProjectFileController extends ControllerBase {

  /**
   * Streams the media's underlying file.
   */
  public function serve(MediaInterface $media): Response {
    if ($media->bundle() !== 'chiphippo_project') {
      throw new NotFoundHttpException();
    }
    $source_field = $media->getSource()->getConfiguration()['source_field'] ?? 'field_media_chiphippo_project';
    $file = $media->get($source_field)->entity;
    if (!$file instanceof FileInterface) {
      throw new NotFoundHttpException();
    }

    $response = new BinaryFileResponse($file->getFileUri());
    $response->headers->set('Content-Type', 'application/json');
    // Public, read-only article dependency: no credentials are involved.
    $response->headers->set('Access-Control-Allow-Origin', '*');
    $response->setPublic();
    $response->setMaxAge(3600);
    return $response;
  }

}
