"""
Unsupervised Baseline Anomaly Detector for Tatra T3B-928 V8
Combines Isolation Forest with feature-attribution z-score deviation
to provide continuous Anomaly Score (0.0 to 1.0), binary alarm flag,
and explainable top-contributing engineering features.
"""

import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


FEATURE_NAMES = [
    "kurtosis_rad_x",
    "kurtosis_rad_y",
    "crest_factor_rad_x",
    "crest_factor_rad_y",
    "hf_bearing_energy_rad_x",
    "hf_bearing_energy_rad_y",
    "cht_bank_delta_c",
    "eop_deficit_bar",
    "oil_temp_c",
    "cross_axis_rms_ratio"
]

FEATURE_LABELS = {
    "kurtosis_rad_x": "Radial-X Impulsive Kurtosis",
    "kurtosis_rad_y": "Radial-Y Impulsive Kurtosis",
    "crest_factor_rad_x": "Radial-X Crest Factor",
    "crest_factor_rad_y": "Radial-Y Crest Factor",
    "hf_bearing_energy_rad_x": "Bearing Band HF Energy (Rad-X)",
    "hf_bearing_energy_rad_y": "Bearing Band HF Energy (Rad-Y)",
    "cht_bank_delta_c": "CHT Bank Differential (Left vs Right)",
    "eop_deficit_bar": "Engine Oil Pressure Deficit",
    "oil_temp_c": "Engine Oil Temperature",
    "cross_axis_rms_ratio": "Radial Biaxial RMS Ratio"
}


class EngineAnomalyDetector:
    def __init__(self, contamination: float = 0.04):
        self.contamination = contamination
        self.scaler = StandardScaler()
        self.model = IsolationForest(
            n_estimators=100,
            contamination=contamination,
            random_state=42,
            n_jobs=-1
        )
        self.is_trained: bool = False
        self.baseline_mean: Optional[np.ndarray] = None
        self.baseline_std: Optional[np.ndarray] = None
        self.score_offset: float = 0.5
        self.score_scale: float = 0.5

    @staticmethod
    def extract_features(dsp_frame: Dict[str, Any]) -> np.ndarray:
        """
        Extracts the 10-dimensional operational feature vector from DSP and thermodynamic metrics.
        """
        dsp = dsp_frame["dsp_features"]
        thermo = dsp_frame["thermo_validation"]
        state = dsp_frame["engine_state"]
        
        fx = dsp["radial_x"]
        fy = dsp["radial_y"]
        cross = dsp["cross_axis"]
        
        vec = [
            float(fx["time"]["kurtosis"]),
            float(fy["time"]["kurtosis"]),
            float(fx["time"]["crest_factor"]),
            float(fy["time"]["crest_factor"]),
            float(fx["spectral"]["energy_hf_bearing"]),
            float(fy["spectral"]["energy_hf_bearing"]),
            float(thermo["cht_delta_c"]),
            float(thermo["eop_deficit_bar"]),
            float(state["oil_temp_c"]),
            float(cross["rms_ratio_xy"])
        ]
        return np.array(vec, dtype=np.float32)

    def train_baseline_synthetic(self, n_samples: int = 600) -> Dict[str, Any]:
        """
        Trains baseline model on healthy nominal operational points across
        the full engine operating envelope (800 to 2000 RPM, 10% to 95% load).
        """
        rng = np.random.default_rng(seed=1928)
        
        # Synthesize nominal healthy feature vectors
        X_train = []
        for _ in range(n_samples):
            rpm = rng.uniform(750, 2100)
            load = rng.uniform(10, 90)
            
            # Normal vibration kurtosis is Gaussian-like (~2.8 to 3.25)
            kurt_x = rng.normal(3.02, 0.12)
            kurt_y = rng.normal(2.98, 0.11)
            
            # Crest factor ~ 2.8 to 3.8
            cf_x = rng.normal(3.2, 0.25)
            cf_y = rng.normal(3.1, 0.22)
            
            # HF bearing energy (quiet background ~ 0.05 to 0.15 g)
            hf_x = rng.normal(0.08, 0.02)
            hf_y = rng.normal(0.07, 0.02)
            
            # CHT bank delta (nominal 0.5 to 4.5 °C)
            cht_delta = abs(rng.normal(2.0, 1.2))
            
            # Oil pressure deficit (0.0 bar when nominal)
            eop_deficit = max(0.0, rng.normal(0.0, 0.02))
            
            # Oil temperature nominal (85 to 102 °C)
            oil_temp = 86.0 + (load * 0.15) + rng.normal(0.0, 2.5)
            
            # Biaxial ratio
            cross_ratio = rng.normal(1.05, 0.08)
            
            vec = [
                kurt_x, kurt_y, cf_x, cf_y,
                hf_x, hf_y, cht_delta, eop_deficit,
                oil_temp, cross_ratio
            ]
            X_train.append(vec)
            
        X = np.array(X_train, dtype=np.float32)
        
        # Fit scaler
        X_scaled = self.scaler.fit_transform(X)
        self.baseline_mean = self.scaler.mean_
        self.baseline_std = self.scaler.scale_
        
        # Fit Isolation Forest
        self.model.fit(X_scaled)
        
        # Calibrate baseline scores
        baseline_raw_scores = self.model.decision_function(X_scaled)
        self.score_offset = float(np.median(baseline_raw_scores))
        self.score_scale = float(np.std(baseline_raw_scores) + 1e-5)
        
        self.is_trained = True
        return {
            "status": "trained",
            "samples_count": n_samples,
            "feature_count": len(FEATURE_NAMES),
            "features": FEATURE_NAMES,
            "score_offset": round(self.score_offset, 3),
            "score_scale": round(self.score_scale, 3)
        }

    def predict_frame(self, dsp_frame: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates a processed telemetry frame and returns:
        - anomaly_score: 0.000 to 1.000
        - is_anomaly: bool
        - top_contributors: list of feature deviations
        """
        if not self.is_trained:
            self.train_baseline_synthetic()

        feat_vec = self.extract_features(dsp_frame)
        feat_vec_2d = feat_vec.reshape(1, -1)
        feat_scaled = self.scaler.transform(feat_vec_2d)
        
        # Raw decision score: positive is normal, negative is abnormal
        raw_score = float(self.model.decision_function(feat_scaled)[0])
        
        # Transform raw score to normalized Anomaly Score in [0.0, 1.0]
        # Invert so 0.0 = completely healthy, 1.0 = severe anomaly
        # Normal score centered around 0.15 - 0.25; anomalies surge > 0.50
        z_score = (self.score_offset - raw_score) / (self.score_scale * 1.5)
        anomaly_score = float(1.0 / (1.0 + np.exp(-z_score * 1.8)))
        
        # Heuristic boost if physical laws violated
        thermo = dsp_frame.get("thermo_validation", {})
        if thermo.get("cht_critical_imbalance", False):
            anomaly_score = max(anomaly_score, 0.88)
        if thermo.get("eop_deficit_bar", 0.0) > 0.6:
            anomaly_score = max(anomaly_score, 0.92)
        if dsp_frame["dsp_features"]["cross_axis"]["max_kurtosis"] > 5.5:
            anomaly_score = max(anomaly_score, 0.94)

        anomaly_score = max(0.0, min(1.0, anomaly_score))
        is_anomaly = anomaly_score >= 0.52

        # Compute feature attribution (z-score difference relative to baseline training mean)
        z_deviations = (feat_vec - self.baseline_mean) / (self.baseline_std + 1e-6)
        
        # Rank by absolute deviation
        ranked_indices = np.argsort(np.abs(z_deviations))[::-1]
        top_contributors = []
        for idx in ranked_indices[:4]:
            z_dev = float(z_deviations[idx])
            if abs(z_dev) > 1.2 or (anomaly_score > 0.4 and abs(z_dev) > 0.8):
                feat_key = FEATURE_NAMES[idx]
                top_contributors.append({
                    "feature": feat_key,
                    "label": FEATURE_LABELS[feat_key],
                    "raw_value": round(float(feat_vec[idx]), 2),
                    "z_score": round(z_dev, 2),
                    "impact": "critical" if abs(z_dev) > 3.0 else ("warning" if abs(z_dev) > 1.8 else "elevated")
                })

        return {
            "anomaly_score": round(anomaly_score, 3),
            "is_anomaly": is_anomaly,
            "raw_decision_score": round(raw_score, 4),
            "top_contributors": top_contributors,
            "health_score_pct": round(max(0.0, min(100.0, (1.0 - anomaly_score) * 100.0)), 1)
        }
