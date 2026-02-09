<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Actions\MetaCapi\TrackEventAction;
use App\Http\Requests\TrackEventRequest;
use App\Services\MetaCapi\Exceptions\MetaCapiException;
use Illuminate\Http\JsonResponse;

final readonly class TrackEventController
{
    public function __invoke(
        TrackEventRequest $request,
        TrackEventAction $action,
    ): JsonResponse {
        try {
            $trackedEvent = $action($request->toDto());

            return response()->json([
                'success' => true,
                'event_id' => $trackedEvent->event_id,
                'status' => $trackedEvent->status->value,
                'message' => 'Event queued for delivery.',
            ], 202);
        } catch (MetaCapiException $e) {
            $statusCode = str_contains($e->getMessage(), 'Duplicate') ? 409 : 422;

            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], $statusCode);
        }
    }
}
