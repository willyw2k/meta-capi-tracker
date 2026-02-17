<?php

declare(strict_types=1);

namespace App\Services\MetaCapi;

use App\Data\MetaUserData;

/**
 * Match Quality Scorer
 *
 * Scores the quality of user_data parameters for Meta event matching.
 * Higher scores = better chance Meta can match the event to a Facebook user.
 *
 * Score weights are based on Meta's documentation about which parameters
 * have the most impact on match quality.
 *
 * Score ranges:
 *   0-20   → Poor    (likely won't match)
 *   21-40  → Fair    (basic matching, low match rate)
 *   41-60  → Good    (decent match rate)
 *   61-80  → Great   (high match rate)
 *   81-100 → Excellent (very high match rate)
 */
final readonly class MatchQualityScorer
{
    /**
     * Score weights per parameter.
     * Based on Meta's match quality impact rankings.
     */
    private const WEIGHTS = [
        // Tier 1: Strongest identifiers (direct user matching)
        'em' => 30,              // Email — strongest single signal
        'ph' => 25,              // Phone — second strongest
        'external_id' => 15,     // External ID — strong when consistent

        // Tier 2: Facebook identifiers
        'fbc' => 12,             // Click ID — very strong attribution signal
        'fbp' => 8,              // Browser ID — good session matching

        // Tier 3: Name + Demographics
        'fn' => 5,               // First name
        'ln' => 5,               // Last name
        'db' => 4,               // Date of birth
        'ge' => 2,               // Gender

        // Tier 4: Location
        'ct' => 3,               // City
        'st' => 2,               // State
        'zp' => 3,               // Zip code
        'country' => 2,          // Country

        // Tier 5: Request metadata
        'client_ip_address' => 4,
        'client_user_agent' => 3,

        // Tier 6: Additional IDs
        'subscription_id' => 3,
        'fb_login_id' => 10,
        'lead_id' => 5,
    ];

    /**
     * Score the match quality of a MetaUserData object.
     *
     * @return array{score: int, tier: string, fields_present: array, fields_missing: array, recommendations: array}
     */
    public function score(MetaUserData $userData): array
    {
        $score = 0;
        $fieldsPresent = [];
        $fieldsMissing = [];

        $dataArray = $userData->toArray();

        foreach (self::WEIGHTS as $field => $weight) {
            $value = $dataArray[$field] ?? null;

            if ($value !== null && $value !== '') {
                $score += $weight;
                $fieldsPresent[] = $field;
            } else {
                $fieldsMissing[] = $field;
            }
        }

        $score = min($score, 100);

        return [
            'score' => $score,
            'emq' => $this->toMetaEmqScale($score),
            'meets_target' => $this->meetsEmqTarget($score),
            'tier' => $this->scoreTier($score),
            'fields_present' => $fieldsPresent,
            'fields_missing' => $fieldsMissing,
            'recommendations' => $this->recommendations($fieldsPresent, $fieldsMissing, $score),
        ];
    }

    /**
     * Quick score — just returns the integer.
     */
    public function quickScore(MetaUserData $userData): int
    {
        $score = 0;
        $dataArray = $userData->toArray();

        foreach (self::WEIGHTS as $field => $weight) {
            if (! empty($dataArray[$field])) {
                $score += $weight;
            }
        }

        return min($score, 100);
    }

    /**
     * Convert internal 0-100 score to Meta's EMQ 1-10 scale.
     *
     * Meta Events Manager shows Event Match Quality (EMQ) on a 1-10 scale.
     * Target: 8-10 for optimal ad delivery and attribution.
     *
     * Mapping:
     *   Internal 0-10   → EMQ 1 (poor)
     *   Internal 11-20  → EMQ 2
     *   Internal 21-30  → EMQ 3
     *   Internal 31-40  → EMQ 4
     *   Internal 41-50  → EMQ 5
     *   Internal 51-60  → EMQ 6
     *   Internal 61-70  → EMQ 7
     *   Internal 71-80  → EMQ 8 (good — target minimum)
     *   Internal 81-90  → EMQ 9
     *   Internal 91-100 → EMQ 10 (excellent)
     */
    public function toMetaEmqScale(int $internalScore): int
    {
        return max(1, min(10, (int) ceil($internalScore / 10)));
    }

    /**
     * Check if the internal score meets the target EMQ of 8-10.
     */
    public function meetsEmqTarget(int $internalScore, int $targetEmq = 8): bool
    {
        return $this->toMetaEmqScale($internalScore) >= $targetEmq;
    }

    /**
     * Get the quality tier label.
     */
    private function scoreTier(int $score): string
    {
        return match (true) {
            $score >= 81 => 'excellent',
            $score >= 61 => 'great',
            $score >= 41 => 'good',
            $score >= 21 => 'fair',
            default => 'poor',
        };
    }

    /**
     * Generate recommendations to improve match quality.
     */
    private function recommendations(array $present, array $missing, int $score): array
    {
        $recs = [];

        // Tier 1 missing
        if (! in_array('em', $present) && ! in_array('ph', $present)) {
            $recs[] = 'Add email (em) or phone (ph) — these are the strongest matching signals.';
        } elseif (! in_array('em', $present)) {
            $recs[] = 'Add email (em) to significantly improve match rate.';
        } elseif (! in_array('ph', $present)) {
            $recs[] = 'Add phone number (ph) for additional matching.';
        }

        // Facebook identifiers
        if (! in_array('fbc', $present) && ! in_array('fbp', $present)) {
            $recs[] = 'Enable Cookie Keeper to capture _fbp and _fbc cookies.';
        }

        // External ID
        if (! in_array('external_id', $present) && $score < 60) {
            $recs[] = 'Add external_id for consistent cross-session matching.';
        }

        // Name
        if (! in_array('fn', $present) && ! in_array('ln', $present) && $score < 50) {
            $recs[] = 'Add first name (fn) and last name (ln) to improve matching accuracy.';
        }

        // Location
        if (! in_array('country', $present) && ! in_array('zp', $present) && $score < 40) {
            $recs[] = 'Add country or zip code for geographic matching.';
        }

        // IP/UA
        if (! in_array('client_ip_address', $present)) {
            $recs[] = 'Ensure client_ip_address is set from the original request.';
        }

        if (empty($recs) && $score >= 80) {
            $recs[] = 'Match quality is excellent. No further improvements needed.';
        }

        return $recs;
    }
}
