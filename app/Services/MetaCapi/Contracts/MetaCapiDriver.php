<?php

declare(strict_types=1);

namespace App\Services\MetaCapi\Contracts;

use App\Data\MetaCapiResponseDto;

interface MetaCapiDriver
{
    /**
     * Send one or more events to the Meta Conversions API.
     *
     * @param  string  $pixelId
     * @param  array   $events  Array of event payloads in Meta format
     * @param  string|null  $testEventCode
     * @return MetaCapiResponseDto
     */
    public function sendEvents(string $pixelId, array $events, ?string $testEventCode = null): MetaCapiResponseDto;
}
