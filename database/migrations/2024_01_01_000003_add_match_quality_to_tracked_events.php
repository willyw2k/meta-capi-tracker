<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tracked_events', function (Blueprint $table) {
            $table->unsignedTinyInteger('match_quality')
                ->nullable()
                ->after('custom_data')
                ->comment('Match quality score 0-100');

            $table->index('match_quality');
        });
    }

    public function down(): void
    {
        Schema::table('tracked_events', function (Blueprint $table) {
            $table->dropIndex(['match_quality']);
            $table->dropColumn('match_quality');
        });
    }
};
