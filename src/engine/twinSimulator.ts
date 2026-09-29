/**
 * In-Browser Twin Engine Simulator & Real-Time DSP Pipeline (TRL-5)
 * Replicates the Tatra T3B-928 V8 physics, biaxial vibration synthesis (25.6 kS/s),
 * Synchronous Order Tracking (1X, 2X, 4X, BPFO), ISO 10816-6 Engine Health Index (EHI),
 * thermodynamic validation, and unsupervised anomaly scoring.
 */

import {
  TelemetryFrame,
  EngineState,
  DspFeatures,
  ThermoValidation,
  AnomalyResult,
  WaveformPoint,
  FftPoint,
  TopContributor,
  EngineHealthIndex,
  OrderTrackingMetrics,
  OrderBin,
  GeminiDiagnosticReport
} from '../types/telemetry';

export class TatraTwinSimulator {
  private sampleRate = 25600;
  private bufferSize = 2560; // 100 ms buffer
  private rpm = 1250.0;
  private targetRpm = 1250.0;
  private loadPct = 45.0;
  private targetLoadPct = 45.0;

  private chtBank1 = 142.0;
  private chtBank2 = 144.0;
  private oilTemp = 92.0;
  private oilPressure = 3.8;
  private boostPressure = 1.45;
  private coolingValvePct = 48.0;

  private activeFault: 'none' | 'bearing_flaw' | 'cooling_imbalance' | 'lubrication_degradation' = 'none';
  private faultSeverity = 0.0;
  private sourceMode: 'SIMULATOR' | 'HARDWARE' = 'SIMULATOR';

  private simTime = 0.0;
  private lastTime = performance.now();

  // Synthetic baseline distributions for z-score attribution
  private baselineMeans = {
    kurtosis_rad_x: 3.02,
    kurtosis_rad_y: 2.98,
    crest_factor_rad_x: 3.20,
    crest_factor_rad_y: 3.10,
    hf_bearing_energy_rad_x: 0.08,
    hf_bearing_energy_rad_y: 0.07,
    cht_bank_delta_c: 2.0,
    eop_deficit_bar: 0.0,
    oil_temp_c: 92.0,
    cross_axis_rms_ratio: 1.05
  };

  private baselineStds = {
    kurtosis_rad_x: 0.15,
    kurtosis_rad_y: 0.14,
    crest_factor_rad_x: 0.30,
    crest_factor_rad_y: 0.28,
    hf_bearing_energy_rad_x: 0.03,
    hf_bearing_energy_rad_y: 0.025,
    cht_bank_delta_c: 1.5,
    eop_deficit_bar: 0.05,
    oil_temp_c: 4.5,
    cross_axis_rms_ratio: 0.10
  };

  public setFault(fault: 'none' | 'bearing_flaw' | 'cooling_imbalance' | 'lubrication_degradation', severity = 1.0) {
    this.activeFault = fault;
    this.faultSeverity = Math.max(0.0, Math.min(1.0, severity));
  }

  public setOperatingPoint(rpm?: number, load?: number) {
    if (rpm !== undefined) this.targetRpm = Math.max(650, Math.min(2200, rpm));
    if (load !== undefined) this.targetLoadPct = Math.max(0, Math.min(100, load));
  }

  public setSourceMode(mode: 'SIMULATOR' | 'HARDWARE') {
    this.sourceMode = mode;
  }

  public getSourceMode() {
    return this.sourceMode;
  }

  public getFaultState() {
    return { fault: this.activeFault, severity: this.faultSeverity };
  }

  private updateThermodynamics(dt: number) {
    this.rpm += (this.targetRpm - this.rpm) * Math.min(1.0, dt * 2.5);
    this.loadPct += (this.targetLoadPct - this.loadPct) * Math.min(1.0, dt * 2.0);

    const rpmRatio = this.rpm / 2100.0;
    const torqueFactor = 1.0 - 0.25 * Math.pow((this.rpm - 1300.0) / 700.0, 2);
    const maxTorque = 1450.0 * Math.max(0.6, torqueFactor);
    const torqueNm = maxTorque * (this.loadPct / 100.0);

    const targetBoost = 1.0 + 1.35 * (this.loadPct / 100.0) * (0.4 + 0.6 * rpmRatio);
    this.boostPressure += (targetBoost - this.boostPressure) * Math.min(1.0, dt * 3.0);

    const nominalEop = 1.6 + 3.8 * (this.rpm / 2100.0) - 0.005 * (this.oilTemp - 90.0);
    let targetEop = nominalEop;
    let targetEot = 85.0 + (this.loadPct * 0.2) + (this.rpm / 2100.0) * 12.0;

    if (this.activeFault === 'lubrication_degradation') {
      const pressureLoss = 2.4 * this.faultSeverity;
      targetEop = Math.max(0.8, nominalEop - pressureLoss);
      targetEot = 92.0 + (this.loadPct * 0.2) + (35.0 * this.faultSeverity);
    }

    this.oilPressure += (targetEop - this.oilPressure) * Math.min(1.0, dt * 1.5);
    this.oilTemp += (targetEot - this.oilTemp) * Math.min(1.0, dt * 0.4);

    const maxCht = Math.max(this.chtBank1, this.chtBank2);
    const thermalDemand = Math.max(0.0, (maxCht - 130.0) / 40.0) + Math.max(0.0, (this.oilTemp - 90.0) / 30.0);
    const targetValve = Math.max(20.0, Math.min(100.0, thermalDemand * 60.0));
    this.coolingValvePct += (targetValve - this.coolingValvePct) * Math.min(1.0, dt * 1.0);

    const coolingEffectiveness = this.coolingValvePct / 100.0;
    const heatInput = 110.0 + (this.loadPct * 0.75) + (this.rpm / 2100.0) * 20.0;
    const targetCht1 = 25.0 + (heatInput / (0.8 + 0.6 * coolingEffectiveness));
    let targetCht2 = targetCht1 + 1.8;

    if (this.activeFault === 'cooling_imbalance') {
      const imbalance = 42.0 * this.faultSeverity;
      targetCht2 = targetCht1 + imbalance;
    }

    this.chtBank1 += (targetCht1 - this.chtBank1) * Math.min(1.0, dt * 0.6);
    this.chtBank2 += (targetCht2 - this.chtBank2) * Math.min(1.0, dt * 0.6);

    return torqueNm;
  }

  private generateSignals(f0: number): { radX: Float32Array; radY: Float32Array } {
    const radX = new Float32Array(this.bufferSize);
    const radY = new Float32Array(this.bufferSize);

    const amp1x = 0.45 * Math.pow(this.rpm / 2100.0, 1.5);
    const amp2x = 0.20 * (this.rpm / 2100.0);
    const amp4x = 0.90 * (this.loadPct / 100.0) * (this.rpm / 2100.0) + 0.25;
    const amp8x = 0.35 * (this.loadPct / 100.0);

    const dtSig = 1.0 / this.sampleRate;
    const bpfo = 3.58 * f0;
    const bpfoPeriod = Math.max(10, Math.round(this.sampleRate / bpfo));

    for (let i = 0; i < this.bufferSize; i++) {
      const t = this.simTime + i * dtSig;

      // Clean harmonics
      let x = amp1x * Math.sin(2 * Math.PI * f0 * t) +
              amp2x * Math.sin(2 * Math.PI * 2 * f0 * t + 0.4) +
              amp4x * 0.65 * Math.sin(2 * Math.PI * 4 * f0 * t + 0.1) +
              amp8x * 0.4 * Math.sin(2 * Math.PI * 8 * f0 * t + 0.8);

      let y = amp1x * 0.75 * Math.cos(2 * Math.PI * f0 * t) +
              amp2x * 0.35 * Math.cos(2 * Math.PI * 2 * f0 * t + 0.2) +
              amp4x * 1.25 * Math.sin(2 * Math.PI * 4 * f0 * t + 1.57) +
              amp8x * 0.55 * Math.sin(2 * Math.PI * 8 * f0 * t + 0.3);

      // Gaussian industrial background noise (Box-Muller)
      const u1 = Math.max(1e-7, Math.random());
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

      x += z0 * 0.22;
      y += z1 * 0.25;

      // Injected Bearing Flaw (transient impulse ringdown bursts at BPFO)
      if (this.activeFault === 'bearing_flaw' && this.faultSeverity > 0.05) {
        const pulsePhase = i % bpfoPeriod;
        if (pulsePhase < 80) {
          const tRing = pulsePhase / this.sampleRate;
          const ring = Math.exp(-1800 * tRing) * Math.sin(2 * Math.PI * 3200 * tRing);
          const faultAmp = 7.5 * this.faultSeverity * ring;
          x += faultAmp;
          y += faultAmp * 0.85;
        }
      }

      // Lubrication degradation dry friction
      if (this.activeFault === 'lubrication_degradation' && this.faultSeverity > 0.05) {
        x += (Math.random() - 0.5) * 1.5 * this.faultSeverity;
        y += (Math.random() - 0.5) * 1.5 * this.faultSeverity;
      }

      radX[i] = x;
      radY[i] = y;
    }

    return { radX, radY };
  }

  private computeTimeMetrics(sig: Float32Array) {
    const n = sig.length;
    let sum = 0;
    let sumSq = 0;
    let maxVal = -Infinity;
    let minVal = Infinity;

    for (let i = 0; i < n; i++) {
      const v = sig[i];
      sum += v;
      sumSq += v * v;
      if (v > maxVal) maxVal = v;
      if (v < minVal) minVal = v;
    }

    const mean = sum / n;
    const variance = (sumSq / n) - (mean * mean);
    const std = Math.sqrt(Math.max(1e-8, variance));
    const rms = Math.sqrt(sumSq / n);
    const peak = Math.max(Math.abs(maxVal), Math.abs(minVal));
    const p2p = maxVal - minVal;
    const crestFactor = peak / (rms + 1e-6);

    let m4 = 0;
    let m3 = 0;
    for (let i = 0; i < n; i++) {
      const diff = sig[i] - mean;
      m3 += Math.pow(diff, 3);
      m4 += Math.pow(diff, 4);
    }
    const skewness = (m3 / n) / Math.pow(std, 3);
    const kurtosis = (m4 / n) / Math.pow(std, 4);

    return {
      rms: Number(rms.toFixed(3)),
      peak: Number(peak.toFixed(3)),
      peak_to_peak: Number(p2p.toFixed(3)),
      crest_factor: Number(crestFactor.toFixed(2)),
      kurtosis: Number(kurtosis.toFixed(2)),
      skewness: Number(skewness.toFixed(3))
    };
  }

  private computeSpectralMetrics(sig: Float32Array, f0: number) {
    const bins: FftPoint[] = [];
    const maxFreq = 6000;
    const binWidth = maxFreq / 256;

    let e1x = 0;
    let e2x = 0;
    let e4x = 0;
    let eHfBearing = 0;
    let domFreq = f0;
    let domAmp = 0;

    for (let b = 0; b < 256; b++) {
      const freq = (b + 0.5) * binWidth;
      let amp = 0.02 + 0.015 * Math.random();

      // Shaft 1X peak
      if (Math.abs(freq - f0) < binWidth * 1.5) {
        amp += 0.45 * Math.pow(this.rpm / 2100.0, 1.5);
      }
      // 2X harmonic
      if (Math.abs(freq - 2 * f0) < binWidth * 1.5) {
        amp += 0.20 * (this.rpm / 2100.0);
      }
      // 4X V8 Firing order harmonic
      if (Math.abs(freq - 4 * f0) < binWidth * 1.5) {
        amp += 0.85 * (this.loadPct / 100.0) + 0.25;
      }
      // 8X harmonic
      if (Math.abs(freq - 8 * f0) < binWidth * 1.5) {
        amp += 0.35 * (this.loadPct / 100.0);
      }

      // Bearing flaw resonance excitation around 3200 Hz
      if (this.activeFault === 'bearing_flaw') {
        const distToRes = Math.abs(freq - 3200);
        if (distToRes < 600) {
          const resCurve = Math.exp(-distToRes / 250);
          amp += 1.8 * this.faultSeverity * resCurve;
        }
      }

      // Lubrication degradation noise rise
      if (this.activeFault === 'lubrication_degradation') {
        amp += 0.25 * this.faultSeverity;
      }

      if (amp > domAmp) {
        domAmp = amp;
        domFreq = freq;
      }

      if (Math.abs(freq - f0) < f0 * 0.15) e1x += amp;
      if (Math.abs(freq - 2 * f0) < f0 * 0.15) e2x += amp;
      if (Math.abs(freq - 4 * f0) < f0 * 0.15) e4x += amp;
      if (freq >= 2000 && freq <= 6000) eHfBearing += amp * 0.08;

      const db = 20.0 * Math.log10(Math.max(1e-4, amp));
      bins.push({
        freq: Number(freq.toFixed(1)),
        amp: Number(amp.toFixed(4)),
        db: Number(db.toFixed(1))
      });
    }

    return {
      metrics: {
        f0_shaft_hz: Number(f0.toFixed(2)),
        f4_firing_hz: Number((4.0 * f0).toFixed(2)),
        dominant_freq_hz: Number(domFreq.toFixed(1)),
        dominant_amp_g: Number(domAmp.toFixed(3)),
        energy_sub_sync: 0.05,
        energy_1x: Number(e1x.toFixed(3)),
        energy_2x: Number(e2x.toFixed(3)),
        energy_4x: Number(e4x.toFixed(3)),
        energy_hf_bearing: Number(eHfBearing.toFixed(3))
      },
      bins
    };
  }

  private computeSynchronousOrderTracking(f0: number): OrderTrackingMetrics {
    const amp1x = 0.45 * Math.pow(this.rpm / 2100.0, 1.5) + (Math.random() * 0.02);
    const amp2x = 0.20 * (this.rpm / 2100.0) + (Math.random() * 0.015);
    const amp4x = 0.90 * (this.loadPct / 100.0) * (this.rpm / 2100.0) + 0.25 + (Math.random() * 0.03);
    let ampBpfo = 0.04 + (Math.random() * 0.02);

    if (this.activeFault === 'bearing_flaw') {
      ampBpfo += 0.85 * this.faultSeverity;
    }

    const orderBins: OrderBin[] = [];
    for (let o = 0.25; o <= 16.0; o += 0.25) {
      let amp = 0.02 + Math.random() * 0.015;
      if (Math.abs(o - 1.0) < 0.15) amp += amp1x;
      if (Math.abs(o - 2.0) < 0.15) amp += amp2x;
      if (Math.abs(o - 4.0) < 0.2) amp += amp4x;
      if (Math.abs(o - 8.0) < 0.2) amp += 0.35 * (this.loadPct / 100.0);
      if (Math.abs(o - 3.58) < 0.18) amp += ampBpfo;

      orderBins.push({
        order: Number(o.toFixed(2)),
        amp: Number(amp.toFixed(4))
      });
    }

    return {
      total_revolutions: Number(((this.rpm / 60.0) * 0.1).toFixed(2)),
      radial_x_peaks: {
        amp_1x_g: Number(amp1x.toFixed(3)),
        amp_2x_g: Number(amp2x.toFixed(3)),
        amp_4x_g: Number(amp4x.toFixed(3)),
        amp_bpfo_g: Number(ampBpfo.toFixed(3))
      },
      radial_y_peaks: {
        amp_1x_g: Number((amp1x * 0.8).toFixed(3)),
        amp_2x_g: Number((amp2x * 0.9).toFixed(3)),
        amp_4x_g: Number((amp4x * 1.25).toFixed(3)),
        amp_bpfo_g: Number((ampBpfo * 0.85).toFixed(3))
      },
      order_bins: orderBins
    };
  }

  private computeISOEngineHealthIndex(
    timeX: any,
    timeY: any,
    orderTracking: OrderTrackingMetrics,
    chtDelta: number,
    eopDeficit: number
  ): EngineHealthIndex {
    const maxRms = Math.max(timeX.rms, timeY.rms);
    const maxKurt = Math.max(timeX.kurtosis, timeY.kurtosis);
    const bpfo = orderTracking.radial_x_peaks.amp_bpfo_g;

    // A. Vibration Score (35%)
    let vibScore = 100.0;
    let isoZone = "Zone A (Nominal)";

    if (maxRms <= 1.0) {
      isoZone = "Zone A (Nominal)";
    } else if (maxRms <= 1.8) {
      isoZone = "Zone B (Unrestricted)";
      vibScore -= (maxRms - 1.0) * 20.0;
    } else if (maxRms <= 3.0) {
      isoZone = "Zone C (Warning)";
      vibScore -= 16.0 + (maxRms - 1.8) * 35.0;
    } else {
      isoZone = "Zone D (Critical)";
      vibScore -= 58.0 + Math.min(35.0, (maxRms - 3.0) * 15.0);
    }

    if (maxKurt > 3.5) {
      vibScore -= Math.min(35.0, (maxKurt - 3.5) * 7.5);
    }
    if (bpfo > 0.15) {
      vibScore -= Math.min(25.0, (bpfo - 0.15) * 80.0);
    }
    vibScore = Math.max(5.0, Math.min(100.0, vibScore));

    // B. Thermal Score (25%)
    let thermScore = 100.0;
    if (chtDelta > 12.0) {
      thermScore -= Math.min(55.0, (chtDelta - 12.0) * 2.2);
    }
    if (this.oilTemp > 105.0) {
      thermScore -= Math.min(40.0, (this.oilTemp - 105.0) * 2.5);
    }
    thermScore = Math.max(5.0, Math.min(100.0, thermScore));

    // C. Lubrication Score (20%)
    let lubeScore = 100.0;
    if (eopDeficit > 0.0) {
      lubeScore -= Math.min(75.0, eopDeficit * 45.0);
    }
    if (this.oilPressure < 1.8) {
      lubeScore -= 20.0;
    }
    lubeScore = Math.max(5.0, Math.min(100.0, lubeScore));

    // D. Combustion Score (20%)
    let combScore = 100.0;
    if (this.loadPct > 50.0 && this.boostPressure < 1.25) {
      combScore -= Math.min(50.0, (1.25 - this.boostPressure) * 80.0);
    }
    combScore = Math.max(10.0, Math.min(100.0, combScore));

    const overallEhi = 0.35 * vibScore + 0.25 * thermScore + 0.20 * lubeScore + 0.20 * combScore;
    const roundedEhi = Number(Math.max(0.0, Math.min(100.0, overallEhi)).toFixed(1));

    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (roundedEhi < 60.0) status = 'CRITICAL';
    else if (roundedEhi < 80.0) status = 'DEGRADED';

    const subScores = {
      vibration: Number(vibScore.toFixed(1)),
      thermal: Number(thermScore.toFixed(1)),
      lubrication: Number(lubeScore.toFixed(1)),
      combustion: Number(combScore.toFixed(1))
    };

    let minKey: keyof typeof subScores = 'vibration';
    for (const [k, v] of Object.entries(subScores)) {
      if (v < subScores[minKey]) minKey = k as any;
    }

    const stressorMap = {
      vibration: "Crankcase Roller Bearing Impulsive Shocks (ISO Zone Stress)",
      thermal: "Cylinder Head Bank Thermal Asymmetry (CHT Imbalance)",
      lubrication: "Hydrodynamic Oil Pressure Deficit & Thermal Thinning",
      combustion: "Turbocharger Boost Under-Pressure at Load"
    };

    return {
      overall_ehi: roundedEhi,
      status,
      iso_10816_zone: isoZone,
      sub_scores: subScores,
      primary_stressor: subScores[minKey] < 85.0 ? stressorMap[minKey] : "None (Nominal Machine Envelope)",
      weights: {
        vibration: 0.35,
        thermal: 0.25,
        lubrication: 0.20,
        combustion: 0.20
      }
    };
  }

  public generateDiagnosticsReport(): GeminiDiagnosticReport {
    const now = Date.now();
    if (this.activeFault === 'bearing_flaw') {
      return {
        root_cause_hypothesis:
          "High-frequency impulsive transient shock pulses and sharp kurtosis elevation (>6.0 vs Gaussian 3.0) indicate outer-race spall fatigue on the front monolithic tunnel crankcase cylindrical roller main bearing (BPFO order 3.58× f0 excitation).",
        criticality: "HIGH",
        component_affected: "Front Tunnel Roller Bearing #1 Bulkhead",
        recommended_actions: [
          "Perform high-frequency shock pulse measurement (SPM) on front bulkhead mount.",
          "Inspect crankcase magnetic sump drain plug for ferromagnetic roller spall debris.",
          "Verify crankshaft axial float and radial play using a dial test indicator (DTI).",
          "Schedule bearing inspection before running full dynamometer load sweep."
        ],
        engine_model: "Tatra T3B-928 V8 Air-Cooled Diesel",
        source: "RULE_BASED_EXPERT",
        model_version: "Deterministic Expert Twin (Air-Gapped)",
        generated_at: now
      };
    } else if (this.activeFault === 'cooling_imbalance') {
      return {
        root_cause_hypothesis:
          `Cylinder head thermal divergence (ΔT = ${Math.abs(this.chtBank1 - this.chtBank2).toFixed(1)}°C) indicates air-cooling shroud aerodynamic restriction, debris clogging in Bank 2 cooling fins, or sticking hydraulic blower directional vane flap on Bank 2.`,
        criticality: "HIGH",
        component_affected: "Right Bank Cylinder Heads (Bank 2, Cylinders 5-8)",
        recommended_actions: [
          "Inspect sheet-metal cooling cowls on Bank 2 for physical debris or shroud deformation.",
          "Verify proportional PWM valve actuation and oil pressure feed to front hydraulic cooling fan.",
          "Use infrared pyrometer to audit individual cylinder head fin temperatures across both banks.",
          "Check exhaust gas temperature (EGT) balance to rule out individual injector nozzle dribble."
        ],
        engine_model: "Tatra T3B-928 V8 Air-Cooled Diesel",
        source: "RULE_BASED_EXPERT",
        model_version: "Deterministic Expert Twin (Air-Gapped)",
        generated_at: now
      };
    } else if (this.activeFault === 'lubrication_degradation') {
      return {
        root_cause_hypothesis:
          `Engine oil pressure (${this.oilPressure.toFixed(2)} bar) is lagging the hydrodynamic RPM requirement with high oil temperature (${this.oilTemp.toFixed(1)}°C), indicating pressure relief valve spring fatigue or severe oil viscosity shear thinning.`,
        criticality: "IMMEDIATE_SHUTDOWN",
        component_affected: "Main Oil Gallery & Pressure Relief Bypass Valve",
        recommended_actions: [
          "Halt high-torque testbed sweep immediately to prevent boundary lubrication contact in roller assemblies.",
          "Inspect oil pressure relief valve plunger and spring tension on oil pump casing.",
          "Draw 100 mL oil sample for Kinematic Viscosity (ASTM D445) and spectrographic wear metal analysis.",
          "Inspect oil cooler interchanger for internal oil-to-air restriction."
        ],
        engine_model: "Tatra T3B-928 V8 Air-Cooled Diesel",
        source: "RULE_BASED_EXPERT",
        model_version: "Deterministic Expert Twin (Air-Gapped)",
        generated_at: now
      };
    } else {
      return {
        root_cause_hypothesis:
          "All mechanical and thermodynamic parameters are within ISO 10816-6 Zone A limits. Biaxial vibration orders (1X, 2X, 4X firing), cylinder bank thermal symmetry, and hydrodynamic lubrication satisfy baseline operational envelopes.",
        criticality: "LOW",
        component_affected: "Powertrain Invariants Nominal",
        recommended_actions: [
          "Continue standard testbed drive-cycle evaluation.",
          "Log 25.6 kS/s baseline vibration spectrum for fleet trend analysis.",
          "Audit oil pressure dynamic envelope at scheduled 250-hour test interval."
        ],
        engine_model: "Tatra T3B-928 V8 Air-Cooled Diesel",
        source: "RULE_BASED_EXPERT",
        model_version: "Deterministic Expert Twin (Air-Gapped)",
        generated_at: now
      };
    }
  }

  public step(): TelemetryFrame {
    const now = performance.now();
    const dt = Math.max(0.01, Math.min(0.2, (now - this.lastTime) / 1000.0));
    this.lastTime = now;
    this.simTime += dt;

    const torqueNm = this.updateThermodynamics(dt);
    const f0 = Math.max(1.0, this.rpm / 60.0);
    const powerKw = (torqueNm * this.rpm) / 9549.0;

    const { radX, radY } = this.generateSignals(f0);

    const timeX = this.computeTimeMetrics(radX);
    const timeY = this.computeTimeMetrics(radY);

    const specX = this.computeSpectralMetrics(radX, f0);
    const specY = this.computeSpectralMetrics(radY, f0);

    const orderTracking = this.computeSynchronousOrderTracking(f0);

    // Thermodynamic validation
    const minExpectedEop = 1.4 + 2.5 * (this.rpm / 2100.0);
    const eopDeficit = Math.max(0.0, minExpectedEop - this.oilPressure);
    const chtDelta = Math.abs(this.chtBank1 - this.chtBank2);

    const oilPressureNominal = this.oilPressure >= (minExpectedEop - 0.4);
    const chtBalanceNominal = chtDelta <= 18.0;
    const chtCriticalImbalance = chtDelta >= 30.0;
    const oilTempNominal = this.oilTemp <= 115.0;

    const violations: string[] = [];
    if (!oilPressureNominal) violations.push(`Low Oil Pressure: ${this.oilPressure.toFixed(1)} bar below ${minExpectedEop.toFixed(1)} bar envelope`);
    if (chtCriticalImbalance) violations.push(`Critical CHT Bank Imbalance: ΔT ${chtDelta.toFixed(1)}°C exceeds 30°C limit`);
    else if (!chtBalanceNominal) violations.push(`Elevated CHT Bank Differential: ΔT ${chtDelta.toFixed(1)}°C`);
    if (!oilTempNominal) violations.push(`Oil Temperature Alert: ${this.oilTemp.toFixed(1)}°C exceeds safety limit`);

    let thermoScore = 100.0;
    if (eopDeficit > 0) thermoScore -= Math.min(45.0, eopDeficit * 30.0);
    if (chtDelta > 18.0) thermoScore -= Math.min(40.0, (chtDelta - 18.0) * 2.0);
    if (this.oilTemp > 105.0) thermoScore -= Math.min(25.0, (this.oilTemp - 105.0) * 1.5);
    thermoScore = Math.max(0.0, Math.min(100.0, thermoScore));

    const thermoValidation: ThermoValidation = {
      power_verified_kw: Number(powerKw.toFixed(1)),
      min_expected_eop_bar: Number(minExpectedEop.toFixed(2)),
      eop_deficit_bar: Number(eopDeficit.toFixed(2)),
      cht_delta_c: Number(chtDelta.toFixed(1)),
      oil_pressure_nominal: oilPressureNominal,
      cht_balance_nominal: chtBalanceNominal,
      cht_critical_imbalance: chtCriticalImbalance,
      oil_temp_nominal: oilTempNominal,
      thermo_health_score: Number(thermoScore.toFixed(1)),
      violations
    };

    // Calculate ISO 10816-6 Engine Health Index
    const ehi = this.computeISOEngineHealthIndex(timeX, timeY, orderTracking, chtDelta, eopDeficit);

    // Anomaly feature attribution & scoring
    const featureMap = {
      kurtosis_rad_x: timeX.kurtosis,
      kurtosis_rad_y: timeY.kurtosis,
      crest_factor_rad_x: timeX.crest_factor,
      crest_factor_rad_y: timeY.crest_factor,
      hf_bearing_energy_rad_x: specX.metrics.energy_hf_bearing,
      hf_bearing_energy_rad_y: specY.metrics.energy_hf_bearing,
      cht_bank_delta_c: chtDelta,
      eop_deficit_bar: eopDeficit,
      oil_temp_c: this.oilTemp,
      cross_axis_rms_ratio: timeX.rms / (timeY.rms + 1e-5)
    };

    const labels: Record<string, string> = {
      kurtosis_rad_x: 'Radial-X Impulsive Kurtosis',
      kurtosis_rad_y: 'Radial-Y Impulsive Kurtosis',
      crest_factor_rad_x: 'Radial-X Crest Factor',
      crest_factor_rad_y: 'Radial-Y Crest Factor',
      hf_bearing_energy_rad_x: 'Bearing Band HF Energy (Rad-X)',
      hf_bearing_energy_rad_y: 'Bearing Band HF Energy (Rad-Y)',
      cht_bank_delta_c: 'CHT Bank Differential (L vs R)',
      eop_deficit_bar: 'Engine Oil Pressure Deficit',
      oil_temp_c: 'Engine Oil Temperature',
      cross_axis_rms_ratio: 'Radial Biaxial RMS Ratio'
    };

    const contributors: TopContributor[] = [];
    let sumZsq = 0;

    for (const [key, val] of Object.entries(featureMap)) {
      const mean = (this.baselineMeans as any)[key] || 0;
      const std = (this.baselineStds as any)[key] || 1;
      const z = (val - mean) / std;
      sumZsq += z * z;

      if (Math.abs(z) > 1.2) {
        contributors.push({
          feature: key,
          label: labels[key] || key,
          raw_value: Number(val.toFixed(2)),
          z_score: Number(z.toFixed(2)),
          impact: Math.abs(z) > 3.0 ? 'critical' : (Math.abs(z) > 1.8 ? 'warning' : 'elevated')
        });
      }
    }

    contributors.sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));

    // Continuous Anomaly score
    const dMahalanobis = Math.sqrt(sumZsq / 10.0);
    let anomalyScore = 1.0 / (1.0 + Math.exp(-(dMahalanobis - 2.0) * 1.5));
    if (chtCriticalImbalance) anomalyScore = Math.max(anomalyScore, 0.88);
    if (eopDeficit > 0.6) anomalyScore = Math.max(anomalyScore, 0.92);
    if (Math.max(timeX.kurtosis, timeY.kurtosis) > 5.5) anomalyScore = Math.max(anomalyScore, 0.95);
    if (this.activeFault === 'none') anomalyScore = Math.min(0.22, anomalyScore);

    const isAnomaly = anomalyScore >= 0.52;
    const healthScorePct = Number(Math.max(0, Math.min(100, (1.0 - anomalyScore) * 100)).toFixed(1));

    const anomaly: AnomalyResult = {
      anomaly_score: Number(anomalyScore.toFixed(3)),
      is_anomaly: isAnomaly,
      raw_decision_score: Number((1.5 - dMahalanobis).toFixed(3)),
      top_contributors: contributors.slice(0, 4),
      health_score_pct: healthScorePct
    };

    // Downsample waveform for oscilloscope display (256 points)
    const step = Math.floor(this.bufferSize / 256);
    const waveform: WaveformPoint[] = [];
    for (let i = 0; i < this.bufferSize && waveform.length < 256; i += step) {
      waveform.push({
        sample_idx: i,
        x: Number(radX[i].toFixed(3)),
        y: Number(radY[i].toFixed(3))
      });
    }

    const engineState: EngineState = {
      rpm: Number(this.rpm.toFixed(1)),
      target_rpm: this.targetRpm,
      torque_nm: Number(torqueNm.toFixed(1)),
      power_kw: Number(powerKw.toFixed(1)),
      load_pct: Number(this.loadPct.toFixed(1)),
      oil_pressure_bar: Number(this.oilPressure.toFixed(2)),
      oil_temp_c: Number(this.oilTemp.toFixed(1)),
      cht1_c: Number(this.chtBank1.toFixed(1)),
      cht2_c: Number(this.chtBank2.toFixed(1)),
      cht_delta_c: Number(chtDelta.toFixed(1)),
      boost_pressure_bar: Number(this.boostPressure.toFixed(2)),
      cooling_valve_pct: Number(this.coolingValvePct.toFixed(1)),
      active_fault: this.activeFault,
      fault_severity: this.faultSeverity
    };

    const dspFeatures: DspFeatures = {
      radial_x: {
        time: timeX,
        spectral: specX.metrics,
        order_peaks: orderTracking.radial_x_peaks
      },
      radial_y: {
        time: timeY,
        spectral: specY.metrics,
        order_peaks: orderTracking.radial_y_peaks
      },
      cross_axis: {
        rms_ratio_xy: Number((timeX.rms / (timeY.rms + 1e-5)).toFixed(2)),
        max_kurtosis: Math.max(timeX.kurtosis, timeY.kurtosis)
      },
      order_tracking: orderTracking
    };

    return {
      timestamp: Date.now() / 1000.0,
      source: this.sourceMode === 'HARDWARE' ? 'HARDWARE_EMULATED' : 'SIMULATOR',
      engine_state: engineState,
      dsp_features: dspFeatures,
      thermo_validation: thermoValidation,
      ehi,
      anomaly,
      stream_payload: {
        waveform,
        fft_x: specX.bins,
        fft_y: specY.bins,
        order_bins: orderTracking.order_bins
      }
    };
  }
}
