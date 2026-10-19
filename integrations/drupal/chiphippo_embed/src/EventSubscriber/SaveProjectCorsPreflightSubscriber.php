<?php

namespace Drupal\chiphippo_embed\EventSubscriber;

use Drupal\Core\Config\ConfigFactoryInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Answers the CORS preflight for /api/chiphippo/save-project.
 *
 * Core's OptionsRequestSubscriber (priority 1000) would otherwise answer every
 * OPTIONS request with no CORS headers. This runs first and claims only this
 * one path.
 */
class SaveProjectCorsPreflightSubscriber implements EventSubscriberInterface {

  public function __construct(protected ConfigFactoryInterface $configFactory) {}

  public function onRequest(RequestEvent $event): void {
    $request = $event->getRequest();
    if (!$request->isMethod('OPTIONS') || $request->getPathInfo() !== '/api/chiphippo/save-project') {
      return;
    }
    $origin = (string) $request->headers->get('Origin', '');
    $allowed = $this->configFactory->get('chiphippo_embed.settings')->get('save_allowed_origins') ?: [];

    $response = new Response('', 204);
    if ($origin !== '' && in_array($origin, $allowed, TRUE)) {
      $response->headers->set('Access-Control-Allow-Origin', $origin);
      $response->headers->set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      $response->headers->set('Access-Control-Max-Age', '600');
      $response->headers->set('Vary', 'Origin');
    }
    $event->setResponse($response);
    $event->stopPropagation();
  }

  public static function getSubscribedEvents(): array {
    $events[KernelEvents::REQUEST][] = ['onRequest', 1001];
    return $events;
  }

}
