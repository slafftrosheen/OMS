// Signage-domain calculators used by both the chat tool-call loop and the AI
// Lab canvas nodes. All functions are deterministic and side-effect free, so
// they're safe to call from arrow-driven graph executions.
//
// Réclame Fabriek context:
//   • LumiGrid is a hybrid 8 PWM + 8 addressable RMT controller; revision-specific
//     PWM bit depth, current limits and addressable protocol require verification.
//   • Addressable strips are 24 V WS2814-based at 60 LED/m, white-balanced.
//   • LED matrix displays use Hub75 or driver-IC panels (P2.5 → P10).
//   • Box letters use 12 V or 24 V CC modules; depth governs viewing-angle.
//
// Every function returns an explainable `notes[]` so the LLM can summarize
// the reasoning chain to the user.

import { SIGNAGE } from '$lib/server/config';

// ─── LumiGrid hybrid controller — 8 PWM + 8 addressable outputs ────────
//
// This is a LOAD estimate, not a board current/thermal, RMT or EMI certificate.
// Electrical limits, firmware PWM resolution and addressable protocols must be
// checked against the exact LumiGrid PCB revision and installed LED product.
export const LUMIGRID_CAPACITY = Object.freeze({
    pwm_outputs: 8,
    addressable_lanes: 8,
    max_pixels_per_lane_reference: 256
} as const);

export interface LumiGridArgs {
    /** Number of connected dumb PWM outputs, 0..8 (legacy channels alias). */
    channels: number;
    /** mA at full output on EACH connected dumb PWM channel. */
    channel_ma: number;
    /** PWM load supply. Addressable supply is calculated independently. */
    volts?: 12 | 24;
    pwm_hz?: number;
    pwm_bits?: number;
    gamma?: number;
    camera_safe?: boolean;
    /** Number of occupied addressable RMT outputs (0..8). */
    addressable_lanes?: number;
    /** Addressable pixel count PER connected lane (reference max 256). */
    pixels_per_lane?: number;
    /** Measured/datasheet max mA per addressable pixel, including white. */
    pixel_ma?: number;
    /** Independent addressable supply voltage, if addressable lanes are used. */
    pixel_volts?: 5 | 12 | 24;
}

export interface LumiGridResult {
    channels: number;
    pwm_outputs_available: number;
    addressable_lanes: number;
    addressable_lanes_available: number;
    pixels_per_lane: number;
    pixels_total: number;
    volts: number;
    pwm_hz: number;
    pwm_bits: number;
    gamma: number;
    peak_amps: number;
    psu_amps: number;
    psu_watts: number;
    addressable_peak_amps: number;
    addressable_psu_amps: number;
    addressable_psu_watts: number;
    total_load_watts: number;
    total_psu_watts: number;
    /** Null until a verified revision-specific PWM timer capability is supplied. */
    timer_ok: null;
    gamma_lut_preview: number[];
    notes: string[];
    warnings: string[];
}

function finiteRange(label: string, value: unknown, min: number, max: number, integer = false): number {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        value < min || value > max || (integer && !Number.isInteger(value))) {
        throw new Error(`${label} must be a finite ${integer ? 'integer ' : ''}value from ${min} to ${max}`);
    }
    return value;
}

export function planLumiGrid(args: LumiGridArgs): LumiGridResult {
    if (!args || typeof args !== 'object') throw new Error('LumiGrid configuration is required');
    const channels = finiteRange('channels (PWM outputs)', args.channels, 0, 8, true);
    const lanes = finiteRange('addressable_lanes', args.addressable_lanes ?? 0, 0, 8, true);
    const channelMa = finiteRange('channel_ma', args.channel_ma, 0, 100_000);
    if (channels && channelMa <= 0) throw new Error('channel_ma is required for used PWM outputs');
    const volts = args.volts ?? 24;
    if (volts !== 12 && volts !== 24) throw new Error('PWM supply must be 12 or 24 V');
    const pwm_hz = finiteRange('pwm_hz', args.pwm_hz ?? SIGNAGE.pwmHz, 1, 200_000);
    const pwm_bits = finiteRange('pwm_bits', args.pwm_bits ?? SIGNAGE.pwmBits, 1, 16, true);
    const gamma = finiteRange('gamma', args.gamma ?? SIGNAGE.gamma, 1, 3);

    const pixelsPerLane = finiteRange('pixels_per_lane', args.pixels_per_lane ?? 0, 0, LUMIGRID_CAPACITY.max_pixels_per_lane_reference, true);
    const pixelMa = finiteRange('pixel_ma', args.pixel_ma ?? 0, 0, 1000);
    const pixelVolts = args.pixel_volts;
    if (lanes > 0 && (pixelsPerLane === 0 || pixelMa === 0 || ![5, 12, 24].includes(pixelVolts as number))) {
        throw new Error('Addressable lanes require pixels_per_lane, pixel_ma and pixel_volts (5, 12 or 24)');
    }
    if (lanes === 0 && (pixelsPerLane || pixelMa || pixelVolts !== undefined)) {
        throw new Error('Set addressable_lanes before supplying addressable load data');
    }
    const pixelsTotal = lanes * pixelsPerLane;
    const peak_a = channels * channelMa / 1000;
    const psu_a = peak_a * 1.25;
    const psu_w = psu_a * volts;
    const pixelPeakA = pixelsTotal * pixelMa / 1000;
    const pixelPsuA = pixelPeakA * 1.25;
    const pixelPsuW = pixelPsuA * (pixelVolts ?? 0);

    const lut: number[] = [];
    for (let i = 0; i < 8; i++) {
        const x = i / 7;
        lut.push(Math.round(Math.pow(x, gamma) * (Math.pow(2, pwm_bits) - 1)));
    }
    const notes = [
        `LumiGrid: ${channels}/8 PWM outputs, ${lanes}/8 independent addressable lanes.`,
        `PWM loads: ${peak_a.toFixed(2)} A @ ${volts} V; recommended PSU budget with 25% headroom ${psu_w.toFixed(1)} W.`,
        `Addressable loads: ${pixelsTotal} pixels, ${pixelPeakA.toFixed(2)} A @ ${pixelVolts ?? 'n/a'} V; PSU budget ${pixelPsuW.toFixed(1)} W.`,
        'Addressable LED currents are supplied by the chosen LED datasheet, not the controller.',
        'PSU current ratings are separate for different voltages; add watts, never amps across voltage rails.'
    ];
    const warnings = [
        'PCB channel current ratings, total board current, thermal limits and firmware PWM/RMT timing have not been verified; do not treat this as hardware approval.',
        'Do not infer PWM resolution from an assumed 96/100 MHz clock. Confirm PWM frequency/resolution on installed firmware.'
    ];
    if (args.camera_safe) warnings.push('Camera flicker requires a real rolling-shutter/LED-driver test; nominal PWM frequency alone is not a guarantee.');
    if (lanes > 0) warnings.push('256 pixels/lane is a reference firmware configuration, not a certified throughput or protocol guarantee.');
    if (channels === 0 && lanes === 0) warnings.push('No loads connected; PSU calculation is zero.');
    return {
        channels,
        pwm_outputs_available: 8,
        addressable_lanes: lanes,
        addressable_lanes_available: 8,
        pixels_per_lane: pixelsPerLane,
        pixels_total: pixelsTotal,
        volts, pwm_hz, pwm_bits, gamma,
        peak_amps: round(peak_a, 2),
        psu_amps: round(psu_a, 2),
        psu_watts: round(psu_w, 1),
        addressable_peak_amps: round(pixelPeakA, 2),
        addressable_psu_amps: round(pixelPsuA, 2),
        addressable_psu_watts: round(pixelPsuW, 1),
        total_load_watts: round(peak_a * volts + pixelPeakA * (pixelVolts ?? 0), 1),
        total_psu_watts: round(psu_w + pixelPsuW, 1),
        timer_ok: null,
        gamma_lut_preview: lut, notes, warnings
    };
}

// ─── Addressable LED strip plan ─────────────────────────────────────────────

export interface LedStripArgs {
    /** Total run length in metres. */
    length_m: number;
    /** Strip voltage (5, 12 or 24 V). */
    volts?: 5 | 12 | 24;
    /** LEDs per metre (60, 96, 144, …). */
    leds_per_m?: number;
    /** mA per LED at full white (worst case). */
    ma_per_led?: number;
    /** Cross-section of the supply wire in mm². */
    wire_mm2?: number;
    /** Target frame rate. */
    fps?: number;
}

export interface LedStripResult {
    length_m: number;
    volts: number;
    leds_total: number;
    peak_amps: number;
    psu_amps: number;
    psu_watts: number;
    /** End-to-end voltage drop without injection, in V. */
    drop_volts: number;
    /** Suggested injection points (0 = single-end feed). */
    injection_points: number;
    /** Achievable refresh given the protocol's bit-time. */
    max_fps: number;
    notes: string[];
    warnings: string[];
}

export function planLedStrip(args: LedStripArgs): LedStripResult {
    const length_m = Math.max(0.1, args.length_m);
    const volts = args.volts ?? SIGNAGE.stripVolts as 5 | 12 | 24;
    const leds_per_m = Math.max(1, args.leds_per_m ?? SIGNAGE.stripLedsPerM);
    const ma_per_led = Math.max(1, args.ma_per_led ?? SIGNAGE.stripMaPerLed);
    const fps_target = clamp(args.fps ?? 60, 10, 240);

    const leds = Math.round(length_m * leds_per_m);
    const peak_a = (leds * ma_per_led) / 1000;
    const psu_a = peak_a * 1.25;
    const psu_w = psu_a * volts;

    // Worst-case end-to-end drop. R per metre (single conductor):
    //   R/m = ρ / A   where ρ = 0.0175 Ω·mm²/m for copper.
    // Drop = I × R × L (×2 because there's a return). We assume a fat copper
    // bus, but if `wire_mm2` is given we use that.
    const wire_mm2 = Math.max(0.5, args.wire_mm2 ?? 4);
    const r_per_m = SIGNAGE.copperRho / wire_mm2;
    const drop = peak_a * r_per_m * length_m * 2;

    // If the drop exceeds tolerance, recommend injection points to halve it.
    const allowedDrop = SIGNAGE.stripMaxDrop;
    let injections = 0;
    let drop_after = drop;
    while (drop_after > allowedDrop && injections < 8) {
        injections++;
        // Each injection roughly halves the worst run length.
        drop_after = drop / Math.pow(2, injections);
    }

    // Frame rate ceiling: WS2812 needs 30 µs per LED ⇒ ~3.33 kHz/LED.
    const max_fps = Math.floor(1_000_000 / (leds * 30));

    const notes: string[] = [];
    const warnings: string[] = [];
    notes.push(`${leds} LEDs over ${length_m.toFixed(2)} m at ${volts} V.`);
    notes.push(`Peak ${peak_a.toFixed(2)} A → PSU ≥ ${psu_a.toFixed(2)} A (${psu_w.toFixed(0)} W).`);
    notes.push(`Single-feed drop ${drop.toFixed(2)} V; ${injections} injection point(s) → ${drop_after.toFixed(2)} V.`);
    notes.push(`Protocol ceiling ${max_fps} fps; target ${fps_target} fps.`);

    if (max_fps < fps_target) {
        warnings.push(`Protocol can't sustain ${fps_target} fps with ${leds} LEDs — split into segments or reduce target.`);
    }
    if (peak_a > 30 && volts === 5) {
        warnings.push(`5 V × ${peak_a.toFixed(1)} A is impractical; switch to 12 V or 24 V strip.`);
    }
    if (psu_w > 350) {
        warnings.push(`PSU > 350 W — split across two PSUs and tie grounds.`);
    }

    return {
        length_m: round(length_m, 2),
        volts,
        leds_total: leds,
        peak_amps: round(peak_a, 2),
        psu_amps: round(psu_a, 2),
        psu_watts: round(psu_w, 0),
        drop_volts: round(drop, 2),
        injection_points: injections,
        max_fps,
        notes,
        warnings
    };
}

// ─── LED matrix display plan (Hub75 / driver-IC panels) ────────────────────

export interface LedMatrixArgs {
    /** Pixel pitch in mm (P2.5, P3, P4, P6, P10). */
    pitch_mm: number;
    /** Physical width in mm. */
    width_mm: number;
    /** Physical height in mm. */
    height_mm: number;
    /** Target refresh rate. Default from config. */
    refresh_hz?: number;
    /** Scan rate (1/8, 1/16, 1/32). 1 = static. */
    scan?: number;
    /** Per-pixel current at full white, in mA. */
    ma_per_pixel?: number;
}

export interface LedMatrixResult {
    pitch_mm: number;
    cols: number;
    rows: number;
    pixels: number;
    refresh_hz: number;
    /** Required clock to actually hit refresh × scan with bit-planes. */
    clock_mhz: number;
    /** True if a Hub75 controller can keep up. */
    feasible: boolean;
    peak_amps_5v: number;
    psu_amps: number;
    psu_watts: number;
    /** Raw pixel area we cover. */
    area_m2: number;
    notes: string[];
    warnings: string[];
}

export function planLedMatrix(args: LedMatrixArgs): LedMatrixResult {
    const pitch = Math.max(1.5, args.pitch_mm);
    const cols = Math.max(8, Math.round(args.width_mm / pitch));
    const rows = Math.max(8, Math.round(args.height_mm / pitch));
    const pixels = cols * rows;
    const refresh = clamp(args.refresh_hz ?? SIGNAGE.matrixHz, 30, 4_000);
    const scan = clamp(args.scan ?? Math.max(8, Math.min(32, Math.round(rows / 4))), 1, 64);
    const ma = Math.max(5, args.ma_per_pixel ?? 18);

    // Approx clock needed: refresh × scan × cols × bits (we assume 12-bit per
    // colour, BCM scheduler, x3 for RGB).
    const clk_hz = refresh * scan * cols * 12 * 3;
    const clk_mhz = clk_hz / 1_000_000;

    const peak_a = (pixels * ma) / 1000;
    const psu_a = peak_a * 1.25;
    const psu_w = psu_a * 5;
    const area = (args.width_mm / 1000) * (args.height_mm / 1000);

    const notes: string[] = [];
    const warnings: string[] = [];
    notes.push(`Resolution ${cols}×${rows} (${pixels.toLocaleString()} pixels) over ${area.toFixed(2)} m².`);
    notes.push(`Scan 1/${scan}, refresh ${refresh} Hz → required clock ${clk_mhz.toFixed(1)} MHz.`);
    notes.push(`Peak ${peak_a.toFixed(1)} A @ 5 V → PSU ≥ ${psu_a.toFixed(1)} A (${psu_w.toFixed(0)} W).`);

    const feasible = clk_mhz <= 50;
    if (!feasible) {
        warnings.push(`Clock > 50 MHz exceeds typical Hub75 controller ceiling. Lower refresh/scan or tile across multiple receivers.`);
    }
    if (psu_w > 800) {
        warnings.push(`Single PSU > 800 W — recommend ≥ 2 PSUs with dedicated 5 V buses per tile.`);
    }
    if (refresh < 60 && pitch <= 4) {
        warnings.push(`Small pitch (${pitch} mm) at ${refresh} Hz will look choppy on camera; raise to ≥ 1920 Hz visual refresh.`);
    }

    return {
        pitch_mm: pitch,
        cols, rows, pixels,
        refresh_hz: refresh,
        clock_mhz: round(clk_mhz, 1),
        feasible,
        peak_amps_5v: round(peak_a, 1),
        psu_amps: round(psu_a, 1),
        psu_watts: round(psu_w, 0),
        area_m2: round(area, 2),
        notes,
        warnings
    };
}

// ─── Box letter / channel letter calculator ────────────────────────────────

export interface BoxLetterArgs {
    /** Letter height in mm. */
    height_mm: number;
    /** Stroke / face width in mm — drives the LED footprint per letter. */
    stroke_mm: number;
    /** Internal depth in mm — affects light spread + module count. */
    depth_mm?: number;
    /** Letter count (defaults to 1). */
    count?: number;
    /** Lumen target on the face, in cd/m². */
    nits_target?: number;
    /** Module type — modules-per-m² rule of thumb. */
    module?: 'tetra' | 'opto' | 'mini-strip';
    /** Module forward voltage (12 / 24). */
    volts?: 12 | 24;
    /** Module current per piece, in mA. */
    module_ma?: number;
    /** Module lumen output, in lm/piece. */
    module_lm?: number;
}

export interface BoxLetterResult {
    letter_count: number;
    avg_letter_area_m2: number;
    modules_per_letter: number;
    modules_total: number;
    peak_amps: number;
    psu_amps: number;
    psu_watts: number;
    estimated_nits: number;
    notes: string[];
    warnings: string[];
}

export function planBoxLetter(args: BoxLetterArgs): BoxLetterResult {
    const h = Math.max(50, args.height_mm);
    const sw = Math.max(20, args.stroke_mm);
    const depth = Math.max(20, args.depth_mm ?? 80);
    const count = Math.max(1, args.count ?? 1);
    const volts = args.volts ?? 24;

    // Approximate face area per letter — treats the letter as an "X" of stroke
    // bands. Empirically aligns with how much WS28xx / SloanLED tetra you
    // actually fit in a 250 mm cap-height letter.
    const face_area = (h * sw * 1.6) / 1_000_000; // m²

    // Module density depends on module brand + depth. Shallower letters need
    // more modules for even illumination.
    const densityTable: Record<string, number> = {
        tetra: 220,    // pieces/m² for 80 mm deep
        opto: 180,
        'mini-strip': 600 // LEDs/m² (mini-strip pixels)
    };
    const baseDensity = densityTable[args.module ?? 'tetra'] ?? 220;
    const depthFactor = clamp(80 / depth, 0.6, 1.8); // shallower → more modules
    const modulesPerLetter = Math.max(1, Math.ceil(face_area * baseDensity * depthFactor));

    const modulesTotal = modulesPerLetter * count;
    const moduleMa = args.module_ma ?? (args.module === 'mini-strip' ? 60 : 90);
    const moduleLm = args.module_lm ?? (args.module === 'mini-strip' ? 4 : 12);

    const peak_a = (modulesTotal * moduleMa) / 1000;
    const psu_a = peak_a * 1.25;
    const psu_w = psu_a * volts;

    const totalLumens = modulesTotal * moduleLm;
    const estNits = totalLumens / Math.max(0.001, face_area * count) / Math.PI; // luminance via Lambertian face

    const notes: string[] = [];
    const warnings: string[] = [];
    notes.push(`${count} letter(s) at ${h} mm cap-height, ${sw} mm stroke, ${depth} mm depth.`);
    notes.push(`${modulesPerLetter} ${args.module ?? 'tetra'} module(s)/letter ⇒ ${modulesTotal} total.`);
    notes.push(`${volts} V supply, peak ${peak_a.toFixed(1)} A → PSU ≥ ${psu_a.toFixed(1)} A (${psu_w.toFixed(0)} W).`);
    notes.push(`Estimated face luminance ≈ ${Math.round(estNits)} cd/m² (target ${args.nits_target ?? 1500}).`);

    if (depth < 50) {
        warnings.push(`Depth < 50 mm risks hot-spotting; consider mini-strip + diffuser.`);
    }
    if (args.nits_target && estNits < args.nits_target * 0.7) {
        warnings.push(`Estimated luminance below target — increase module density or switch to higher-flux modules.`);
    }
    if (psu_w > 200 && count > 1) {
        warnings.push(`Per-letter PSU ${(psu_w / count).toFixed(0)} W — consider one PSU per letter to limit cable runs.`);
    }

    return {
        letter_count: count,
        avg_letter_area_m2: round(face_area, 3),
        modules_per_letter: modulesPerLetter,
        modules_total: modulesTotal,
        peak_amps: round(peak_a, 1),
        psu_amps: round(psu_a, 1),
        psu_watts: round(psu_w, 0),
        estimated_nits: Math.round(estNits),
        notes,
        warnings
    };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}
function round(n: number, p: number): number {
    const f = Math.pow(10, p);
    return Math.round(n * f) / f;
}
