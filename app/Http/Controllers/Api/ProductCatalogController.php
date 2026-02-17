<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\CatalogProduct;
use App\Models\Pixel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final readonly class ProductCatalogController
{
    /**
     * GET /api/v1/catalog/{pixelId}/feed.xml
     *
     * Returns an RSS 2.0 XML feed in Meta's product catalog format.
     */
    public function feed(Request $request, string $pixelId): Response
    {
        $pixel = Pixel::query()
            ->where('pixel_id', $pixelId)
            ->active()
            ->first();

        if (! $pixel) {
            return response(
                '<?xml version="1.0" encoding="UTF-8"?><error>Pixel not found</error>',
                404,
                ['Content-Type' => 'application/xml'],
            );
        }

        $products = CatalogProduct::query()
            ->forPixelId($pixel->id)
            ->active()
            ->orderBy('title')
            ->get();

        $xml = $this->buildFeedXml($products, $pixel);

        return response($xml, 200, [
            'Content-Type' => 'application/xml',
        ]);
    }

    /**
     * GET /api/v1/catalog/{pixelId}/products
     *
     * Returns a JSON listing of active catalog products for the pixel.
     */
    public function show(Request $request, string $pixelId): JsonResponse
    {
        $pixel = Pixel::query()
            ->where('pixel_id', $pixelId)
            ->active()
            ->first();

        if (! $pixel) {
            return response()->json([
                'success' => false,
                'error' => 'Pixel not found.',
            ], 404);
        }

        $products = CatalogProduct::query()
            ->forPixelId($pixel->id)
            ->active()
            ->orderBy('title')
            ->get();

        return response()->json([
            'success' => true,
            'pixel_id' => $pixel->pixel_id,
            'total' => $products->count(),
            'products' => $products,
        ]);
    }

    /**
     * Build an RSS 2.0 XML feed with the g: namespace for Google Merchant fields.
     *
     * @param  \Illuminate\Database\Eloquent\Collection<int, CatalogProduct>  $products
     */
    private function buildFeedXml($products, Pixel $pixel): string
    {
        $xml = new \XMLWriter;
        $xml->openMemory();
        $xml->setIndent(true);
        $xml->setIndentString('  ');

        $xml->startDocument('1.0', 'UTF-8');
        $xml->startElement('rss');
        $xml->writeAttribute('version', '2.0');
        $xml->writeAttribute('xmlns:g', 'http://base.google.com/ns/1.0');

        $xml->startElement('channel');
        $xml->writeElement('title', "Product Catalog - {$pixel->name}");
        $xml->writeElement('link', config('app.url'));
        $xml->writeElement('description', "Meta product catalog feed for pixel {$pixel->pixel_id}");

        foreach ($products as $product) {
            $this->writeProductItem($xml, $product);
        }

        $xml->endElement(); // channel
        $xml->endElement(); // rss

        return $xml->outputMemory();
    }

    /**
     * Write a single <item> element for a catalog product.
     */
    private function writeProductItem(\XMLWriter $xml, CatalogProduct $product): void
    {
        $xml->startElement('item');

        $xml->writeElement('g:id', $product->retailer_id);
        $xml->writeElement('g:title', $product->title);

        if ($product->description !== null) {
            $xml->writeElement('g:description', $product->description);
        }

        $xml->writeElement('g:link', $product->url);
        $xml->writeElement('g:image_link', $product->image_url);

        if (! empty($product->additional_image_urls)) {
            foreach ($product->additional_image_urls as $additionalUrl) {
                $xml->writeElement('g:additional_image_link', $additionalUrl);
            }
        }

        $xml->writeElement('g:price', "{$product->price} {$product->currency}");

        if ($product->sale_price !== null) {
            $xml->writeElement('g:sale_price', "{$product->sale_price} {$product->currency}");
        }

        $xml->writeElement('g:availability', $product->availability);

        if ($product->brand !== null) {
            $xml->writeElement('g:brand', $product->brand);
        }

        if ($product->category !== null) {
            $xml->writeElement('g:google_product_category', $product->category);
        }

        $xml->writeElement('g:condition', $product->condition);

        if ($product->gtin !== null) {
            $xml->writeElement('g:gtin', $product->gtin);
        }

        if ($product->mpn !== null) {
            $xml->writeElement('g:mpn', $product->mpn);
        }

        for ($i = 0; $i <= 4; $i++) {
            $label = $product->{"custom_label_{$i}"};
            if ($label !== null) {
                $xml->writeElement("g:custom_label_{$i}", $label);
            }
        }

        $xml->endElement(); // item
    }
}
