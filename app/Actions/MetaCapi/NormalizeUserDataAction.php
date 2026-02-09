<?php

declare(strict_types=1);

namespace App\Actions\MetaCapi;

use App\Data\MetaUserData;

/**
 * Normalize User Data Action
 *
 * Applies Meta-specific normalization rules to each PII field
 * before hashing. This ensures maximum match quality by following
 * Meta's exact requirements per parameter.
 *
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */
final readonly class NormalizeUserDataAction
{
    public function __invoke(array $rawData): MetaUserData
    {
        $normalized = [];

        // Email: trim, lowercase
        $normalized['em'] = $this->normalizeEmail($rawData['em'] ?? $rawData['email'] ?? null);

        // Phone: digits only, with country code, no +
        $normalized['ph'] = $this->normalizePhone($rawData['ph'] ?? $rawData['phone'] ?? null);

        // First name: lowercase, alpha only, remove titles
        $normalized['fn'] = $this->normalizeName($rawData['fn'] ?? $rawData['first_name'] ?? null);

        // Last name: same rules as first name
        $normalized['ln'] = $this->normalizeName($rawData['ln'] ?? $rawData['last_name'] ?? null);

        // Gender: single lowercase letter, 'm' or 'f'
        $normalized['ge'] = $this->normalizeGender($rawData['ge'] ?? $rawData['gender'] ?? null);

        // Date of birth: YYYYMMDD format
        $normalized['db'] = $this->normalizeDateOfBirth($rawData['db'] ?? $rawData['date_of_birth'] ?? $rawData['birthday'] ?? null);

        // City: lowercase, no punctuation, no digits
        $normalized['ct'] = $this->normalizeCity($rawData['ct'] ?? $rawData['city'] ?? null);

        // State: 2-letter code, lowercase
        $normalized['st'] = $this->normalizeState($rawData['st'] ?? $rawData['state'] ?? null);

        // Zip: first 5 digits for US, no spaces
        $normalized['zp'] = $this->normalizeZip($rawData['zp'] ?? $rawData['zip'] ?? $rawData['postal_code'] ?? $rawData['zipcode'] ?? null);

        // Country: 2-letter ISO, lowercase
        $normalized['country'] = $this->normalizeCountry($rawData['country'] ?? $rawData['country_code'] ?? null);

        // External ID: trim only
        $normalized['external_id'] = $this->normalizeExternalId($rawData['external_id'] ?? null);

        // Non-PII fields (pass through, no hashing needed)
        $nonPii = [
            'client_ip_address' => $rawData['client_ip_address'] ?? $rawData['ip'] ?? null,
            'client_user_agent' => $rawData['client_user_agent'] ?? $rawData['user_agent'] ?? null,
            'fbc' => $rawData['fbc'] ?? null,
            'fbp' => $rawData['fbp'] ?? null,
            'subscription_id' => $rawData['subscription_id'] ?? null,
            'fb_login_id' => $rawData['fb_login_id'] ?? null,
            'lead_id' => $rawData['lead_id'] ?? null,
        ];

        // Hash PII fields that aren't already hashed
        foreach ($normalized as $field => &$value) {
            if ($value === null) {
                continue;
            }
            $value = MetaUserData::hashValue($value);
        }
        unset($value);

        return new MetaUserData(
            em: $normalized['em'],
            ph: $normalized['ph'],
            fn: $normalized['fn'],
            ln: $normalized['ln'],
            ge: $normalized['ge'],
            db: $normalized['db'],
            ct: $normalized['ct'],
            st: $normalized['st'],
            zp: $normalized['zp'],
            country: $normalized['country'],
            external_id: $normalized['external_id'],
            client_ip_address: $nonPii['client_ip_address'],
            client_user_agent: $nonPii['client_user_agent'],
            fbc: $nonPii['fbc'],
            fbp: $nonPii['fbp'],
            subscription_id: $nonPii['subscription_id'],
            fb_login_id: $nonPii['fb_login_id'],
            lead_id: $nonPii['lead_id'],
        );
    }

    // ── Per-field normalizers ─────────────────────────────────

    private function normalizeEmail(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_strtolower(trim($value));

        if (! filter_var($value, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        return $value;
    }

    /**
     * Phone: remove all non-digit chars. Meta requires digits only with country code.
     */
    private function normalizePhone(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        // Strip non-digits
        $digits = preg_replace('/\D/', '', $value);

        // Remove leading 00 (international prefix)
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }

        // Must be at least 7 digits
        if (strlen($digits) < 7) {
            return null;
        }

        return $digits;
    }

    /**
     * Name: lowercase, alpha + spaces only, remove titles/suffixes.
     */
    private function normalizeName(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_strtolower(trim($value));

        // Remove common titles
        $value = (string) preg_replace('/^(mr|mrs|ms|miss|dr|prof|sir|dame)\.?\s*/i', '', $value);

        // Remove suffixes
        $value = (string) preg_replace('/\s*(jr|sr|ii|iii|iv|phd|md|esq)\.?\s*$/i', '', $value);

        // Transliterate accented characters
        if (function_exists('transliterator_transliterate')) {
            $value = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $value);
        }

        // Keep only alpha and spaces
        $value = (string) preg_replace('/[^a-z\s]/', '', $value);

        return trim($value) ?: null;
    }

    /**
     * Gender: 'm' or 'f' only.
     */
    private function normalizeGender(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_strtolower(trim($value));

        return match (true) {
            str_starts_with($value, 'm'), $value === 'male', $value === 'pria', $value === 'laki-laki' => 'm',
            str_starts_with($value, 'f'), $value === 'female', $value === 'wanita', $value === 'perempuan' => 'f',
            default => null,
        };
    }

    /**
     * Date of birth: YYYYMMDD string.
     */
    private function normalizeDateOfBirth(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = trim($value);

        // Already YYYYMMDD
        if (preg_match('/^\d{8}$/', $value)) {
            return $value;
        }

        // Try standard date formats
        $formats = ['Y-m-d', 'm/d/Y', 'd/m/Y', 'm-d-Y', 'd-m-Y', 'Y/m/d', 'Ymd'];
        foreach ($formats as $format) {
            $date = \DateTimeImmutable::createFromFormat($format, $value);
            if ($date && $date->format($format) === $value) {
                return $date->format('Ymd');
            }
        }

        // Try Carbon as last resort
        try {
            $date = new \DateTimeImmutable($value);
            $formatted = $date->format('Ymd');
            // Sanity check: year between 1900-2020
            $year = (int) $date->format('Y');
            if ($year >= 1900 && $year <= 2020) {
                return $formatted;
            }
        } catch (\Exception) {
            // Invalid date
        }

        return null;
    }

    /**
     * City: lowercase, alpha + spaces only.
     */
    private function normalizeCity(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_strtolower(trim($value));

        if (function_exists('transliterator_transliterate')) {
            $value = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $value);
        }

        $value = (string) preg_replace('/[^a-z\s]/', '', $value);

        return trim($value) ?: null;
    }

    /**
     * State: 2-letter code, lowercase.
     */
    private function normalizeState(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_strtolower(trim($value));

        // If 2-letter code, use directly
        if (preg_match('/^[a-z]{2}$/', $value)) {
            return $value;
        }

        // Common US state name → code mapping
        $states = [
            'alabama' => 'al', 'alaska' => 'ak', 'arizona' => 'az', 'arkansas' => 'ar',
            'california' => 'ca', 'colorado' => 'co', 'connecticut' => 'ct', 'delaware' => 'de',
            'florida' => 'fl', 'georgia' => 'ga', 'hawaii' => 'hi', 'idaho' => 'id',
            'illinois' => 'il', 'indiana' => 'in', 'iowa' => 'ia', 'kansas' => 'ks',
            'kentucky' => 'ky', 'louisiana' => 'la', 'maine' => 'me', 'maryland' => 'md',
            'massachusetts' => 'ma', 'michigan' => 'mi', 'minnesota' => 'mn', 'mississippi' => 'ms',
            'missouri' => 'mo', 'montana' => 'mt', 'nebraska' => 'ne', 'nevada' => 'nv',
            'new hampshire' => 'nh', 'new jersey' => 'nj', 'new mexico' => 'nm', 'new york' => 'ny',
            'north carolina' => 'nc', 'north dakota' => 'nd', 'ohio' => 'oh', 'oklahoma' => 'ok',
            'oregon' => 'or', 'pennsylvania' => 'pa', 'rhode island' => 'ri', 'south carolina' => 'sc',
            'south dakota' => 'sd', 'tennessee' => 'tn', 'texas' => 'tx', 'utah' => 'ut',
            'vermont' => 'vt', 'virginia' => 'va', 'washington' => 'wa', 'west virginia' => 'wv',
            'wisconsin' => 'wi', 'wyoming' => 'wy', 'district of columbia' => 'dc',
        ];

        return $states[$value] ?? mb_substr($value, 0, 2);
    }

    /**
     * Zip: no spaces, first 5 for US.
     */
    private function normalizeZip(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_strtolower(trim(str_replace(' ', '', $value)));

        // US zip: take first 5 digits
        if (preg_match('/^\d{5}(-\d{4})?$/', $value)) {
            return substr($value, 0, 5);
        }

        return $value ?: null;
    }

    /**
     * Country: 2-letter ISO 3166-1, lowercase.
     */
    private function normalizeCountry(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_strtolower(trim($value));

        // Already a 2-letter code
        if (preg_match('/^[a-z]{2}$/', $value)) {
            return $value;
        }

        // Common country name → code mapping
        $countries = [
            'united states' => 'us', 'usa' => 'us', 'united kingdom' => 'gb', 'uk' => 'gb',
            'canada' => 'ca', 'australia' => 'au', 'germany' => 'de', 'france' => 'fr',
            'indonesia' => 'id', 'japan' => 'jp', 'india' => 'in', 'brazil' => 'br',
            'mexico' => 'mx', 'spain' => 'es', 'italy' => 'it', 'netherlands' => 'nl',
            'singapore' => 'sg', 'malaysia' => 'my', 'philippines' => 'ph', 'thailand' => 'th',
            'vietnam' => 'vn', 'south korea' => 'kr', 'china' => 'cn', 'taiwan' => 'tw',
            'hong kong' => 'hk', 'new zealand' => 'nz', 'cambodia' => 'kh', 'turkey' => 'tr',
            'argentina' => 'ar', 'colombia' => 'co', 'chile' => 'cl', 'peru' => 'pe',
            'south africa' => 'za', 'nigeria' => 'ng', 'egypt' => 'eg', 'russia' => 'ru',
            'ukraine' => 'ua', 'poland' => 'pl', 'romania' => 'ro', 'czech republic' => 'cz',
            'switzerland' => 'ch', 'austria' => 'at', 'belgium' => 'be', 'sweden' => 'se',
            'norway' => 'no', 'denmark' => 'dk', 'finland' => 'fi', 'ireland' => 'ie',
            'portugal' => 'pt', 'saudi arabia' => 'sa', 'united arab emirates' => 'ae', 'uae' => 'ae',
        ];

        return $countries[$value] ?? (strlen($value) === 2 ? $value : null);
    }

    private function normalizeExternalId(?string $value): ?string
    {
        if ($this->isHashed($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return null;
        }

        return trim($value);
    }

    private function isHashed(?string $value): bool
    {
        return $value !== null && (bool) preg_match('/^[a-f0-9]{64}$/', $value);
    }
}
