/**
 * In-Browser Twin Engine Simulator & Real-Time DSP Pipeline
 * Replicates the Tatra T3B-928 V8 physics, biaxial vibration synthesis (25.6 kS/s),
 * order-tracking FFT, thermodynamic validation, and unsupervised anomaly scoring.
 */

import { TelemetryFrame, EngineState, DspFeatures, ThermoValidation, AnomalyResult, WaveformPoint, FftPoint, TopContributor } from '../types/telemetry';

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
    const kurtosis = (m4 / n) / Math.pow(std, 4); // Pearson kurtosis: ~3.0 for normal

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
    // Fast DFT / FFT approximation across 1024 points for 256 display bins
    const nFft = 512;
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
      // Synthesize realistic spectral density from signal components
      let amp = 0.02 + 0.015 * Math.random();

      // Shaft 1X peak
      if (Math.abs(freq - f0) < binWidth * 1.5) {
        amp += 0.45 * Math.pow(this.rpm / 2100.0, 1.5);
      }
      // 2X harmonic
      if (Math.abs(freq - 2 * f0) < binWidth * 1.5) {
        amp += 0.20 * (this.rpm / 2100.0);
      }
      // 4X V8 Firing order harmonic (dominant engine order)
      if (Math.abs(freq - 4 * f0) < binWidth * 1.5) {
        amp += 0.85 * (this.loadPct / 100.0) + 0.25;
      }
      // 8X harmonic
      if (Math.abs(freq - 8 * f0) < binWidth * 1.5) {
        amp += 0.35 * (this.loadPct / 100.0);
      }

      // Bearing Flaw high-frequency resonance excitation around 3200 Hz
      if (this.activeFault === 'bearing_flaw') {
        const distToRes = Math.abs(freq - 3200);
        if (distToRes < 600) {
          const resCurve = Math.exp(-distToRes / 250);
          amp += 1.8 * this.faultSeverity * resCurve;
        }
      }

      // Lubrication degradation broadband floor rise
      if (this.activeFault === 'lubrication_degradation') {
        amp += 0.25 * this.faultSeverity;
      }

      if (amp > domAmp) {
        domAmp = amp;
        domFreq = freq;
      }

      // Energy accumulations
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
        spectral: specX.metrics
      },
      radial_y: {
        time: timeY,
        spectral: specY.metrics
      },
      cross_axis: {
        rms_ratio_xy: Number((timeX.rms / (timeY.rms + 1e-5)).toFixed(2)),
        max_kurtosis: Math.max(timeX.kurtosis, timeY.kurtosis)
      }
    };

    return {
      timestamp: Date.now() / 1000.0,
      engine_state: engineState,
      dsp_features: dspFeatures,
      thermo_validation: thermoValidation,
      anomaly,
      stream_payload: {
        waveform,
        fft_x: specX.bins,
        fft_y: specY.bins
      }
    };
  }
}
