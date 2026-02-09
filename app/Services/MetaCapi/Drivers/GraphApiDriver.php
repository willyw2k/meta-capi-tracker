<?php

declare(strict_types=1);

namespace App\Services\MetaCapi\Drivers;

use App\Data\MetaCapiResponseDto;
use App\Services\MetaCapi\Connectors\MetaCapiConnector;
use App\Services\MetaCapi\Contracts\MetaCapiDriver;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use App\Services\MetaCapi\Requests\Meta\SendEventsRequest;
use Saloon\Http\Response;

final class GraphApiDriver implements MetaCapiDriver
{
    private ?MetaCapiConnector $connector = null;

    public function __construct(
        private readonly string $accessToken,
    ) {}

    public function sendEvents(string $pixelId, array $events, ?string $testEventCode = null): MetaCapiResponseDto
    {
        $response = $this->send(
            new SendEventsRequest(
                pixelId: $pixelId,
                events: $events,
                testEventCode: $testEventCode,
            )
        );

        return MetaCapiResponseDto::fromMetaResponse($response->json());
    }

    private function send(\Saloon\Http\Request $request): Response
    {
        $response = $this->getConnector()->send($request);

        if ($response->status() === 429) {
            throw MetaCapiException::rateLimited();
        }

        if ($response->failed()) {
            throw MetaCapiException::failedRequest($response);
        }

        return $response;
    }

    private function getConnector(): MetaCapiConnector
    {
        if ($this->connector === null) {
            $this->connector = new MetaCapiConnector($this->accessToken);
        }

        return $this->connector;
    }
}
