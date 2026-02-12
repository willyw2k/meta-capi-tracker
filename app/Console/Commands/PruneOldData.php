<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\EventStatus;
use App\Models\MatchQualityLog;
use App\Models\TrackedEvent;
use App\Models\UserProfile;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class PruneOldData extends Command
{
    protected $signature = 'tracker:prune
        {--dry-run : Show what would be deleted without actually deleting}';

    protected $description = 'Prune old tracked events, match quality logs, and stale user profiles based on retention settings';

    public function handle(): int
    {
        $dryRun = $this->option('dry-run');

        if ($dryRun) {
            $this->warn('DRY RUN — no data will be deleted.');
        }

        $sentRetention = config('meta-capi.retention.sent_events', 90);
        $failedRetention = config('meta-capi.retention.failed_events', 30);
        $profileRetention = config('meta-capi.advanced_matching.profile_retention_days', 365);

        // Prune sent events
        $sentCutoff = Carbon::now()->subDays($sentRetention);
        $sentCount = TrackedEvent::where('status', EventStatus::Sent)
            ->where('created_at', '<', $sentCutoff)
            ->count();

        if (! $dryRun && $sentCount > 0) {
            TrackedEvent::where('status', EventStatus::Sent)
                ->where('created_at', '<', $sentCutoff)
                ->delete();
        }

        $this->info("  Sent events older than {$sentRetention}d: {$sentCount} " . ($dryRun ? '(would delete)' : 'deleted'));

        // Prune failed events
        $failedCutoff = Carbon::now()->subDays($failedRetention);
        $failedCount = TrackedEvent::where('status', EventStatus::Failed)
            ->where('created_at', '<', $failedCutoff)
            ->count();

        if (! $dryRun && $failedCount > 0) {
            TrackedEvent::where('status', EventStatus::Failed)
                ->where('created_at', '<', $failedCutoff)
                ->delete();
        }

        $this->info("  Failed events older than {$failedRetention}d: {$failedCount} " . ($dryRun ? '(would delete)' : 'deleted'));

        // Prune duplicate events (same as sent retention)
        $dupCount = TrackedEvent::where('status', EventStatus::Duplicate)
            ->where('created_at', '<', $sentCutoff)
            ->count();

        if (! $dryRun && $dupCount > 0) {
            TrackedEvent::where('status', EventStatus::Duplicate)
                ->where('created_at', '<', $sentCutoff)
                ->delete();
        }

        $this->info("  Duplicate events older than {$sentRetention}d: {$dupCount} " . ($dryRun ? '(would delete)' : 'deleted'));

        // Prune skipped events (same as failed retention)
        $skippedCount = TrackedEvent::where('status', EventStatus::Skipped)
            ->where('created_at', '<', $failedCutoff)
            ->count();

        if (! $dryRun && $skippedCount > 0) {
            TrackedEvent::where('status', EventStatus::Skipped)
                ->where('created_at', '<', $failedCutoff)
                ->delete();
        }

        $this->info("  Skipped events older than {$failedRetention}d: {$skippedCount} " . ($dryRun ? '(would delete)' : 'deleted'));

        // Prune match quality logs
        $logsCutoff = Carbon::now()->subDays($sentRetention);
        $logsCount = MatchQualityLog::where('event_date', '<', $logsCutoff)->count();

        if (! $dryRun && $logsCount > 0) {
            MatchQualityLog::where('event_date', '<', $logsCutoff)->delete();
        }

        $this->info("  Match quality logs older than {$sentRetention}d: {$logsCount} " . ($dryRun ? '(would delete)' : 'deleted'));

        // Prune stale user profiles
        $profileCutoff = Carbon::now()->subDays($profileRetention);
        $profileCount = UserProfile::where('last_seen_at', '<', $profileCutoff)->count();

        if (! $dryRun && $profileCount > 0) {
            UserProfile::where('last_seen_at', '<', $profileCutoff)->delete();
        }

        $this->info("  User profiles not seen in {$profileRetention}d: {$profileCount} " . ($dryRun ? '(would delete)' : 'deleted'));

        $total = $sentCount + $failedCount + $dupCount + $skippedCount + $logsCount + $profileCount;
        $this->newLine();
        $this->info("Total: {$total} records " . ($dryRun ? 'would be pruned' : 'pruned') . '.');

        return self::SUCCESS;
    }
}
