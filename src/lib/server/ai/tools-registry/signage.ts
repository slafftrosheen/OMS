// Signage-domain calculators used by both the chat tool-call loop and the AI
// Lab canvas nodes. All functions are deterministic and side-effect free, so
// they're safe to call from arrow-driven graph executions.
//
// Réclame Fabriek context:
//   • LumiGrid is the in-house PWM controller (16-bit, configurable PWM clock,
//     gamma-corrected dimming on each channel).
//   • Addressable strips are 24 V WS2814-based at 60 LED/m, white-balanced.
//   • LED matrix displays use Hub75 or driver-IC panels (P2.5 → P10).
//   • Box letters use 12 V or 24 V CC modules; depth governs viewing-angle.
//
// Every function returns an explainable `notes[]` so the LLM can summarize
// the reasoning chain to the user.

import { SIGNAGE } from '$lib/server/config';

// ─── LumiGrid PWM controller plan ───────────────────────────────────────────

export interface LumiGridArgs {
    /** Number of independently-dimmed channels (1..32 on a single LumiGrid). */
    channels: number;
    /** Per-channel current draw at full duty, in mA. */
    channel_ma: number;
    /** Channel voltage (12 or 24 V on current revs). */
    volts?: 12 | 24;
    /** Desired PWM frequency in Hz. */
    pwm_hz?: number;
    /** Bit depth for the duty cycle. */
    pwm_bits?: number;
    /** Perceptual gamma. 2.2 for standard signage, 2.6 for cinema. */
    gamma?: number;
    /** Whether the install is rated for camera capture (avoid flicker). */
    camera_safe?: boolean;
}

export interface LumiGridResult {
    channels: number;
    volts: number;
    pwm_hz: number;
    pwm_bits: number;
    gamma: number;
    /** Peak current with all channels on, in A. */
    peak_amps: number;
    /** Recommended PSU (min) with 25% headroom. */
    psu_amps: number;
    psu_watts: number;
    /** True if PWM × resolution leaves enough timer cycles. */
    timer_ok: boolean;
    /** Lookup table preview (first 8 of 32 anchor points). */
    gamma_lut_preview: number[];
    notes: string[];
    warnings: string[];
}

export function planLumiGrid(args: LumiGridArgs): LumiGridResult {
    const channels = clamp(Math.round(args.channels), 1, 64);
    const volts = args.volts ?? 24;
    const pwm_hz = clamp(args.pwm_hz ?? SIGNAGE.pwmHz, 200, 200_000);
    const pwm_bits = clamp(args.pwm_bits ?? SIGNAGE.pwmBits, 8, 16);
    const gamma = clamp(args.gamma ?? SIGNAGE.gamma, 1.0, 3.0);

    const peak_a = (channels * args.channel_ma) / 1000;
    const psu_a = peak_a * 1.25;
    const psu_w = psu_a * volts;

    // Hardware timer math: a 96 MHz clock has to produce pwm_hz with
    // 2^pwm_bits levels; required clock = pwm_hz × 2^bits.
    const required_clk = pwm_hz * Math.pow(2, pwm_bits);
    const timer_ok = required_clk <= 100_000_000;

    const lut: number[] = [];
    for (let i = 0; i < 8; i++) {
        const x = i / 7;
        lut.push(Math.round(Math.pow(x, gamma) * (Math.pow(2, pwm_bits) - 1)));
    }

    const notes: string[] = [];
    const warnings: string[] = [];
    notes.push(`Driving ${channels} channels at ${volts} V.`);
    notes.push(`PWM ${pwm_hz} Hz × ${pwm_bits}-bit gamma ${gamma.toFixed(2)}.`);
    notes.push(`Peak draw ${peak_a.toFixed(2)} A → PSU ≥ ${psu_a.toFixed(2)} A (${psu_w.toFixed(0)} W).`);

    if (args.camera_safe && pwm_hz < 2_000) {
        warnings.push(`Camera-safe install but PWM is ${pwm_hz} Hz — recommend ≥ 2000 Hz to avoid banding.`);
    }
    if (!timer_ok) {
        warnings.push(`Timer can't produce ${pwm_bits}-bit @ ${pwm_hz} Hz; reduce bits or PWM frequency.`);
    }
    if (peak_a > 60) {
        warnings.push(`Peak ${peak_a.toFixed(1)} A exceeds single-rail safe limit — split across multiple rails.`);
    }

    return {
        channels,
        volts,
        pwm_hz,
        pwm_bits,
        gamma,
        peak_amps: round(peak_a, 2),
        psu_amps: round(psu_a, 2),
        psu_watts: round(psu_w, 0),
        timer_ok,
        gamma_lut_preview: lut,
        notes,
        warnings
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
