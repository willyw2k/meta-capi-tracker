<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\MatchQualityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Match Quality Analytics Controller
 *
 * Provides match quality insights for monitoring and optimization.
 * Tracks enrichment impact, field coverage, per-event/domain breakdowns.
 */
final readonly class MatchQualityController
{
    /**
     * GET /api/v1/track/match-quality?pixel_id=xxx&days=30
     */
    public function __invoke(Request $request): JsonResponse
    {
        $pixelId = $request->query('pixel_id');
        $days = min((int) $request->query('days', 30), 90);
        $since = now()->subDays($days)->toDateString();

        $query = MatchQualityLog::query()->where('event_date', '>=', $since);

        if ($pixelId) {
            $query->where('pixel_id', $pixelId);
        }

        $total = $query->count();

        if ($total === 0) {
            return response()->json([
                'total_events' => 0,
                'message' => 'No match quality data found for the specified period.',
            ]);
        }

        // ── Overall scores ──────────────────────────────────

        $overall = (clone $query)->selectRaw('
            AVG(score) as avg_score,
            MIN(score) as min_score,
            MAX(score) as max_score,
            SUM(CASE WHEN score < 21 THEN 1 ELSE 0 END) as poor,
            SUM(CASE WHEN score BETWEEN 21 AND 40 THEN 1 ELSE 0 END) as fair,
            SUM(CASE WHEN score BETWEEN 41 AND 60 THEN 1 ELSE 0 END) as good,
            SUM(CASE WHEN score BETWEEN 61 AND 80 THEN 1 ELSE 0 END) as great,
            SUM(CASE WHEN score > 80 THEN 1 ELSE 0 END) as excellent
        ')->first();

        // ── Field coverage ──────────────────────────────────

        $coverage = (clone $query)->selectRaw('
            AVG(has_em) * 100 as em_pct,
            AVG(has_ph) * 100 as ph_pct,
            AVG(has_fn) * 100 as fn_pct,
            AVG(has_ln) * 100 as ln_pct,
            AVG(has_external_id) * 100 as external_id_pct,
            AVG(has_fbp) * 100 as fbp_pct,
            AVG(has_fbc) * 100 as fbc_pct,
            AVG(has_ip) * 100 as ip_pct,
            AVG(has_ua) * 100 as ua_pct,
            AVG(has_address) * 100 as address_pct
        ')->first();

        // ── Enrichment impact ───────────────────────────────

        $enrichment = (clone $query)->selectRaw('
            SUM(CASE WHEN was_enriched THEN 1 ELSE 0 END) as enriched_count,
            AVG(CASE WHEN was_enriched THEN score - score_before_enrichment ELSE NULL END) as avg_score_lift,
            AVG(CASE WHEN was_enriched THEN score_before_enrichment ELSE NULL END) as avg_score_before,
            AVG(CASE WHEN was_enriched THEN score ELSE NULL END) as avg_score_after
        ')->first();

        // ── Per event type ──────────────────────────────────

        $byEvent = (clone $query)
            ->select('event_name')
            ->selectRaw('COUNT(*) as count, AVG(score) as avg_score')
            ->groupBy('event_name')
            ->orderByDesc('count')
            ->limit(20)
            ->get();

        // ── Per domain ──────────────────────────────────────

        $byDomain = (clone $query)
            ->select('source_domain')
            ->selectRaw('COUNT(*) as count, AVG(score) as avg_score')
            ->whereNotNull('source_domain')
            ->groupBy('source_domain')
            ->orderByDesc('count')
            ->limit(20)
            ->get();

        // ── Daily trend ─────────────────────────────────────

        $daily = (clone $query)
            ->select('event_date')
            ->selectRaw('COUNT(*) as count, AVG(score) as avg_score, SUM(CASE WHEN was_enriched THEN 1 ELSE 0 END) as enriched')
            ->groupBy('event_date')
            ->orderBy('event_date')
            ->get();

        // ── Recommendations ─────────────────────────────────

        $avgScore = (int) round((float) $overall->avg_score);
        $enrichedPct = $total > 0 ? round(((int) $enrichment->enriched_count / $total) * 100) : 0;

        return response()->json([
            'period_days' => $days,
            'total_events' => $total,
            'overall' => [
                'avg_score' => round((float) $overall->avg_score, 1),
                'min_score' => (int) $overall->min_score,
                'max_score' => (int) $overall->max_score,
                'tier' => $this->scoreTier($avgScore),
                'distribution' => [
                    'poor' => (int) $overall->poor,
                    'fair' => (int) $overall->fair,
                    'good' => (int) $overall->good,
                    'great' => (int) $overall->great,
                    'excellent' => (int) $overall->excellent,
                ],
            ],
            'field_coverage' => [
                'em' => round((float) $coverage->em_pct, 1),
                'ph' => round((float) $coverage->ph_pct, 1),
                'fn' => round((float) $coverage->fn_pct, 1),
                'ln' => round((float) $coverage->ln_pct, 1),
                'external_id' => round((float) $coverage->external_id_pct, 1),
                'fbp' => round((float) $coverage->fbp_pct, 1),
                'fbc' => round((float) $coverage->fbc_pct, 1),
                'ip' => round((float) $coverage->ip_pct, 1),
                'ua' => round((float) $coverage->ua_pct, 1),
                'address' => round((float) $coverage->address_pct, 1),
            ],
            'enrichment' => [
                'enriched_events' => (int) $enrichment->enriched_count,
                'enriched_pct' => $enrichedPct,
                'avg_score_lift' => round((float) ($enrichment->avg_score_lift ?? 0), 1),
                'avg_score_before' => round((float) ($enrichment->avg_score_before ?? 0), 1),
                'avg_score_after' => round((float) ($enrichment->avg_score_after ?? 0), 1),
            ],
            'by_event' => $byEvent->map(fn ($r) => [
                'event_name' => $r->event_name,
                'count' => $r->count,
                'avg_score' => round((float) $r->avg_score, 1),
                'tier' => $this->scoreTier((int) round((float) $r->avg_score)),
            ]),
            'by_domain' => $byDomain->map(fn ($r) => [
                'domain' => $r->source_domain,
                'count' => $r->count,
                'avg_score' => round((float) $r->avg_score, 1),
                'tier' => $this->scoreTier((int) round((float) $r->avg_score)),
            ]),
            'daily_trend' => $daily->map(fn ($r) => [
                'date' => $r->event_date,
                'count' => $r->count,
                'avg_score' => round((float) $r->avg_score, 1),
                'enriched' => $r->enriched,
            ]),
            'recommendations' => $this->recommendations($avgScore, $coverage, (int) $enrichedPct),
        ]);
    }

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

    private function recommendations(int $avgScore, object $cov, int $enrichedPct): array
    {
        $recs = [];

        if ($cov->em_pct < 30) {
            $recs[] = ['priority' => 'high', 'field' => 'em', 'message' => "Email coverage is {$cov->em_pct}%. Enable form auto-capture or call identify() on login."];
        }
        if ($cov->ph_pct < 20) {
            $recs[] = ['priority' => 'high', 'field' => 'ph', 'message' => "Phone coverage is {$cov->ph_pct}%. Capture from registration/checkout forms."];
        }
        if ($cov->fbp_pct < 70) {
            $recs[] = ['priority' => 'medium', 'field' => 'fbp', 'message' => "_fbp present on only {$cov->fbp_pct}% of events. Ensure Cookie Keeper is enabled."];
        }
        if ($cov->fn_pct < 15 && $cov->ln_pct < 15 && $avgScore < 60) {
            $recs[] = ['priority' => 'medium', 'field' => 'fn/ln', 'message' => 'Name data rarely captured. Enable form auto-capture.'];
        }
        if ($enrichedPct > 0) {
            $recs[] = ['priority' => 'info', 'field' => 'enrichment', 'message' => "Server-side enrichment improving {$enrichedPct}% of events."];
        }
        if ($avgScore >= 70 && empty($recs)) {
            $recs[] = ['priority' => 'info', 'field' => 'overall', 'message' => 'Match quality is strong. Monitor daily trend for regressions.'];
        }

        return $recs;
    }
}
