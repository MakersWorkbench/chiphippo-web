<?php

namespace Drupal\chiphippo_embed\Controller;

use Drupal\Component\Utility\Crypt;
use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Url;
use Drupal\file\Entity\File;
use Drupal\media\Entity\Media;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accepts a .chiphippo project from the simulator and files it as media.
 *
 * Authorized by a bearer token whose hash is kept in
 * chiphippo_embed.settings; the simulator is on another origin and has no
 * Drupal session. CORS is limited to the configured origin allowlist.
 */
class SaveProjectController extends ControllerBase {

  /**
   * Maximum accepted request body, in bytes.
   */
  const MAX_BYTES = 8388608;

  /**
   * Handles POST (the save) and OPTIONS (CORS preflight).
   */
  public function save(Request $request): Response {
    $config = $this->config('chiphippo_embed.settings');
    $origin = $request->headers->get('Origin', '');
    $cors = $this->corsHeaders($origin, $config->get('save_allowed_origins') ?: []);

    if ($request->getMethod() === 'OPTIONS') {
      $response = new Response('', 204);
      $response->headers->add($cors);
      return $response;
    }

    $token_hash = (string) $config->get('save_api_token_hash');
    if ($token_hash === '') {
      return $this->jsonError('No API token has been configured yet. Generate one at /admin/config/content/chiphippo.', 503, $cors);
    }
    $auth = (string) $request->headers->get('Authorization', '');
    if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
      return $this->jsonError('Missing or malformed Authorization header. Expected: Bearer <token>.', 401, $cors);
    }
    if (!hash_equals($token_hash, Crypt::hashBase64(trim($m[1])))) {
      return $this->jsonError('Invalid API token.', 401, $cors);
    }

    $raw = $request->getContent();
    if (strlen($raw) > self::MAX_BYTES) {
      return $this->jsonError('Project is too large to save.', 413, $cors);
    }
    $payload = json_decode($raw, TRUE);
    if (!is_array($payload) || !is_array($payload['project'] ?? NULL) || !is_array($payload['project']['tabs'] ?? NULL)) {
      return $this->jsonError('Request body is not a valid Chip Hippo save payload.', 422, $cors);
    }

    $project = $payload['project'];
    $name = trim((string) ($payload['name'] ?? $project['name'] ?? '')) ?: 'Untitled Circuit';
    $name = mb_substr($name, 0, 120);
    $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $name), '-')) ?: 'circuit';
    $filename = $slug . '-' . \Drupal::time()->getRequestTime() . '.chiphippo';

    $file_system = \Drupal::service('file_system');
    $directory = 'public://chiphippo-projects';
    $file_system->prepareDirectory($directory, $file_system::CREATE_DIRECTORY | $file_system::MODIFY_PERMISSIONS);
    $uri = $directory . '/' . $filename;
    // The local file location is meaningless on the site; drop it.
    $project['location'] = NULL;
    $pretty = json_encode($project, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $file_system->saveData($pretty, $uri, $file_system::EXISTS_RENAME);

    try {
      $file = File::create(['uri' => $uri, 'status' => 1, 'uid' => 1]);
      $file->save();
      $media = Media::create([
        'bundle' => 'chiphippo_project',
        'name' => $name,
        'field_media_chiphippo_project' => ['target_id' => $file->id()],
        'uid' => 1,
        'status' => 1,
      ]);
      $media->save();
    }
    catch (\Exception $e) {
      return $this->jsonError('Saved the file but failed to create the media entity: ' . $e->getMessage(), 500, $cors);
    }

    $response = new JsonResponse([
      'media_id' => (int) $media->id(),
      'name' => $media->label(),
      'project_file_url' => Url::fromRoute('chiphippo_embed.project_file', ['media' => $media->id()])->setAbsolute()->toString(),
      'edit_url' => Url::fromRoute('entity.media.edit_form', ['media' => $media->id()])->setAbsolute()->toString(),
    ], 201);
    $response->headers->add($cors);
    return $response;
  }

  /**
   * CORS headers for an allowed origin, or none. Never falls back to '*'.
   */
  private function corsHeaders(string $origin, array $allowed): array {
    if ($origin === '' || !in_array($origin, $allowed, TRUE)) {
      return [];
    }
    return [
      'Access-Control-Allow-Origin' => $origin,
      'Access-Control-Allow-Methods' => 'POST, OPTIONS',
      'Access-Control-Allow-Headers' => 'Content-Type, Authorization',
      'Access-Control-Max-Age' => '600',
      'Vary' => 'Origin',
    ];
  }

  /**
   * JSON error response carrying the CORS headers.
   */
  private function jsonError(string $message, int $status, array $cors): JsonResponse {
    $response = new JsonResponse(['error' => $message], $status);
    $response->headers->add($cors);
    return $response;
  }

}
