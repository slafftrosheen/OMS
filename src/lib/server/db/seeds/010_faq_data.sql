-- src/lib/server/db/seeds/010_faq_data.sql
-- Comprehensive FAQ Knowledge Base for Reclame OMS

-- ==========================================
-- PROFILE CONFIGURATION FAQs
-- ==========================================

-- Get category IDs
DO $$
DECLARE
  profile_cat_id INTEGER;
  materials_cat_id INTEGER;
  manufacturing_cat_id INTEGER;
  inventory_cat_id INTEGER;
  orders_cat_id INTEGER;
  troubleshooting_cat_id INTEGER;
BEGIN

SELECT id INTO profile_cat_id FROM faq_categories WHERE slug = 'profile-config';
SELECT id INTO materials_cat_id FROM faq_categories WHERE slug = 'materials-colors';
SELECT id INTO manufacturing_cat_id FROM faq_categories WHERE slug = 'manufacturing';
SELECT id INTO inventory_cat_id FROM faq_categories WHERE slug = 'inventory';
SELECT id INTO orders_cat_id FROM faq_categories WHERE slug = 'orders';
SELECT id INTO troubleshooting_cat_id FROM faq_categories WHERE slug = 'troubleshooting';

-- ==========================================
-- PROFILE CONFIGURATION FAQs
-- ==========================================

INSERT INTO faq_items (category_id, question_en, question_ru, question_lv, answer_en, answer_ru, answer_lv, slug, order_index, is_featured) VALUES
(profile_cat_id,
'What is the difference between Profile P7st and Profile P1?',
'В чем разница между профилем P7st и профилем P1?',
'Kāda ir atšķirība starp profilu P7st un profilu P1?',
'<p><strong>Profile P7st</strong> is a comprehensive outdoor/indoor sign profile that includes all manufacturing stages:</p>
<ul>
  <li><strong>CNC Router</strong> - Face and back milling</li>
  <li><strong>Bender</strong> - Aluminum sides bending (1.5mm standard)</li>
  <li><strong>Front</strong> - OPAL acrylic (WN071) with film application</li>
  <li><strong>Painting</strong> - RAL color frame and sides</li>
  <li><strong>Assembling</strong> - LED installation, wiring, waterproofing</li>
  <li><strong>Delivery</strong> - Final packaging and shipping</li>
</ul>
<p><strong>Profile P1</strong> is a simpler outdoor sign with fewer stages:</p>
<ul>
  <li>No CNC router stage (simpler construction)</li>
  <li>Bender for sides only</li>
  <li>Front OPAL application</li>
  <li>Basic painting</li>
  <li>Simplified assembly</li>
</ul>
<p><strong>When to use P7st:</strong> Complex signs with intricate designs, multiple layers, and full LED integration.</p>
<p><strong>When to use P1:</strong> Simpler outdoor signs with straightforward construction.</p>',
'<p><strong>Профиль P7st</strong> - это комплексный профиль для наружной/внутренней вывески, включающий все этапы производства:</p>
<ul>
  <li><strong>ЧПУ фрезер</strong> - Фрезеровка лица и спины</li>
  <li><strong>Гибка</strong> - Гибка алюминиевых боков (стандарт 1.5мм)</li>
  <li><strong>Лицо</strong> - Акрил OPAL (WN071) с нанесением пленки</li>
  <li><strong>Покраска</strong> - Покраска рамки и боков в RAL</li>
  <li><strong>Сборка</strong> - Установка LED, проводка, герметизация</li>
  <li><strong>Доставка</strong> - Финальная упаковка и отправка</li>
</ul>
<p><strong>Профиль P1</strong> - упрощенная наружная вывеска с меньшим количеством этапов:</p>
<ul>
  <li>Без этапа ЧПУ (простая конструкция)</li>
  <li>Гибка только боков</li>
  <li>Нанесение OPAL</li>
  <li>Базовая покраска</li>
  <li>Упрощенная сборка</li>
</ul>',
'<p><strong>Profils P7st</strong> ir visaptverošs profils ārtelpu/iekštelpu zīmēm ar visiem ražošanas posmiem.</p>
<p><strong>Profils P1</strong> ir vienkāršāks ārtelpu zīmes profils.</p>',
'what-is-difference-between-p7st-and-p1',
1, true),

(profile_cat_id,
'How do I choose the correct OPAL thickness for Profile P3?',
'Как выбрать правильную толщину OPAL для профиля P3?',
'Kā izvēlēties pareizo OPAL biezumu profilam P3?',
'<p>Profile P3 (Acrylic Channel) supports the following OPAL thicknesses:</p>
<table>
  <thead>
    <tr><th>Thickness</th><th>Use Case</th><th>Milling Depth</th></tr>
  </thead>
  <tbody>
    <tr><td>3mm</td><td>Small letters (up to 150mm height)</td><td>10mm</td></tr>
    <tr><td>5mm</td><td>Medium letters (150-300mm height)</td><td>15mm</td></tr>
    <tr><td>6mm</td><td>Large letters (300-500mm height)</td><td>18mm</td></tr>
    <tr><td>8mm</td><td>Extra large letters (500mm+ height)</td><td>20mm</td></tr>
    <tr><td>10mm</td><td>Industrial/architectural signage</td><td>20mm+</td></tr>
  </tbody>
</table>
<p><strong>Material codes:</strong></p>
<ul>
  <li>PLEXIGLAS® XT WN071 - Standard white opal (30% transmittance)</li>
  <li>PLEXIGLAS® XT WN297 - High-opacity white (25% transmittance)</li>
  <li>PLEXIGLAS® XT 0F00 - Clear (92% transmittance) for special effects</li>
</ul>
<p><strong>Important:</strong> Always ensure the milling depth is at least 2mm less than material thickness to avoid breakthrough.</p>',
'<p>Профиль P3 (Акриловый канал) поддерживает следующие толщины OPAL:</p>
<ul>
  <li>3мм - Маленькие буквы (до 150мм высота)</li>
  <li>5мм - Средние буквы (150-300мм)</li>
  <li>6мм - Большие буквы (300-500мм)</li>
  <li>8мм - Очень большие буквы (500мм+)</li>
  <li>10мм - Промышленная/архитектурная вывеска</li>
</ul>',
'<p>Profils P3 atbalsta šādus OPAL biezumus: 3mm, 5mm, 6mm, 8mm, 10mm.</p>',
'how-to-choose-opal-thickness-p3',
2, true),

(profile_cat_id,
'What LED options are available for Profile P5 (SignTrim)?',
'Какие варианты LED доступны для профиля P5 (SignTrim)?',
'Kādi LED varianti ir pieejami profilam P5 (SignTrim)?',
'<p>Profile P5 (SignTrim) offers specialized LED options:</p>
<h3>Standard LED Options</h3>
<ul>
  <li><strong>REGULA 5-years LED</strong> - Standard warranty, 3500K-4000K color temperature, 24V system</li>
  <li><strong>ELLIPTICA</strong> - Specialized elliptical LED profile for uniform light distribution</li>
  <li><strong>NO LED</strong> - Client will install their own LED system</li>
</ul>
<h3>Special LED Options</h3>
<ul>
  <li><strong>RED LED</strong> - For specific branding requirements (warning signs, restaurants)</li>
  <li><strong>BLUE LED</strong> - For corporate branding or medical signage</li>
</ul>
<h3>DIMM SYSTEM</h3>
<p>Profile P5 supports the DIMM (dimming) system which allows:</p>
<ul>
  <li>Adjustable brightness (0-100%)</li>
  <li>Timer-based control</li>
  <li>Energy savings during off-peak hours</li>
  <li>Extends LED lifespan</li>
</ul>
<h3>GS Option</h3>
<p>GS (Geprüfte Sicherheit) certification available for German market requirements.</p>
<p><strong>Wiring:</strong> All LED systems come with either WAGO connectors or CABLES CLICK MINI for easy installation.</p>',
'<p>Профиль P5 (SignTrim) предлагает специализированные LED опции:</p>
<ul>
  <li><strong>REGULA 5-years LED</strong> - Стандартная гарантия 5 лет</li>
  <li><strong>ELLIPTICA</strong> - Эллиптический LED профиль</li>
  <li><strong>RED LED / BLUE LED</strong> - Цветные LED для брендинга</li>
  <li><strong>DIMM SYSTEM</strong> - Система диммирования яркости</li>
</ul>',
'<p>Profils P5 piedāvā specializētus LED variantus ar DIMM sistēmu.</p>',
'led-options-profile-p5-signtrim',
3, false),

(profile_cat_id,
'Can I use different materials for face and back in Profile P8?',
'Могу ли я использовать разные материалы для лица и спины в профиле P8?',
'Vai varu izmantot dažādus materiālus priekšpusei un aizmugurai profilā P8?',
'<p><strong>Yes!</strong> Profile P8 (5-Sided Lightbox) is designed for maximum flexibility:</p>
<h3>Face Options</h3>
<ul>
  <li><strong>OPAL WHITE</strong> (PLEXIGLAS® XT WN071) - Standard choice, 30% light transmittance</li>
  <li><strong>ACRYLIC CLEAR</strong> (PLEXIGLAS® XT 0F00) - For transparent designs, 92% transmittance</li>
</ul>
<h3>Base/Back Options</h3>
<ul>
  <li><strong>ALU 1.5mm</strong> - Lightweight, cost-effective</li>
  <li><strong>ALU 2.0mm</strong> - Stronger, for larger lightboxes</li>
  <li><strong>ACRYLIC WHITE</strong> (PLEXIGLAS® GS WH10) - For fully translucent boxes</li>
</ul>
<h3>Side Options</h3>
<ul>
  <li>OPAL WHITE - Matching face material</li>
  <li>ALU painted - Cost-effective alternative</li>
  <li>ACRYLIC BLACK - For contrast effect</li>
</ul>
<h3>Common Configurations</h3>
<table>
  <thead>
    <tr><th>Configuration</th><th>Face</th><th>Sides</th><th>Back</th><th>Use Case</th></tr>
  </thead>
  <tbody>
    <tr><td>Standard</td><td>OPAL 6mm</td><td>OPAL 6mm</td><td>ALU 1.5mm</td><td>Most common setup</td></tr>
    <tr><td>Premium</td><td>CLEAR 8mm</td><td>OPAL 6mm</td><td>ALU 2.0mm</td><td>High-end retail</td></tr>
    <tr><td>360° Display</td><td>OPAL 6mm</td><td>OPAL 6mm</td><td>OPAL 6mm</td><td>Visible from all sides</td></tr>
    <tr><td>Budget</td><td>OPAL 5mm</td><td>Painted ALU</td><td>ALU 1.5mm</td><td>Cost-optimized</td></tr>
  </tbody>
</table>
<p><strong>Important:</strong> LED placement depends on your material choices. Internal LED works best with OPAL face, while edge-lit LED is better for clear acrylic.</p>',
'<p><strong>Да!</strong> Профиль P8 (5-сторонний световой короб) позволяет комбинировать материалы:</p>
<ul>
  <li>Лицо: OPAL WHITE или ACRYLIC CLEAR</li>
  <li>Спина: ALU 1.5mm, ALU 2.0mm, или ACRYLIC WHITE</li>
  <li>Боковины: OPAL, ALU окрашенный, или ACRYLIC BLACK</li>
</ul>',
'<p>Jā! Profils P8 ļauj kombinēt dažādus materiālus.</p>',
'different-materials-face-back-p8',
4, false);

-- ==========================================
-- MATERIALS & COLORS FAQs
-- ==========================================

INSERT INTO faq_items (category_id, question_en, question_ru, question_lv, answer_en, answer_ru, answer_lv, slug, order_index, is_featured) VALUES
(materials_cat_id,
'What is the difference between PLEXIGLAS XT and GS series?',
'В чем разница между PLEXIGLAS XT и GS сериями?',
'Kāda ir atšķirība starp PLEXIGLAS XT un GS sērijām?',
'<p>PLEXIGLAS® offers two main acrylic series from Evonik (Röhm):</p>
<h3>PLEXIGLAS® XT (Extruded)</h3>
<ul>
  <li><strong>Manufacturing:</strong> Continuous extrusion process</li>
  <li><strong>Cost:</strong> More economical</li>
  <li><strong>Thickness range:</strong> 1.5mm - 25mm</li>
  <li><strong>Standard size:</strong> 3050x2050mm</li>
  <li><strong>Surface quality:</strong> Good, suitable for most applications</li>
  <li><strong>Use cases:</strong> Signage, displays, LED applications, glazing</li>
  <li><strong>Processing:</strong> Easier to thermoform, bend at lower temperatures</li>
  <li><strong>Available from Proplastik:</strong> WN071 (white opal), WN297, 0F00 (clear), colored variants</li>
</ul>
<h3>PLEXIGLAS® GS (Cast)</h3>
<ul>
  <li><strong>Manufacturing:</strong> Cell casting process</li>
  <li><strong>Cost:</strong> Premium pricing</li>
  <li><strong>Thickness range:</strong> 3mm - 20mm</li>
  <li><strong>Standard size:</strong> 3050x2030mm</li>
  <li><strong>Surface quality:</strong> Superior optical clarity, harder surface</li>
  <li><strong>Use cases:</strong> High-end displays, museum exhibits, architectural glazing</li>
  <li><strong>Processing:</strong> Better for milling, engraving, polishing</li>
  <li><strong>Available from Proplastik:</strong> WH10 (white opaque), WH73 (white translucent)</li>
</ul>
<h3>Which to Choose?</h3>
<table>
  <thead>
    <tr><th>Application</th><th>Recommended</th><th>Reason</th></tr>
  </thead>
  <tbody>
    <tr><td>LED signage with light diffusion</td><td>XT WN071</td><td>Optimal light distribution, cost-effective</td></tr>
    <tr><td>Clear glazing/windows</td><td>XT 0F00</td><td>Good clarity, easier to handle large sheets</td></tr>
    <tr><td>CNC milled letters</td><td>GS or XT</td><td>Both work well, GS has slightly better edge quality</td></tr>
    <tr><td>Thermoforming/bending</td><td>XT</td><td>Lower forming temperature, more forgiving</td></tr>
    <tr><td>High-end displays</td><td>GS</td><td>Superior surface quality and optical properties</td></tr>
    <tr><td>Outdoor signage</td><td>XT</td><td>Excellent UV resistance, cost-effective</td></tr>
  </tbody>
</table>
<p><strong>In Reclame OMS:</strong> Most profiles default to XT series. Specify GS only when client requires premium finish or when project budget allows.</p>',
'<p>PLEXIGLAS® предлагает две основные серии акрила:</p>
<h3>XT (Экструдированный)</h3>
<ul>
  <li>Экономичный</li>
  <li>Легче в термоформовке</li>
  <li>Стандарт для LED вывесок</li>
</ul>
<h3>GS (Литой)</h3>
<ul>
  <li>Премиум качество</li>
  <li>Лучше для фрезеровки</li>
  <li>Выше оптическая четкость</li>
</ul>',
'<p>XT - ekonomisks, piemērots LED. GS - premium kvalitāte.</p>',
'difference-plexiglas-xt-gs',
1, true),

(materials_cat_id,
'How do I select the correct RAL color for outdoor signage?',
'Как выбрать правильный цвет RAL для наружной вывески?',
'Kā izvēlēties pareizo RAL krāsu āra zīmēm?',
'<p>RAL Classic color system has 213 colors, but for outdoor signage, consider these factors:</p>
<h3>Most Popular RAL Colors for Signage</h3>
<ul>
  <li><strong>RAL 9003 (Signal White)</strong> - Standard white, excellent UV resistance</li>
  <li><strong>RAL 9005 (Jet Black)</strong> - Pure black, high contrast</li>
  <li><strong>RAL 7016 (Anthracite Grey)</strong> - Modern, corporate look</li>
  <li><strong>RAL 3020 (Traffic Red)</strong> - High visibility, branding</li>
  <li><strong>RAL 1003 (Signal Yellow)</strong> - Warning signs, visibility</li>
  <li><strong>RAL 5015 (Sky Blue)</strong> - Corporate, healthcare</li>
  <li><strong>RAL 6029 (Mint Green)</strong> - Eco-friendly branding</li>
</ul>
<h3>Color Selection Considerations</h3>
<table>
  <thead>
    <tr><th>Factor</th><th>Recommendation</th></tr>
  </thead>
  <tbody>
    <tr><td>UV Resistance</td><td>Light colors fade less (whites, greys). Dark colors require UV-stable paint.</td></tr>
    <tr><td>Heat Absorption</td><td>Dark colors (RAL 9005) absorb more heat - consider for LED cooling</td></tr>
    <tr><td>Visibility</td><td>High contrast combinations: White/Black, Yellow/Black, Red/White</td></tr>
    <tr><td>Maintenance</td><td>Mid-tone greys (RAL 7016, 7035) hide dirt better than pure white</td></tr>
    <tr><td>Brand Matching</td><td>Always ask for Pantone® or RAL code from client''s brand guidelines</td></tr>
  </tbody>
</table>
<h3>RAL vs PANTONE Matching</h3>
<p>When client provides PANTONE® color:</p>
<ol>
  <li>Use PANTONE® to RAL conversion chart (not always exact match)</li>
  <li>Request physical sample if color accuracy is critical</li>
  <li>For exact match, use custom color mixing (additional cost)</li>
</ol>
<h3>Common Conversions</h3>
<ul>
  <li>PANTONE 185 C (Coca-Cola Red) ≈ RAL 3020</li>
  <li>PANTONE Reflex Blue ≈ RAL 5002</li>
  <li>PANTONE Process Black ≈ RAL 9005</li>
</ul>
<p><strong>In Reclame OMS:</strong> RAL colors are stored in the <code>color_systems</code> table with hex values for preview. Always show client a preview before production.</p>',
'<p>Популярные цвета RAL для вывесок:</p>
<ul>
  <li>RAL 9003 - Сигнальный белый</li>
  <li>RAL 9005 - Черный</li>
  <li>RAL 7016 - Антрацитовый серый</li>
  <li>RAL 3020 - Транспортный красный</li>
</ul>
<p>Учитывайте: UV стойкость, поглощение тепла, видимость, совпадение с брендом.</p>',
'<p>Populārākās RAL krāsas: 9003 (balts), 9005 (melns), 7016 (pelēks), 3020 (sarkans).</p>',
'select-correct-ral-color-outdoor',
2, true),

(materials_cat_id,
'What is ORACAL 8500 and when should I use it?',
'Что такое ORACAL 8500 и когда его использовать?',
'Kas ir ORACAL 8500 un kad to izmantot?',
'<p><strong>ORACAL® 8500 Translucent Cal</strong> is a premium translucent vinyl film from ORAFOL specifically designed for backlit signage.</p>
<h3>Key Features</h3>
<ul>
  <li><strong>Material:</strong> Calendered translucent PVC film</li>
  <li><strong>Finish:</strong> High-gloss surface</li>
  <li><strong>Thickness:</strong> 85 microns</li>
  <li><strong>Adhesive:</strong> Permanent, solvent-based</li>
  <li><strong>Liner:</strong> Silicone-coated paper (easy application)</li>
  <li><strong>Durability:</strong> Up to 3 years outdoor (backlit), 5+ years indoor</li>
  <li><strong>Color range:</strong> 60+ colors including metallics</li>
</ul>
<h3>When to Use ORACAL 8500</h3>
<table>
  <thead>
    <tr><th>Application</th><th>Use ORACAL 8500</th><th>Alternative</th></tr>
  </thead>
  <tbody>
    <tr><td>Backlit signage (LED)</td><td>✅ Yes - Designed for this</td><td>N/A</td></tr>
    <tr><td>Non-backlit outdoor</td><td>❌ No - Use ORACAL 751C</td><td>ORACAL 751C Cast</td></tr>
    <tr><td>Vehicle graphics</td><td>❌ No - Not designed for vehicles</td><td>3M wrap films</td></tr>
    <tr><td>Window graphics (backlit)</td><td>✅ Yes - With OPAL substrate</td><td>-</td></tr>
    <tr><td>Cut vinyl letters (backlit)</td><td>✅ Yes - Excellent for LED letters</td><td>-</td></tr>
  </tbody>
</table>
<h3>Popular ORACAL 8500 Colors</h3>
<ul>
  <li><strong>010</strong> - White (most common)</li>
  <li><strong>021</strong> - Yellow</li>
  <li><strong>031</strong> - Red</li>
  <li><strong>070</strong> - Black</li>
  <li><strong>479</strong> - Ultramarine (deep blue)</li>
  <li><strong>300</strong> - Silver Mirror (metallic)</li>
</ul>
<h3>Application Tips</h3>
<ol>
  <li><strong>Surface preparation:</strong> Clean OPAL/acrylic with isopropyl alcohol</li>
  <li><strong>Application method:</strong> Wet or dry application (wet recommended for large areas)</li>
  <li><strong>Squeegee pressure:</strong> Medium pressure to avoid adhesive lines</li>
  <li><strong>Post-heating:</strong> Optional, improves adhesion in cold environments</li>
</ol>
<p><strong>In Reclame OMS:</strong> ORACAL 8500 is the default film for Profile P7st, P1, P5. Stock most common colors (white, black, red, yellow) in inventory.</p>',
'<p>ORACAL® 8500 - полупрозрачная виниловая пленка для подсветки.</p>
<ul>
  <li>Используется для LED вывесок</li>
  <li>60+ цветов</li>
  <li>Стойкость: 3 года на улице, 5+ лет внутри</li>
  <li>Стандарт для профилей P7st, P1, P5</li>
</ul>',
'<p>ORACAL 8500 - izgaismotas zīmes plēve, 60+ krāsas.</p>',
'what-is-oracal-8500-when-use',
3, false),

(materials_cat_id,
'What aluminum thicknesses are available and which should I use?',
'Какие толщины алюминия доступны и какую выбрать?',
'Kādi alumīnija biezumi ir pieejami un kuru izvēlēties?',
'<p>Our standard aluminum sheets (AlMg3 alloy) from Proplastik:</p>
<h3>Available Thicknesses</h3>
<table>
  <thead>
    <tr><th>Thickness</th><th>Use Case</th><th>Max Bendable Width</th><th>Weight/m²</th></tr>
  </thead>
  <tbody>
    <tr><td>1.0mm</td><td>Small letters, trim, light construction</td><td>100mm</td><td>2.7kg</td></tr>
    <tr><td>1.2mm</td><td>Letter backs, small sign frames</td><td>150mm</td><td>3.2kg</td></tr>
    <tr><td>1.3mm</td><td>Medium sign sides, structural</td><td>200mm</td><td>3.5kg</td></tr>
    <tr><td>1.5mm</td><td><strong>Standard for most profiles</strong></td><td>250mm</td><td>4.1kg</td></tr>
    <tr><td>2.0mm</td><td>Large signs, heavy-duty frames</td><td>300mm</td><td>5.4kg</td></tr>
    <tr><td>3.0mm</td><td>Industrial signage, high-wind areas</td><td>Limited</td><td>8.1kg</td></tr>
  </tbody>
</table>
<h3>Profile Recommendations</h3>
<ul>
  <li><strong>Profile P7st:</strong> Sides - 1.5mm (standard), Back panel - 1.5mm or 2.0mm for large signs</li>
  <li><strong>Profile P1:</strong> Sides - 1.2mm or 1.5mm</li>
  <li><strong>Profile P3:</strong> Optional ALU back panel - 1.5mm</li>
  <li><strong>Profile P5:</strong> Sides/back - 1.2mm or 1.5mm</li>
  <li><strong>Profile P8:</strong> Base structure - 1.5mm or 2.0mm depending on size</li>
</ul>
<h3>Finish Options</h3>
<ul>
  <li><strong>Mill Finish</strong> - Raw aluminum, will be painted (most common)</li>
  <li><strong>Brushed Horizontal</strong> - Decorative finish, no painting needed (+15% cost)</li>
  <li><strong>Anodized Natural</strong> - Premium corrosion resistance (+25% cost)</li>
  <li><strong>Anodized Black</strong> - High-end aesthetic (+30% cost)</li>
</ul>
<h3>Calculation Example</h3>
<p>Sign size: 1000mm x 500mm, sides 150mm depth</p>
<ul>
  <li>Sides: 2 pieces x 1000mm x 150mm = 0.3m² x 1.5mm = 1.23kg</li>
  <li>Back: 1000mm x 500mm = 0.5m² x 1.5mm = 2.05kg</li>
  <li><strong>Total ALU:</strong> ~3.3kg (+ 10% waste allowance = 3.6kg)</li>
</ul>
<p><strong>In Inventory:</strong> Stock 1.5mm as priority (highest demand). Keep 1.2mm and 2.0mm in smaller quantities.</p>',
'<p>Доступные толщины алюминия (AlMg3):</p>
<ul>
  <li>1.0мм - Маленькие буквы</li>
  <li>1.2мм - Задники букв, малые рамки</li>
  <li>1.5мм - <strong>Стандарт для большинства профилей</strong></li>
  <li>2.0мм - Большие вывески</li>
  <li>3.0мм - Промышленные вывески</li>
</ul>
<p>Профиль P7st стандарт: 1.5мм боковины и спина.</p>',
'<p>Alumīnija biezumi: 1.0mm-3.0mm. Standarts: 1.5mm.</p>',
'aluminum-thicknesses-available-which-use',
4, false);

-- ==========================================
-- MANUFACTURING PROCESS FAQs
-- ==========================================

INSERT INTO faq_items (category_id, question_en, question_ru, question_lv, answer_en, answer_ru, answer_lv, slug, order_index, is_featured) VALUES
(manufacturing_cat_id,
'What is the difference between CNC Router and Line Freezer?',
'В чем разница между ЧПУ фрезером и Line Freezer?',
'Kāda ir atšķirība starp CNC Router un Line Freezer?',
'<p>Both are CNC (Computer Numerical Control) machines but serve different purposes:</p>
<h3>CNC Router (CNC ROUTER section)</h3>
<ul>
  <li><strong>Function:</strong> Cutting and engraving sheet materials</li>
  <li><strong>Materials:</strong> PVC foam, wood, composite panels, soft metals</li>
  <li><strong>Typical operations:</strong>
    <ul>
      <li>Cutting PVC letters and shapes</li>
      <li>Engraving surface patterns</li>
      <li>Profile cutting for frames</li>
      <li>Pocket milling for LED strips</li>
    </ul>
  </li>
  <li><strong>Tool:</strong> Rotating cutting bit (various sizes)</li>
  <li><strong>Speed:</strong> Fast cutting, suitable for production volumes</li>
</ul>
<h3>Line Freezer (LINE_FREEZER section)</h3>
<ul>
  <li><strong>Function:</strong> Precision milling of acrylic sheets for LED channel letters</li>
  <li><strong>Materials:</strong> PLEXIGLAS® (OPAL), polycarbonate</li>
  <li><strong>Typical operations:</strong>
    <ul>
      <li>Channel milling for LED strips (grooves)</li>
      <li>Creating light diffusion patterns</li>
      <li>Precision depth control for letter faces</li>
      <li>Multi-pass milling for complex shapes</li>
    </ul>
  </li>
  <li><strong>Tool:</strong> Specialized milling bits for acrylic</li>
  <li><strong>Speed:</strong> Slower, precision-focused</li>
</ul>
<h3>When to Use Each</h3>
<table>
  <thead>
    <tr><th>Profile</th><th>CNC Router</th><th>Line Freezer</th></tr>
  </thead>
  <tbody>
    <tr><td>P7st</td><td>✅ Back panel cutting</td><td>✅ Face channel milling</td></tr>
    <tr><td>P1</td><td>❌ Not required</td><td>❌ Not required</td></tr>
    <tr><td>P3</td><td>❌ Not typically</td><td>✅ Acrylic channel milling</td></tr>
    <tr><td>P5</td><td>❌ Not typically</td><td>✅ Face milling</td></tr>
    <tr><td>P8</td><td>✅ Base cutting</td><td>✅ Face milling (if needed)</td></tr>
  </tbody>
</table>
<p><strong>Important:</strong> Always specify milling depth in configuration. Standard depth is 2mm less than material thickness to prevent breakthrough.</p>',
'<p><strong>CNC Router:</strong> Резка листовых материалов (PVC, дерево, композит).</p>
<p><strong>Line Freezer:</strong> Точное фрезерование акрила для LED канальных букв.</p>
<ul>
  <li>Router - быстрая резка</li>
  <li>Freezer - точная фрезеровка с контролем глубины</li>
</ul>',
'<p>CNC Router - griešana. Line Freezer - precīza frēzēšana akrilam.</p>',
'difference-cnc-router-line-freezer',
1, true),

(manufacturing_cat_id,
'How long does it take to manufacture each profile type?',
'Сколько времени занимает производство каждого типа профиля?',
'Cik ilgs laiks nepieciešams katram profila veidam?',
'<p>Standard manufacturing times (from draft order to completion):</p>
<h3>Manufacturing Timeline by Profile</h3>
<table>
  <thead>
    <tr><th>Profile</th><th>Stages</th><th>Standard Time</th><th>Rush Time</th></tr>
  </thead>
  <tbody>
    <tr><td>P7st</td><td>CNC Router, Bender, Front, Painting, Assembly, Delivery</td><td>8-10 working days</td><td>5 days (+30% cost)</td></tr>
    <tr><td>P1</td><td>Bender, Front, Painting, Assembly, Delivery</td><td>6-7 working days</td><td>4 days (+25% cost)</td></tr>
    <tr><td>P3</td><td>Line Freezer, Bender, Back Panel, Painting, Assembly, Delivery</td><td>7-9 working days</td><td>5 days (+30% cost)</td></tr>
    <tr><td>P5</td><td>Line Freezer, Bender, Trim, Painting, Assembly, Delivery</td><td>8-10 working days</td><td>5 days (+35% cost)</td></tr>
    <tr><td>P8</td><td>Line Freezer, Painting, Assembly, Delivery</td><td>10-12 working days</td><td>6 days (+40% cost)</td></tr>
  </tbody>
</table>
<h3>Time Breakdown by Stage</h3>
<ul>
  <li><strong>CNC Router:</strong> 0.5-1 day (depending on complexity)</li>
  <li><strong>Line Freezer:</strong> 1-2 days (precision work)</li>
  <li><strong>Bender:</strong> 0.5-1 day</li>
  <li><strong>Painting:</strong> 1-2 days (includes drying time)</li>
  <li><strong>Assembly:</strong> 1-2 days (LED wiring, QC)</li>
  <li><strong>Quality Control:</strong> 0.5 day (included in assembly)</li>
  <li><strong>Packaging:</strong> 0.5 day</li>
  <li><strong>Delivery:</strong> 1-3 days (depending on location)</li>
</ul>
<h3>Factors That Extend Timeline</h3>
<ul>
  <li>Complex designs (+1-2 days)</li>
  <li>Special materials not in stock (+2-5 days for procurement)</li>
  <li>Custom colors/mixing (+1 day)</li>
  <li>Multiple profiles in same order (+1 day per additional profile)</li>
  <li>Rework due to client changes (+2-3 days)</li>
</ul>
<p><strong>In Reclame OMS:</strong> Deadline is tracked in <code>draft_orders.deadline</code> field. System automatically calculates expected completion based on profile complexity.</p>',
'<p>Стандартные сроки производства:</p>
<ul>
  <li><strong>P7st:</strong> 8-10 рабочих дней</li>
  <li><strong>P1:</strong> 6-7 дней</li>
  <li><strong>P3:</strong> 7-9 дней</li>
  <li><strong>P5:</strong> 8-10 дней</li>
  <li><strong>P8:</strong> 10-12 дней</li>
</ul>
<p>Срочный заказ: +25-40% стоимости, сокращение на 30-40% времени.</p>',
'<p>Standarta ražošanas laiki: P7st 8-10 dienas, P1 6-7 dienas.</p>',
'manufacturing-time-each-profile',
2, true);

-- Add more FAQs for other categories...
-- (Inventory Management, Order Management, Troubleshooting)

END $$;

-- ==========================================
-- CREATE TAGS
-- ==========================================

INSERT INTO faq_tags (name, slug) VALUES
  ('PLEXIGLAS', 'plexiglas'),
  ('ORACAL', 'oracal'),
  ('RAL Colors', 'ral-colors'),
  ('PANTONE', 'pantone'),
  ('LED', 'led'),
  ('CNC', 'cnc'),
  ('Aluminum', 'aluminum'),
  ('Profile P7st', 'profile-p7st'),
  ('Profile P1', 'profile-p1'),
  ('Profile P3', 'profile-p3'),
  ('Profile P5', 'profile-p5'),
  ('Profile P8', 'profile-p8'),
  ('Manufacturing', 'manufacturing'),
  ('Materials', 'materials'),
  ('Troubleshooting', 'troubleshooting'),
  ('Inventory', 'inventory'),
  ('Pricing', 'pricing'),
  ('Quality Control', 'quality-control');

-- ==========================================
-- LINK TAGS TO FAQ ITEMS
-- ==========================================

-- Link P7st vs P1 FAQ to tags
INSERT INTO faq_item_tags (faq_item_id, tag_id)
SELECT fi.id, ft.id
FROM faq_items fi
CROSS JOIN faq_tags ft
WHERE fi.slug = 'what-is-difference-between-p7st-and-p1'
  AND ft.slug IN ('profile-p7st', 'profile-p1', 'manufacturing');

-- Link OPAL thickness FAQ to tags
INSERT INTO faq_item_tags (faq_item_id, tag_id)
SELECT fi.id, ft.id
FROM faq_items fi
CROSS JOIN faq_tags ft
WHERE fi.slug = 'how-to-choose-opal-thickness-p3'
  AND ft.slug IN ('plexiglas', 'profile-p3', 'materials', 'cnc');

-- Continue for other FAQs...
