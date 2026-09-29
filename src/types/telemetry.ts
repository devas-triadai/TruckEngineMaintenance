/**
 * Telemetry data types for Tatra T3B-928 V8 Predictive Maintenance Testbed (TRL-5)
 */

export interface EngineState {
  rpm: number;
  target_rpm: number;
  torque_nm: number;
  power_kw: number;
  load_pct: number;
  oil_pressure_bar: number;
  oil_temp_c: number;
  cht1_c: number;
  cht2_c: number;
  cht_delta_c: number;
  boost_pressure_bar: number;
  cooling_valve_pct: number;
  active_fault: 'none' | 'bearing_flaw' | 'cooling_imbalance' | 'lubrication_degradation';
  fault_severity: number;
}

export interface TimeDomainMetrics {
  rms: number;
  peak: number;
  peak_to_peak: number;
  crest_factor: number;
  kurtosis: number;
  skewness: number;
}

export interface SpectralMetrics {
  f0_shaft_hz: number;
  f4_firing_hz: number;
  dominant_freq_hz: number;
  dominant_amp_g: number;
  energy_sub_sync: number;
  energy_1x: number;
  energy_2x: number;
  energy_4x: number;
  energy_hf_bearing: number;
}

export interface OrderPeakMetrics {
  amp_1x_g: number;
  amp_2x_g: number;
  amp_4x_g: number;
  amp_bpfo_g: number;
}

export interface OrderBin {
  order: number;
  amp: number;
}

export interface OrderTrackingMetrics {
  total_revolutions: number;
  radial_x_peaks: OrderPeakMetrics;
  radial_y_peaks: OrderPeakMetrics;
  order_bins: OrderBin[];
}

export interface AxisDspFeatures {
  time: TimeDomainMetrics;
  spectral: SpectralMetrics;
  order_peaks?: OrderPeakMetrics;
}

export interface CrossAxisFeatures {
  rms_ratio_xy: number;
  max_kurtosis: number;
}

export interface DspFeatures {
  radial_x: AxisDspFeatures;
  radial_y: AxisDspFeatures;
  cross_axis: CrossAxisFeatures;
  order_tracking?: OrderTrackingMetrics;
}

export interface ThermoValidation {
  power_verified_kw: number;
  min_expected_eop_bar: number;
  eop_deficit_bar: number;
  cht_delta_c: number;
  oil_pressure_nominal: boolean;
  cht_balance_nominal: boolean;
  cht_critical_imbalance: boolean;
  oil_temp_nominal: boolean;
  thermo_health_score: number;
  violations: string[];
}

export interface HealthSubScores {
  vibration: number;
  thermal: number;
  lubrication: number;
  combustion: number;
}

export interface EngineHealthIndex {
  overall_ehi: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  iso_10816_zone: string;
  sub_scores: HealthSubScores;
  primary_stressor: string;
  weights: {
    vibration: number;
    thermal: number;
    lubrication: number;
    combustion: number;
  };
}

export interface TopContributor {
  feature: string;
  label: string;
  raw_value: number;
  z_score: number;
  impact: 'critical' | 'warning' | 'elevated';
}

export interface AnomalyResult {
  anomaly_score: number;
  is_anomaly: boolean;
  raw_decision_score: number;
  top_contributors: TopContributor[];
  health_score_pct: number;
}

export interface WaveformPoint {
  sample_idx: number;
  x: number;
  y: number;
}

export interface FftPoint {
  freq: number;
  amp: number;
  db: number;
}

export interface StreamPayload {
  waveform: WaveformPoint[];
  fft_x: FftPoint[];
  fft_y: FftPoint[];
  order_bins?: OrderBin[];
}

export interface GeminiDiagnosticReport {
  root_cause_hypothesis: string;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE_SHUTDOWN';
  component_affected: string;
  recommended_actions: string[];
  engine_model: string;
  source: string;
  model_version: string;
  generated_at?: number;
}

export interface TelemetryFrame {
  timestamp: number;
  source?: string;
  engine_state: EngineState;
  dsp_features: DspFeatures;
  thermo_validation: ThermoValidation;
  ehi?: EngineHealthIndex;
  anomaly: AnomalyResult;
  stream_payload: StreamPayload;
}
