<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('pixel_id')->constrained('pixels')->cascadeOnDelete();
            $table->string('retailer_id');
            $table->string('title');
            $table->text('description')->nullable();
            $table->text('url');                                 // product page URL
            $table->text('image_url');                           // main image URL
            $table->json('additional_image_urls')->nullable();
            $table->decimal('price', 10, 2);
            $table->decimal('sale_price', 10, 2)->nullable();
            $table->string('currency', 3)->default('USD');
            $table->string('availability')->default('in stock'); // in stock, out of stock, preorder
            $table->string('brand')->nullable();
            $table->string('category')->nullable();              // Google product category
            $table->string('condition')->default('new');         // new, refurbished, used
            $table->string('gtin')->nullable();                  // Global Trade Item Number
            $table->string('mpn')->nullable();                   // Manufacturer Part Number
            $table->string('custom_label_0')->nullable();
            $table->string('custom_label_1')->nullable();
            $table->string('custom_label_2')->nullable();
            $table->string('custom_label_3')->nullable();
            $table->string('custom_label_4')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('retailer_id');
            $table->index(['pixel_id', 'is_active']);
            $table->index(['retailer_id', 'pixel_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_products');
    }
};
