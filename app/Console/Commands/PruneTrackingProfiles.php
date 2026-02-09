<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\MatchQualityLog;
use App\Models\UserProfile;
use Illuminate\Console\Command;

/**
 * Prune old Advanced Matching data.
 *
 * Schedule daily: $schedule->command('tracking:prune-profiles')->daily();
 */
final class PruneTrackingProfiles extends Command
{
    protected $signature = 'tracking:prune-profiles
        {--profile-days= : Profile retention in days (default: config)}
        {--log-days=90 : Match quality log retention in days}
        {--dry-run : Show counts without deleting}';

    protected $description = 'Prune old user profiles and match quality logs';

    public function handle(): int
    {
        $profileDays = (int) ($this->option('profile-days')
            ?? config('meta-capi.advanced_matching.profile_retention_days', 365));
        $logDays = (int) $this->option('log-days');
        $dryRun = (bool) $this->option('dry-run');

        // Prune old profiles
        $profileQuery = UserProfile::where('last_seen_at', '<', now()->subDays($profileDays));
        $profileCount = $profileQuery->count();

        if (! $dryRun && $profileCount > 0) {
            $profileQuery->delete();
        }

        $this->info(($dryRun ? '[DRY RUN] Would delete' : 'Deleted')
            . " {$profileCount} profiles older than {$profileDays} days.");

        // Prune old match quality logs
        $logQuery = MatchQualityLog::where('event_date', '<', now()->subDays($logDays));
        $logCount = $logQuery->count();

        if (! $dryRun && $logCount > 0) {
            $logQuery->delete();
        }

        $this->info(($dryRun ? '[DRY RUN] Would delete' : 'Deleted')
            . " {$logCount} match quality logs older than {$logDays} days.");

        return self::SUCCESS;
    }
}
