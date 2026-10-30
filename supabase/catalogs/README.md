# Sourced material catalogs

`lemona-2026-10-30.json` contains **42 catalog products** researched against public LEMONA Latvija product pages and catalog listings on **2026-10-30**. Each product carries its supplier URL and verification date. Mean Well manufacturer documents supplement the supplier pages where series names round the rated output power.

This is a product-identity and specification snapshot. It does not contain supplier stock, purchase prices, availability, delivery promises or live synchronization. A retrieved page may itself be an indexed snapshot. Recheck the linked supplier page when purchasing.

## Coverage and application contract

| Family | Count | Brands | Canonical picker category |
| --- | ---: | --- | --- |
| Power supplies | 12 | MEAN WELL | `PSU_MEANWELL` |
| LED strips | 8 | LED line, AKTO | `LED_STRIP` |
| LED modules | 2 | AKTO, LEMLUX | `LED_MODULE` |
| Cables | 6 | Lietkabelis | `WIRE` |
| Lever connectors | 3 | WAGO | `LED_ACCESSORY` |
| PLA filament | 3 | The Filament Spectrum, Fiberlogy | `FDM_PLA` |
| PETG filament | 2 | The Filament Spectrum | `FDM_PETG` |
| ABS / ABS+ filament | 2 | GEMBIRD, Rosa3D | `FDM_ABS` |
| ASA filament | 1 | Fiberlogy | `FDM_ASA` |
| TPU filament | 1 | Rosa3D | `FDM_TPU` |
| Photopolymer resin | 2 | Anycubic | `RESIN_ANYCUBIC` |

The migration writes `public.materials`, the canonical catalog/inventory table introduced by `20260217000000_unify_materials_inventory.sql`. It does not write the retired `inventory_items` table. Existing API and material pickers already consume these category values. Electronics use section `electronics`; filaments and resins use `3dprinting`.

Non-sheet products have an explicit empty `thickness_options` list. Filament diameter is `metadata.diameter_mm`, not a selectable sheet thickness. New cable and most LED-strip records use `m`; the AKTO `AFL-60B14424M-830` 5 m reel uses `roll`. Filament spools/refills and resin packages use `PCS`, with confirmed net weight in metadata. The current canonical stock column is an integer: this seed does not change stock precision or introduce fractional stock accounting.

## Identity, source and specification fields

`code` and the initial internal `sku` use the supplier-facing product code. `metadata.brand`, `model`, and `short_name` retain the specific product identity, so profile badges and assistant catalog results can show the selected model. `manufacturer_part_number` appears only where confirmed. `supplier_product_code` is the supplier's displayed product code; `supplier_sku` is populated only where the separate numeric LEMONA SKU was verified.

Every product includes `supplier`, `source_url`, `source_kind`, `verified_at`, and `catalog_seed`. `source_kind` distinguishes a direct `product_page` from a `catalog_listing`. `manufacturer_source_url` links the supplementary primary manufacturer document where used. `data_notes` records conflicts and important omissions rather than guessing a value.

Confirmed numeric values use explicit units in their keys: `voltage_v`, `current_a`, `power_w`, `watts_per_m`, `color_temperature_k`, `leds_per_m`, `length_m`, `wire_cross_section_mm2`, `diameter_mm`, and `weight_kg`. `length_m` describes a confirmed package/reel length, not the stock quantity. Cable and connector metadata include conductor/connection counts and applicable cross-section ranges. LED metadata distinguishes COB, SMD type, RGB/white variants and WS2811 control where verified. Equivalent human-readable fields such as `voltage`, `wattage`, `ipRating`, `diameter` and `weight` populate the existing admin form.

The admin form merges edits into existing metadata, preserving source links, product identity and custom fields. If a visible free-text specification is changed or cleared, its old numeric equivalent is removed instead of leaving a contradictory assistant-visible value. Renaming a product updates its badge label. A source link is rendered only for HTTPS URLs on `lemona.lv` or `www.lemona.lv` without credentials or nonstandard ports.

## Evidence limits and deliberate omissions

- Mean Well series labels are not necessarily rated output watts. The seed uses confirmed ratings, including LRS-100N2-12 **102 W**, LRS-100N2-24 **108 W**, LRS-150-24 **156 W**, LRS-350-12 **348 W**, LRS-350-24 **350.4 W**, XLG-200-12-A **192 W** and XLG-200-24-A **199.2 W**. Refer to the manufacturer URLs in those rows. No dimming capability is inferred from an `A` suffix.
- LED line `476845` has inconsistent color temperature, luminous flux and width across the supplier's title and tables. Those values are absent. Its confirmed COB density, voltage, power per metre and IP rating remain usable.
- AKTO `HM-5050-60-RGBHTm24` has a different model string in its description. The product code and specification table establish identity; description dimensions are omitted.
- `PLA-tWHI-175-1-TF` has no independently confirmed diameter in the retrieved fields. The seed does not decode a diameter from the SKU.
- Rosa3D `TPU96A-BLACK-175-05R` is titled 96A but a description section says 85A. Numeric hardness is omitted.
- Anycubic `SPTHG-10-IPO-01` has inconsistent family/property text. Mechanical properties and exposure settings are omitted.
- Mean Well `LRS-350-12` and Anycubic `SCRWH-10-IPO-01` are linked to verified supplier catalog listings, not invented direct product URLs. The latter includes identity and color only; package weight, exposure settings and mechanical properties remain unknown.
- Prices, supplier inventory, numerical color swatches and unsupported dimensions are not synthesized. Supplier pages' AI-generated descriptions are not used to introduce specifications absent from product titles, structured tables or manufacturer evidence.

## Safe import behavior

The generated migration is `../migrations/20261030000001_lemona_branded_catalog.sql`.

New records receive the catalog unit, supplier, vendor, section and grouping. The table's stock default is zero and price remains null; this initializes an unreceived catalog item and makes no assertion about supplier or physical stock.

For an existing matching `code`, the migration refreshes names, category, thickness options and sourced metadata. It retains the row ID, SKU, unit, stock, min/max stock, prices, supplier/vendor choices, location, section/group, notes, leftovers, barcode and other operational columns. Custom metadata keys are retained; source provenance describes the imported fields, not independently entered custom values. No existing rows, legacy generic selections, stock movements or order references are deleted or rewritten.

The migration checks the canonical schema before writing and aborts the complete transaction on a SKU held under another material code or a conflicting known brand. Such a collision requires reviewing the existing identity; the seed does not silently consolidate inventory. A repeated import with the same source data performs no updates, including `updated_at`.

Do not edit this migration after it has been applied. A later supplier refresh should be a new dated manifest and migration. This repository change does not apply itself to a live database. Review the target's migration history and schema through the normal deployment process before applying it. Do not run old `scripts/run-seeds.js` / `run-new-seeds.js` paths: they refer to retired seed locations.

## Reproduce verification

From the repository root:

```sh
node scripts/catalog/generate-lemona-seed.mjs --check
node packages/vitest/bin.js tests/unit/lemona-catalog.test.ts
```

To regenerate the SQL while reviewing an unapplied catalog change:

```sh
node scripts/catalog/generate-lemona-seed.mjs
```

The optional integration check executes the actual migration in an isolated in-memory PostgreSQL engine, using table/column definitions extracted from the canonical migrations. It checks first import, product units, preservation of operational fields/custom metadata/legacy rows, repeat-import idempotence, collision rollback and incompatible-schema rejection. It never contacts Supabase or reads database credentials. Install PGlite outside the repository and point the verifier at it:

```sh
npm install --prefix /tmp/oms-catalog-qa --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.13
OMS_CATALOG_PGLITE_MODULE=/tmp/oms-catalog-qa/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/catalog/verify-lemona-seed.mjs
```

These isolated checks verify SQL behavior against the checked-in schema. They are not evidence that a live environment has the same schema or that the migration has been deployed.
