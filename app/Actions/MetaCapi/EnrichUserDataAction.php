<?php

declare(strict_types=1);

namespace App\Actions\MetaCapi;

use App\Data\MetaUserData;
use App\Models\MatchQualityLog;
use App\Models\UserProfile;
use Illuminate\Support\Facades\Log;

/**
 * Enrich user data for better Meta Advanced Matching.
 *
 * Pipeline:
 *   1. Look up stored UserProfile by any available identifier
 *   2. Fill missing PII fields from the stored profile
 *   3. Infer country from phone number prefix (if missing)
 *   4. Score match quality before and after enrichment
 *   5. Update (or create) the UserProfile with new data
 *   6. Log match quality for analytics
 *
 * This increases Meta's Event Match Quality (EMQ) by ensuring
 * every event has the maximum PII available — even when the
 * client only sends a subset.
 */
final readonly class EnrichUserDataAction
{
    // ── Phone prefix → country code (top 50 countries) ───────

    private const PHONE_PREFIXES = [
        '1'    => 'us',  // US/Canada (default to US)
        '44'   => 'gb',
        '61'   => 'au',
        '81'   => 'jp',
        '86'   => 'cn',
        '91'   => 'in',
        '49'   => 'de',
        '33'   => 'fr',
        '39'   => 'it',
        '34'   => 'es',
        '31'   => 'nl',
        '46'   => 'se',
        '47'   => 'no',
        '45'   => 'dk',
        '358'  => 'fi',
        '48'   => 'pl',
        '55'   => 'br',
        '52'   => 'mx',
        '54'   => 'ar',
        '56'   => 'cl',
        '57'   => 'co',
        '51'   => 'pe',
        '62'   => 'id',
        '60'   => 'my',
        '63'   => 'ph',
        '66'   => 'th',
        '84'   => 'vn',
        '855'  => 'kh',
        '65'   => 'sg',
        '82'   => 'kr',
        '886'  => 'tw',
        '852'  => 'hk',
        '64'   => 'nz',
        '351'  => 'pt',
        '90'   => 'tr',
        '27'   => 'za',
        '234'  => 'ng',
        '20'   => 'eg',
        '966'  => 'sa',
        '971'  => 'ae',
        '7'    => 'ru',
        '380'  => 'ua',
        '353'  => 'ie',
        '41'   => 'ch',
        '43'   => 'at',
        '32'   => 'be',
        '420'  => 'cz',
        '40'   => 'ro',
    ];

    // ── Match quality weights ────────────────────────────────

    private const WEIGHTS = [
        'em'                 => 30,
        'ph'                 => 25,
        'external_id'        => 15,
        'fbc'                => 10,
        'fn'                 => 5,
        'ln'                 => 5,
        'fbp'                => 5,
        'client_ip_address'  => 3,
        'ct'                 => 3,
        'zp'                 => 3,
        'db'                 => 3,
        'st'                 => 2,
        'country'            => 2,
        'ge'                 => 2,
        'client_user_agent'  => 2,
    ];

    /**
     * Enrich the MetaUserData and return the enhanced version.
     */
    public function __invoke(
        MetaUserData $userData,
        string $pixelId,
        string $eventName,
        ?string $sourceDomain = null,
        ?string $visitorId = null,
    ): MetaUserData {
        $scoreBefore = $this->calculateScore($userData);
        $enrichmentSources = [];

        // ── Step 1: Lookup stored profile ────────────────────

        $identifiers = $this->extractIdentifiers($userData, $visitorId);
        $profile = UserProfile::findByIdentifiers($identifiers, $pixelId);

        // ── Step 2: Enrich from stored profile ───────────────

        if ($profile) {
            $userData = $this->enrichFromProfile($userData, $profile);
            $enrichmentSources[] = 'profile';
        }

        // ── Step 3: Infer country from phone prefix ──────────

        if (! $userData->country && $userData->ph) {
            $inferred = $this->inferCountryFromPhone($userData->ph);
            if ($inferred) {
                $userData = $this->withField($userData, 'country', MetaUserData::hashValue($inferred));
                $enrichmentSources[] = 'phone_prefix';
            }
        }

        // ── Step 4: Score after enrichment ───────────────────

        $scoreAfter = $this->calculateScore($userData);
        $wasEnriched = $scoreAfter > $scoreBefore;

        // ── Step 5: Update or create profile ─────────────────

        $this->upsertProfile($userData, $pixelId, $sourceDomain, $scoreAfter, $visitorId);

        // ── Step 6: Log match quality ────────────────────────

        $this->logMatchQuality(
            pixelId: $pixelId,
            eventName: $eventName,
            sourceDomain: $sourceDomain,
            userData: $userData,
            score: $scoreAfter,
            wasEnriched: $wasEnriched,
            scoreBefore: $scoreBefore,
            enrichmentSource: $enrichmentSources ? implode(',', $enrichmentSources) : null,
        );

        if ($wasEnriched) {
            Log::debug('AdvancedMatching: enriched', [
                'score' => "{$scoreBefore} → {$scoreAfter}",
                'sources' => $enrichmentSources,
                'pixel' => $pixelId,
            ]);
        }

        return $userData;
    }

    // ── Enrichment from stored profile ───────────────────────

    private function enrichFromProfile(MetaUserData $userData, UserProfile $profile): MetaUserData
    {
        $available = $profile->getAvailableFields();
        $clone = clone $userData;

        // Fill missing PII from profile
        $piiFields = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];

        foreach ($piiFields as $field) {
            if (empty($clone->{$field}) && ! empty($available[$field])) {
                $clone->{$field} = $available[$field];
            }
        }

        // Merge multi-value emails
        if (! empty($available['em_multi'])) {
            $existing = $clone->em_multi ?? [];
            $clone->em_multi = array_values(array_unique(array_merge($existing, $available['em_multi'])));
        }

        // Merge multi-value phones
        if (! empty($available['ph_multi'])) {
            $existing = $clone->ph_multi ?? [];
            $clone->ph_multi = array_values(array_unique(array_merge($existing, $available['ph_multi'])));
        }

        // Fill fbp/fbc if missing
        if (empty($clone->fbp) && ! empty($available['fbp'])) {
            $clone->fbp = $available['fbp'];
        }
        if (empty($clone->fbc) && ! empty($available['fbc'])) {
            $clone->fbc = $available['fbc'];
        }

        return $clone;
    }

    // ── Phone prefix → country inference ─────────────────────

    private function inferCountryFromPhone(string $phone): ?string
    {
        // If already hashed, we can't infer
        if (preg_match('/^[a-f0-9]{64}$/', $phone)) {
            return null;
        }

        $digits = preg_replace('/\D/', '', $phone);
        if (! $digits || strlen($digits) < 7) {
            return null;
        }

        // Try 3-digit, 2-digit, 1-digit prefixes (most specific first)
        for ($len = 3; $len >= 1; $len--) {
            $prefix = substr($digits, 0, $len);
            if (isset(self::PHONE_PREFIXES[$prefix])) {
                return self::PHONE_PREFIXES[$prefix];
            }
        }

        return null;
    }

    // ── Profile upsert ───────────────────────────────────────

    private function upsertProfile(
        MetaUserData $userData,
        string $pixelId,
        ?string $sourceDomain,
        int $matchQuality,
        ?string $visitorId = null,
    ): void {
        try {
            $identifiers = $this->extractIdentifiers($userData, $visitorId);

            // Need at least one identifier to store a profile
            if (! array_filter($identifiers)) {
                return;
            }

            $profile = UserProfile::findByIdentifiers($identifiers, $pixelId);

            if (! $profile) {
                $profile = new UserProfile();
                $profile->pixel_id = $pixelId;
                $profile->source_domain = $sourceDomain;
                $profile->first_seen_at = now();
            }

            $hashedData = $this->extractHashedPii($userData);
            $hashedData['fbp'] = $userData->fbp;
            $hashedData['fbc'] = $userData->fbc;

            // Store raw visitor_id for future lookups
            if ($visitorId) {
                $hashedData['visitor_id'] = $visitorId;
            }

            $profile->mergeUserData($hashedData);
            $profile->match_quality = $matchQuality;
            $profile->save();
        } catch (\Throwable $e) {
            Log::debug('UserProfile upsert failed', ['error' => $e->getMessage()]);
        }
    }

    // ── Match quality scoring ────────────────────────────────

    public function calculateScore(MetaUserData $userData): int
    {
        $score = 0;

        foreach (self::WEIGHTS as $field => $weight) {
            if (! empty($userData->{$field})) {
                $score += $weight;
            }
        }

        // Bonus for multi-value (Meta can match against any)
        if (! empty($userData->em_multi)) {
            $score += min(count($userData->em_multi) * 3, 9);
        }
        if (! empty($userData->ph_multi)) {
            $score += min(count($userData->ph_multi) * 3, 9);
        }

        // Bonus for having address components together (more valuable combined)
        $addressFields = array_filter([$userData->ct, $userData->st, $userData->zp, $userData->country]);
        if (count($addressFields) >= 3) {
            $score += 5;
        }

        return min($score, 100);
    }

    // ── Match quality logging ────────────────────────────────

    private function logMatchQuality(
        string $pixelId,
        string $eventName,
        ?string $sourceDomain,
        MetaUserData $userData,
        int $score,
        bool $wasEnriched,
        int $scoreBefore,
        ?string $enrichmentSource,
    ): void {
        try {
            MatchQualityLog::create([
                'pixel_id' => $pixelId,
                'event_name' => $eventName,
                'source_domain' => $sourceDomain,
                'score' => $score,
                'has_em' => ! empty($userData->em),
                'has_ph' => ! empty($userData->ph),
                'has_fn' => ! empty($userData->fn),
                'has_ln' => ! empty($userData->ln),
                'has_external_id' => ! empty($userData->external_id),
                'has_fbp' => ! empty($userData->fbp),
                'has_fbc' => ! empty($userData->fbc),
                'has_ip' => ! empty($userData->client_ip_address),
                'has_ua' => ! empty($userData->client_user_agent),
                'has_address' => ! empty($userData->ct) || ! empty($userData->st)
                    || ! empty($userData->zp) || ! empty($userData->country),
                'was_enriched' => $wasEnriched,
                'score_before_enrichment' => $scoreBefore,
                'enrichment_source' => $enrichmentSource,
                'event_date' => now()->toDateString(),
            ]);
        } catch (\Throwable $e) {
            Log::debug('Match quality log failed', ['error' => $e->getMessage()]);
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    private function extractIdentifiers(MetaUserData $userData, ?string $visitorId = null): array
    {
        return [
            'external_id' => $userData->external_id,
            'em' => $userData->em,
            'ph' => $userData->ph,
            'visitor_id' => $visitorId,
            'fbp' => $userData->fbp,
        ];
    }

    private function extractHashedPii(MetaUserData $userData): array
    {
        $result = [];
        $fields = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];

        foreach ($fields as $field) {
            if (! empty($userData->{$field})) {
                $result[$field] = $userData->{$field};
            }
        }

        if (! empty($userData->em_multi)) {
            $result['em_multi'] = $userData->em_multi;
        }
        if (! empty($userData->ph_multi)) {
            $result['ph_multi'] = $userData->ph_multi;
        }

        return $result;
    }

    /**
     * Clone MetaUserData with a single field changed.
     */
    private function withField(MetaUserData $userData, string $field, mixed $value): MetaUserData
    {
        $clone = clone $userData;
        $clone->{$field} = $value;

        return $clone;
    }
}
