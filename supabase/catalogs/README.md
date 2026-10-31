# Sourced material catalogs

The five additive manifests contain **128 distinct catalog products**, researched against public LEMONA Latvija sources on **2026-10-30–31**:

| Manifest | Products | Migration |
| --- | ---: | --- |
| `lemona-2026-10-30.json` | 42 | `20261030000001_lemona_branded_catalog.sql` |
| `lemona-2026-10-30-expansion.json` | 20 | `20261030000002_lemona_catalog_expansion.sql` |
| `lemona-2026-10-30-batch-3.json` | 18 | `20261030000003_lemona_catalog_batch_3.sql` |
| `lemona-2026-10-31-xlg-strips.json` | 26 | `20261031000001_lemona_xlg_strips.sql` |
| `lemona-2026-10-31-production.json` | 22 | `20261031000005_lemona_production_catalog.sql` |

The first four manifests and migrations remain byte-for-byte unchanged. Each later batch adds distinct products, all with direct Lemona.lv product-page sources. Each product carries its supplier URL and verification date. MEAN WELL, WAGO, LAPP, LEMLUX and AmeraLabs manufacturer sources supplement supplier specifications where needed. Workshop-specified aluminium sheets are documented separately in `workshop-materials.md`; they are not counted as supplier-verified Lemona products.

This is a product-identity and specification snapshot. It does not contain supplier stock, purchase prices, availability, delivery promises or live synchronization. A retrieved page may itself be an indexed snapshot. Recheck the linked supplier page when purchasing.

## Coverage and application contract

| Family | Count | Brands | Canonical picker category |
| --- | ---: | --- | --- |
| Power supplies | 27 | MEAN WELL | `PSU_MEANWELL` |
| LED strips | 46 | LED line, AKTO, LEMLUX, IPIXEL LED | `LED_STRIP` |
| Neon flex | 2 | LEMLUX, AKTO | `LED_NEON` |
| LED modules | 6 | AKTO, LEMLUX | `LED_MODULE` |
| Cables | 18 | Lietkabelis, LAPP | `WIRE` |
| Lever connectors | 5 | WAGO | `LED_ACCESSORY` |
| PLA filament | 3 | The Filament Spectrum, Fiberlogy | `FDM_PLA` |
| PETG filament | 2 | The Filament Spectrum | `FDM_PETG` |
| ABS / ABS+ / Easy ABS filament | 3 | GEMBIRD, Rosa3D, Fiberlogy | `FDM_ABS` |
| ASA filament | 2 | Fiberlogy, Rosa3D | `FDM_ASA` |
| TPU filament | 2 | Rosa3D, Fiberlogy | `FDM_TPU` |
| Other filament: PA12, PA12-CF, PP, PCTG, PC/PBT, wood composite | 7 | Fiberlogy, Rosa3D | `FDM_OTHER` |
| Photopolymer resin | 5 | Anycubic, PrimaCreator, AMERALABS | `RESIN_ANYCUBIC`, `RESIN_OTHER` |

The expansion fills functional gaps: 12 V white strips at two power levels, high-density 24 V white and tunable-white strips, side-emitting COB and neon flex; 12 V, 24 V and asymmetric edge-lighting modules; small enclosed, DIN-rail and HLG power supplies; inline and larger-conductor WAGO connectors; four- and five-core LAPP cables and 2.5 mm² installation cable; PA12-CF, FiberFlex TPU and water-washable resin. It does not inflate coverage by adding repeated colors of the same product.

The third batch adds 5 V, compact IP67, PWM-output and slim linear Mean Well supplies; 5 V and 12 V SK6812 RGBW strips, RGB+CCT COB, RGB neon and an RGBW module; two- and six-core shielded LAPP cables plus a silicone single-core reel; four different printing materials (PP, PCTG refill, PC/PBT and BioWOOD); and the AmeraLabs TGM-7 and XVN-50 resin families. Controllers and unrelated accessories are not placed in the WAGO connector picker category.

The fourth batch adds four 12 V / 24 V XLG-75 and XLG-100 models, ten AKTO SMD strips, eight LEMLUX COB strips and four LAPP H07RN-F mains cables. White-strip options include 2700, 3000, 4000, 6000 and 6500 K, plus a 2700–6500 K tunable-white strip; the catalog distinguishes IP20, IP65 and IP67 variants. Narrow 5 mm and S-shaped strips provide specific physical options. The new two-, three- and five-core rubber mains cables carry explicit `cable_application: "mains"`; signal/control and single-core wire catalog entries remain distinguishable from the sign's main cable choices.

The fifth batch adds four LPV supplies, five AKTO strips, seven LEMLUX strips, two LAPP mains cables and four printing materials. AKTO additions cover 16 W/m warm-white, narrow 5 mm neutral-white, and RGBW with fixed 3000 K or 6500 K white channels. LEMLUX additions include blue and green COB, 3000 K / 4000 K white, and distinct IP20, IP65 and D-shaped IP67 variants. The four- and five-core H07RN-F additions use 2.5 mm² conductors. Printing additions are white ASA and transparent PCTG refills from Rosa3D, plus black PA12 and transparent Easy ABS from Fiberlogy. Existing fixed-output XLG supplies remain available; higher-voltage constant-current and selectable-voltage models are not represented as interchangeable fixed 12 V / 24 V strip supplies.

The migration writes `public.materials`, the canonical catalog/inventory table introduced by `20260217000000_unify_materials_inventory.sql`. It does not write the retired `inventory_items` table. Existing API and material pickers already consume these category values. Electronics use section `electronics`; filaments and resins use `3dprinting`.

Non-sheet products have an explicit empty `thickness_options` list. Filament diameter is `metadata.diameter_mm`, not a selectable sheet thickness. New cable and most LED-strip records use `m`; the 5 m reels `AFL-60B14424M-830`, `AFLP-168B28824M-CCT` and `NF-612-12V-NW` use `roll`. The `BVV-P/3x2.5` supplier reel contains 25 m but is sold by the metre, so its unit remains `m`. Filament spools/refills and resin packages use `PCS`, with confirmed net weight or volume in metadata. The current canonical stock column is an integer: these seeds do not change stock precision or introduce fractional stock accounting.

LAPP `0049001` is purchased as a complete **100 m reel**, represented by `roll`; its article number remains a string to preserve leading zeros. In contrast, `LIYCY-2X0.75` is sold by the metre even though the supplier describes a 100 m package. The third batch's RGB neon and RGB+CCT COB are also metre purchases. `REF-PCTG-BLACK` is a 0.75 kg refill without a disposable spool.

The fourth batch's `AFL-60B144M-865`, `AFL-120B96245M-865`, `AFL-90B1106M-865`, `COB-14CCT608-24` and `COB-11CW480-24HE` are complete **5 m reels**, represented by `roll`. Its other strips are sold by the metre; a confirmed supplier reel length does not change that unit. No package length is invented for the two `HM-2835-168-96…` strips or the four H07RN-F cables. The order's entered cable length is separate from supplier packaging.

The fifth batch's six `COB-11…` products are complete **5 m reels**. Its `COB-NW480-11-24` and all five AKTO products are metre purchases. No reel length is inferred for the three RGBW AKTO variants. The two Rosa3D printing products explicitly use refill packaging. The new Fiberlogy products retain confirmed net mass and diameter, while their packaging type is omitted because it was not independently confirmed.

## Identity, source and specification fields

`code` and the initial internal `sku` use the supplier-facing product code. `metadata.brand`, `model`, and `short_name` retain the specific product identity, so profile badges and assistant catalog results can show the selected model. `manufacturer_part_number` appears only where confirmed. `supplier_product_code` is the supplier's displayed product code; `supplier_sku` is populated only where the separate LEMONA SKU was verified. Supplier SKUs remain strings, including letter prefixes and leading zeros; an unknown SKU is omitted rather than inferred from a product code.

Every product includes `supplier`, `source_url`, `source_kind`, `verified_at`, and `catalog_seed`. `source_kind` distinguishes a direct `product_page` from a `catalog_listing`. `manufacturer_source_url` links the supplementary primary manufacturer document where used. `data_notes` records conflicts and important omissions rather than guessing a value.

Confirmed numeric values use explicit units in their keys: `voltage_v`, `current_a`, `power_w`, `watts_per_m`, `color_temperature_k`, `leds_per_m`, `length_m`, `wire_cross_section_mm2`, `diameter_mm`, `weight_kg`, `volume_ml`, `width_mm`, `height_mm`, `cut_interval_mm`, and beam angles in degrees. `color_temperature_range_k` is a two-number minimum/maximum range for tunable-white strips, rather than a fabricated single color temperature. `length_m` describes a confirmed package/reel length, not the stock quantity. Cable and connector metadata include conductor/connection counts, verified cross-section ranges or `wire_cross_section_max_mm2` when only a maximum is confirmed. `mounting` identifies the DIN-rail PSU. LED metadata distinguishes COB, SMD type, RGB/white variants, asymmetric edge optics and WS2811 control where verified. Equivalent human-readable fields such as `voltage`, `wattage`, `ipRating`, `diameter` and `weight` populate the existing admin form.

`max_watts_per_m` preserves the supplier's explicit maximum-power rating for programmable strips; it is not substituted for typical consumption. `white_channel_temperature_k` and `white_channel_temperature_range_k` describe the separate fixed white channel of RGBW products. In particular, a 6000–6500 K white-channel range is not a tunable-CCT claim. `body_length_mm` describes the slim PSU housing and is kept separate from package/reel `length_m`. Changing the corresponding visible wattage, color-temperature or length field invalidates these sourced numeric values; changing only a package label does not erase physical body dimensions.

`series` preserves the supplier/manufacturer product family, including `XLG` and `LPV`. For mains cables, `rated_voltage` is the cable's insulation rating, not an assertion about the sign's operating voltage; the new LAPP supplier pages state **750 V**. `outer_diameter_range_mm` records the sourced physical outside-diameter range, and `outer_diameter_mm` is reserved for an exact outside diameter when known. Neither is inferred from conductor cross-section. `cores` and `wire_cross_section_mm2` retain the separate conductor arrangement. Human-readable `voltage` and `diameter` mirror these sourced fields for the admin form. An edit invalidates the corresponding sourced value so assistant evidence cannot retain a contradictory specification.

The admin form merges edits into existing metadata, preserving source links, product identity and custom fields. If a visible free-text specification is changed or cleared, its old numeric equivalent is removed instead of leaving a contradictory assistant-visible value. Renaming a product updates its badge label. A source link is rendered only for HTTPS URLs on `lemona.lv` or `www.lemona.lv` without credentials or nonstandard ports.

## Evidence limits and deliberate omissions

- Mean Well series labels are not necessarily rated output watts. The seed uses confirmed ratings, including LRS-100N2-12 **102 W**, LRS-100N2-24 **108 W**, LRS-150-24 **156 W**, LRS-350-12 **348 W**, LRS-350-24 **350.4 W**, XLG-200-12-A **192 W** and XLG-200-24-A **199.2 W**. Refer to the manufacturer URLs in those rows. No dimming capability is inferred from an `A` suffix.
- The expansion uses the manufacturer-confirmed **50.4 W** rating for `LRS-50-12`. `HLG-120H-24A` is **IP65**, as confirmed for the A variant; a series-wide IP67 claim would be incorrect.
- The third batch uses the manufacturer-confirmed **50.4 W**, **280 × 30 × 16.8 mm** specifications for `SLD-50-12`; the supplier rounds its power to 50 W. `PWM-60-24` has PWM-style constant-voltage output, so it is identified separately from fixed-output supplies and does not establish compatibility with an arbitrary controller or load.
- The fourth batch records `XLG-75-12-A` at **60 W**, `XLG-75-24-A` at **74.4 W**, and both 12 V / 24 V `XLG-100` variants at **96 W**, using the linked MEAN WELL specifications. It does not treat nominal family numbers as rated power or add higher-voltage constant-current variants as interchangeable strip supplies.
- The fifth batch records `LPV-35-24` at **36 W**, `LPV-100-12` at **102 W**, `LPV-100-24` at **100.8 W** and `LPV-150-24` at **151.2 W**, using linked MEAN WELL specifications rather than rounded supplier titles. The manufacturer identifies LPV for decorative/advertising display accessories and general electronics, and excludes LED lighting luminaire applications in the EU and China. This product qualification is retained in `data_notes`; the catalog alone does not establish installation suitability.
- `HM-2835-168-96NWm24` has a neutral-white English product title; the supplier's Latvian AKTO listing confirms **4000 K** for that exact code, linked as `additional_source_url`. Conflicting luminous-flux/efficacy figures in several AKTO/LEMLUX titles, descriptions and PDFs are omitted. Strip power remains **W/m**, distinct from total PSU output watts.
- The CCT option is the currently retrieved **5 m reel** `COB-14CCT608-24` (supplier SKU `455674`), with its sourced **26.31 mm** cut interval. The older by-metre `COB-CCT608-14-24` has indexed supplier evidence but its direct pages returned 404 during final verification, so that product is omitted from this batch. The two codes are not treated as the same inventory item.
- The fifth batch's `COB-11WW480-24` has **3000 K** in the current title and non-AI description, despite 2700 K in its older URL/generated description. `COB-11G480-24` is **green, IP20** in its title, non-AI description and table, despite a yellow/IP65 URL slug. Those stale slugs are retained as source addresses, not used as specifications. Ambiguous translated cut-spacing text and unsupported photometric figures are omitted.
- The three added AKTO RGBW products have a separate fixed white channel. Their **3000 K** or **6500 K** value is stored as `white_channel_temperature_k`, not a tunable range or whole-strip white temperature. No digital control IC is inferred from RGBW naming.
- LAPP H07RN-F cable entries preserve the supplier's outside-diameter ranges and **750 V** rating. They do not claim a circuit ampacity or choose a cable for a particular electrical installation. The two-core `2X1.5` variant has no earth conductor; the `3G`, `4G` and `5G` variants have a supplier-recorded yellow-green earth conductor.
- IPIXEL LED `S010060CA4SA1` and `S012060CB4SA1` store **maximum** ratings of 14 W/m and 32 W/m. Digital control must match the specified SK6812 product. The catalog does not select a controller or infer one from an RGB label.
- AmeraLabs `TGM-7-GRP-100` and `XVN-50-BLP-100` have 1 kg supplier titles alongside older 1 L URLs/descriptions. Current manufacturer pages offer kg packages, but the exact content of those supplier codes was not reconciled. Net weight and volume are both omitted, as are mechanical/exposure settings. A package must be checked with the supplier before quantity-based costing.
- BioWOOD is retained as a wood composite without inventing its carrier polymer or wood percentage. Other added polymers use the sourced material identity and net content; unsupported performance, food-contact and printing claims are omitted.
- LEMLUX `LEDM-EDGE-144W` has 1.44 W in its title/table and 1.4 W in the non-AI description. The exact power is omitted, and its metadata explains that the row alone cannot establish PSU sizing. Its 12 V, SMD3030, 6500 K, IP67 and horizontal/vertical 15°/45° optics remain confirmed.
- WAGO `221-612` includes the manufacturer-confirmed maximum cross-section of 6 mm². No conductor-specific minimum is inferred. LAPP supplier codes are retained without inventing separate numeric manufacturer part numbers or circuit ampacity.
- PrimaCreator `PCR-18260` is a **500 ml** bottle. No weight is inferred from volume because density was not verified. Fiberlogy weights use net filament content, not gross shipping weight; mechanical properties and print settings are omitted.
- LED line `476845` has inconsistent color temperature, luminous flux and width across the supplier's title and tables. Those values are absent. Its confirmed COB density, voltage, power per metre and IP rating remain usable.
- AKTO `HM-5050-60-RGBHTm24` has a different model string in its description. The product code and specification table establish identity; description dimensions are omitted.
- `PLA-tWHI-175-1-TF` has no independently confirmed diameter in the retrieved fields. The seed does not decode a diameter from the SKU.
- Rosa3D `TPU96A-BLACK-175-05R` is titled 96A but a description section says 85A. Numeric hardness is omitted.
- Anycubic `SPTHG-10-IPO-01` has inconsistent family/property text. Mechanical properties and exposure settings are omitted.
- Mean Well `LRS-350-12` and Anycubic `SCRWH-10-IPO-01` are linked to verified supplier catalog listings, not invented direct product URLs. The latter includes identity and color only; package weight, exposure settings and mechanical properties remain unknown.
- Prices, supplier inventory, numerical color swatches and unsupported dimensions are not synthesized. Supplier pages' AI-generated descriptions are not used to introduce specifications absent from product titles, structured tables or manufacturer evidence.

## Safe import behavior

The generated migrations are listed above, under `../migrations/`, in chronological order. All use the same preservation and identity-check rules.

New records receive the catalog unit, supplier, vendor, section and grouping. The table's stock default is zero and price remains null; this initializes an unreceived catalog item and makes no assertion about supplier or physical stock.

For an existing matching `code`, the migration refreshes names, category, thickness options and sourced metadata. It retains the row ID, SKU, unit, stock, min/max stock, prices, supplier/vendor choices, location, section/group, notes, leftovers, barcode and other operational columns. Custom metadata keys are retained; source provenance describes the imported fields, not independently entered custom values. No existing rows, legacy generic selections, stock movements or order references are deleted or rewritten.

The migration checks the canonical schema before writing and aborts the complete transaction on a SKU held under another material code or a conflicting known brand. Such a collision requires reviewing the existing identity; the seed does not silently consolidate inventory. A repeated import with the same source data performs no updates, including `updated_at`.

Do not edit a published/applied migration. Later catalog additions belong in a new dated manifest and migration registered in `catalogSources` in the generator. The generator enforces additive, distinct product codes across manifests and rejects a verified supplier SKU reused by another product code, including aliases within the same batch. An intentional refresh of existing products requires an explicit reviewed update migration. This repository change does not apply itself to a live database. Review the target's migration history and schema through the normal deployment process before applying it. Do not run old `scripts/run-seeds.js` / `run-new-seeds.js` paths: they refer to retired seed locations.

## Reproduce verification

From the repository root:

```sh
node scripts/catalog/generate-lemona-seed.mjs --check
node packages/vitest/bin.js tests/unit/lemona-catalog.test.ts tests/unit/lemona-catalog-expansion.test.ts tests/unit/lemona-catalog-batch-3.test.ts tests/unit/lemona-catalog-xlg-strips.test.ts tests/unit/lemona-catalog-production.test.ts
```

To generate the new SQL while reviewing an unpublished catalog change:

```sh
node scripts/catalog/generate-lemona-seed.mjs
```

The generator validates every registered manifest and checks immutable snapshots before writing anything. All five current snapshots are marked immutable and are never rewritten. Use `immutable: false` only while generating and reviewing a new unpublished entry, then mark it immutable before publishing/applying it. Add a new entry for further additions. Unit tests pin the first four manifests and SQL hashes and check that the latest SQL matches its manifest. They also check source identity, supplier-SKU alias rejection, exact rated power, selling units, temperature semantics and deliberately omitted uncertain fields.

The optional integration check executes every registered migration in an isolated in-memory PostgreSQL engine, using table/column definitions extracted from the canonical migrations. It checks sequential additive imports, every product's unit and sourced metadata, preservation of operational fields/custom metadata/legacy rows, previous-catalog preservation, repeat-import idempotence, each migration's collision rollback and incompatible-schema rejection. It never contacts Supabase or reads database credentials. Install PGlite outside the repository and point the verifier at it:

```sh
npm install --prefix /tmp/oms-catalog-qa --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.13
OMS_CATALOG_PGLITE_MODULE=/tmp/oms-catalog-qa/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/catalog/verify-lemona-seed.mjs
```

These isolated checks verify SQL behavior against the checked-in schema. They are not evidence that a live environment has the same schema or that the migration has been deployed.
