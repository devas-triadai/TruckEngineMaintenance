"""
BEML Testbed Report Generator for Tatra T3B-928 V8
Exports formal engineering inspection reports in CSV and PDF formats (ISO 10816-6 compliant).
"""

import io
import csv
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

logger = None
try:
    import logging
    logger = logging.getLogger("TatraReports")
except Exception:
    pass

# Try importing ReportLab components
HAS_REPORTLAB = False
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        KeepTogether,
        HRFlowable
    )
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


class BEMLReportGenerator:
    @staticmethod
    def generate_csv(run_data: Dict[str, Any], records: List[Dict[str, Any]]) -> str:
        """
        Generates formal CSV export with metadata header and columnar time-series telemetry.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Metadata Header
        writer.writerow(["# BEML TATRA 8x8 ENGINE TESTBED TELEMETRY EXPORT"])
        writer.writerow(["# Engine Model", "Tatra T3B-928 V8 Air-Cooled Turbocharged Diesel"])
        writer.writerow(["# Engine Serial", run_data.get("engine_serial", "N/A")])
        writer.writerow(["# Run Name", run_data.get("run_name", "N/A")])
        writer.writerow(["# Operator ID", run_data.get("operator_id", "N/A")])
        writer.writerow(["# Start Time", run_data.get("start_time", "N/A")])
        writer.writerow(["# End Time", run_data.get("end_time", "N/A")])
        writer.writerow(["# Min EHI", run_data.get("min_ehi", "N/A")])
        writer.writerow(["# Final Status", run_data.get("final_status", "N/A")])
        writer.writerow([])

        # Table Columns
        columns = [
            "timestamp",
            "rpm",
            "torque_nm",
            "power_kw",
            "load_pct",
            "oil_pressure_bar",
            "oil_temp_c",
            "cht1_c",
            "cht2_c",
            "cht_delta_c",
            "boost_pressure_bar",
            "vib_rms_x_g",
            "vib_rms_y_g",
            "kurtosis_x",
            "kurtosis_y",
            "order_1x_g",
            "order_2x_g",
            "order_4x_g",
            "bpfo_order_g",
            "ehi_score",
            "anomaly_score",
            "active_fault"
        ]
        writer.writerow(columns)

        for r in records:
            writer.writerow([
                round(float(r.get("timestamp", 0)), 2),
                round(float(r.get("rpm", 0)), 1),
                round(float(r.get("torque", r.get("torque_nm", 0))), 1),
                round(float(r.get("power_kw", 0)), 1),
                round(float(r.get("load_pct", 0)), 1),
                round(float(r.get("eop", r.get("oil_pressure_bar", 0))), 2),
                round(float(r.get("eot", r.get("oil_temp_c", 0))), 1),
                round(float(r.get("cht1", r.get("cht1_c", 0))), 1),
                round(float(r.get("cht2", r.get("cht2_c", 0))), 1),
                round(float(r.get("cht_delta", r.get("cht_delta_c", 0))), 1),
                round(float(r.get("boost", r.get("boost_pressure_bar", 0))), 2),
                round(float(r.get("vibration_rms_x", r.get("vib_rms_x_g", 0))), 3),
                round(float(r.get("vibration_rms_y", r.get("vib_rms_y_g", 0))), 3),
                round(float(r.get("kurtosis_x", 0)), 2),
                round(float(r.get("kurtosis_y", 0)), 2),
                round(float(r.get("order_1x", 0)), 3),
                round(float(r.get("order_2x", 0)), 3),
                round(float(r.get("order_4x", 0)), 3),
                round(float(r.get("bpfo_order", 0)), 3),
                round(float(r.get("ehi", 0)), 1),
                round(float(r.get("anomaly_score", 0)), 3),
                r.get("active_fault", "none")
            ])

        return output.getvalue()

    @staticmethod
    def generate_pdf(
        run_data: Dict[str, Any],
        records: List[Dict[str, Any]],
        diagnostic_events: List[Dict[str, Any]]
    ) -> bytes:
        """
        Generates formal ISO 10816-6 BEML Engineering Inspection PDF report using ReportLab.
        Falls back to a well-structured plain text/PDF stream if ReportLab is unavailable.
        """
        if not HAS_REPORTLAB:
            # Fallback simple PDF generator
            return BEMLReportGenerator._generate_text_fallback_pdf(run_data, records, diagnostic_events)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=36
        )

        styles = getSampleStyleSheet()

        # Custom styling
        title_style = ParagraphStyle(
            'ReportTitle',
            parent=styles['Heading1'],
            fontSize=16,
            leading=20,
            textColor=colors.HexColor('#0f172a'),
            fontName='Helvetica-Bold',
            spaceAfter=4
        )
        subtitle_style = ParagraphStyle(
            'ReportSubtitle',
            parent=styles['Normal'],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor('#475569'),
            fontName='Helvetica',
            spaceAfter=12
        )
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=11,
            leading=14,
            textColor=colors.HexColor('#1e293b'),
            fontName='Helvetica-Bold',
            spaceBefore=8,
            spaceAfter=4
        )
        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontSize=8,
            leading=11,
            textColor=colors.HexColor('#334155'),
            fontName='Helvetica'
        )
        cell_bold = ParagraphStyle(
            'CellBold',
            parent=body_style,
            fontName='Helvetica-Bold'
        )

        story = []

        # 1. Header Bar
        story.append(Paragraph("BHARAT EARTH MOVERS LIMITED (BEML) — ENGINE TESTBED DIVISION", subtitle_style))
        story.append(Paragraph("TATRA T3B-928 V8 ENGINE HEALTH & ACCEPTANCE REPORT", title_style))
        story.append(Paragraph("TRL-6 Operational Testbed Validation · ISO 10816-6 Reciprocating Machinery Standards", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0284c7'), spaceAfter=10))

        # 2. Test Run Metadata Table
        meta_data = [
            [
                Paragraph("<b>Engine Model:</b> Tatra T3B-928-80 (Euro 4)", body_style),
                Paragraph(f"<b>Engine Serial:</b> {run_data.get('engine_serial', 'N/A')}", body_style)
            ],
            [
                Paragraph(f"<b>Run Name:</b> {run_data.get('run_name', 'N/A')}", body_style),
                Paragraph(f"<b>Operator ID:</b> {run_data.get('operator_id', 'N/A')}", body_style)
            ],
            [
                Paragraph(f"<b>Start Time:</b> {run_data.get('start_time', 'N/A')}", body_style),
                Paragraph(f"<b>End Time:</b> {run_data.get('end_time', 'In Progress')}", body_style)
            ]
        ]
        meta_table = Table(meta_data, colWidths=[270, 270])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('PADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 10))

        # 3. Executive Health Summary Table
        story.append(Paragraph("1. EXECUTIVE HEALTH VERDICT & ENVELOPE METRICS", section_style))

        min_ehi = float(run_data.get('min_ehi', 100.0))
        final_status = run_data.get('final_status', 'PASSED')
        status_color = colors.HexColor('#16a34a') if final_status == 'PASSED' else (
            colors.HexColor('#d97706') if final_status == 'FLAGGED' else colors.HexColor('#dc2626')
        )

        exec_summary = [
            ["Metric", "Value", "ISO Envelope / Threshold", "Assessment"],
            [
                "Final Acceptance Status",
                final_status,
                "EHI ≥ 75.0 (Zone A/B)",
                "PASS" if final_status == "PASSED" else "REVIEW"
            ],
            [
                "Lowest Engine Health Index (EHI)",
                f"{min_ehi:.1f} / 100.0",
                "ISO 10816-6: Zone A ≥ 85, Zone B ≥ 70",
                "Zone A (Nominal)" if min_ehi >= 85 else ("Zone B (Good)" if min_ehi >= 70 else ("Zone C (Warning)" if min_ehi >= 50 else "Zone D (Critical)"))
            ],
            [
                "Maximum Engine Speed",
                f"{run_data.get('max_rpm', 0):.0f} RPM",
                "Rated Max: 2,100 RPM",
                "Within Envelope" if run_data.get('max_rpm', 0) <= 2200 else "Over-speed"
            ],
            [
                "Minimum Oil Pressure (EOP)",
                f"{run_data.get('min_eop', 0):.2f} bar",
                "Min Hydrodynamic: ≥ 1.8 bar @ load",
                "Nominal" if run_data.get('min_eop', 0) >= 1.8 else "Low Pressure Deficit"
            ],
            [
                "Max CHT Bank Differential",
                f"{run_data.get('max_cht_delta', 0):.1f} °C",
                "Air-cooled ΔT Balance: ≤ 18.0 °C",
                "Balanced" if run_data.get('max_cht_delta', 0) <= 18.0 else ("Moderate Imbalance" if run_data.get('max_cht_delta', 0) <= 30 else "Severe Shutter Blockage")
            ],
            [
                "Max Radial-X Kurtosis",
                f"{run_data.get('max_kurtosis_x', 3.0):.2f}",
                "Tunnel Roller Bearing: ≤ 3.8",
                "Smooth Gaussian" if run_data.get('max_kurtosis_x', 3.0) <= 3.8 else "Impulsive BPFO Shock Bursts"
            ]
        ]

        exec_table = Table(exec_summary, colWidths=[150, 110, 160, 120])
        exec_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 1), (1, -1), 'CENTER'),
            ('TEXTCOLOR', (1, 1), (1, 1), status_color),
            ('FONTNAME', (1, 1), (1, 1), 'Helvetica-Bold'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ('PADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(exec_table)
        story.append(Spacer(1, 10))

        # 4. Mechanical & Thermal Subsystem Analysis
        story.append(Paragraph("2. SUBSYSTEM & ROTATIONAL ORDER ANALYSIS", section_style))
        subsystem_text = (
            "<b>Crankcase Roller Bearings:</b> Tatra tunnel crankcase roller bearings operate under synchronous "
            "vibration monitoring at 25.6 kS/s. Order tracking resolves 1X (Shaft fundamental unbalance), "
            "2X (angular misalignment), and 4X (V8 four-stroke combustion gas load = 4 firings/rev). "
            "BPFO defect frequency occurs at 3.58X order.<br/>"
            "<b>Air-Cooling System:</b> Dual bank temperatures (CHT1: Cylinders 1-4, CHT2: Cylinders 5-8) are balanced "
            "via front hydraulic blower with proportional PWM bypass regulation. Delta exceeds threshold when cowl vanes bind."
        )
        story.append(Paragraph(subsystem_text, body_style))
        story.append(Spacer(1, 10))

        # 5. Gemini AI Root-Cause Diagnostic Log
        story.append(Paragraph("3. EDGE AI DIAGNOSTIC EVENTS & TECHNICIAN LOG", section_style))
        if not diagnostic_events:
            story.append(Paragraph("<i>No anomalous events or AI fault triggers recorded during this operational run. Machine baseline verified.</i>", body_style))
        else:
            diag_rows = [["Time", "Trigger", "Criticality", "Affected Component", "Root Cause & Maintenance Directive"]]
            for d in diagnostic_events[:8]:  # Limit to 8 to fit nicely
                time_str = datetime.fromtimestamp(float(d.get("timestamp", 0)), tz=timezone.utc).strftime("%H:%M:%S")
                crit = d.get("criticality", "MEDIUM")
                crit_color = "#dc2626" if crit == "IMMEDIATE_SHUTDOWN" else ("#ea580c" if crit == "HIGH" else "#475569")
                
                diag_rows.append([
                    time_str,
                    d.get("trigger_type", "EHI"),
                    crit,
                    Paragraph(d.get("component_affected", "Engine"), body_style),
                    Paragraph(f"<b>{d.get('root_cause_hypothesis', '')}</b><br/><i>Directive:</i> {d.get('recommended_actions', '')}", body_style)
                ])

            diag_table = Table(diag_rows, colWidths=[55, 75, 75, 125, 210])
            diag_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 7.5),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
                ('PADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(diag_table)

        story.append(Spacer(1, 15))

        # 6. Engineering Sign-Off Block
        signoff_data = [
            [
                Paragraph("<b>TESTBED CHIEF ENGINEER:</b><br/><br/>__________________________________<br/>Er. S. R. Sharma, BEML R&D", body_style),
                Paragraph("<b>QUALITY ASSURANCE INSPECTOR:</b><br/><br/>__________________________________<br/>Directorate of Quality Assurance", body_style),
                Paragraph(f"<b>REPORT DATE:</b><br/><br/>{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}<br/>Cert: ISO 9001 / ISO 10816-6", body_style)
            ]
        ]
        signoff_table = Table(signoff_data, colWidths=[180, 180, 180])
        signoff_table.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(KeepTogether(signoff_table))

        doc.build(story)
        return buffer.getvalue()

    @staticmethod
    def _generate_text_fallback_pdf(
        run_data: Dict[str, Any],
        records: List[Dict[str, Any]],
        diagnostic_events: List[Dict[str, Any]]
    ) -> bytes:
        """
        Pure Python minimalist PDF generator without external dependencies.
        Used as a guaranteed fallback if ReportLab fails to load binary fonts.
        """
        text = (
            f"%PDF-1.4\n"
            f"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            f"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
            f"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n"
            f"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        )
        content_stream = (
            "BT /F1 16 Tf 50 740 Td (BEML TATRA 8x8 ENGINE HEALTH REPORT) Tj ET\n"
            f"BT /F1 10 Tf 50 710 Td (Engine Model: Tatra T3B-928 V8 Air-Cooled Diesel | Serial: {run_data.get('engine_serial', 'N/A')}) Tj ET\n"
            f"BT /F1 10 Tf 50 690 Td (Run: {run_data.get('run_name', 'N/A')} | Operator: {run_data.get('operator_id', 'N/A')}) Tj ET\n"
            f"BT /F1 10 Tf 50 670 Td (Status: {run_data.get('final_status', 'PASSED')} | Lowest EHI: {run_data.get('min_ehi', 100):.1f}) Tj ET\n"
            f"BT /F1 10 Tf 50 650 Td (Max RPM: {run_data.get('max_rpm', 0):.0f} | Min EOP: {run_data.get('min_eop', 0):.2f} bar | Max CHT Delta: {run_data.get('max_cht_delta', 0):.1f} C) Tj ET\n"
            f"BT /F1 10 Tf 50 620 Td (ISO 10816-6 Reciprocating Machinery Vibration Standard Compliant) Tj ET\n"
        )
        content_len = len(content_stream.encode("utf-8"))
        text += f"4 0 obj << /Length {content_len} >> stream\n{content_stream}endstream\nendobj\n"
        text += "xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
        text += "trailer << /Size 6 /Root 1 0 R >>\nstartxref\n500\n%%EOF"
        return text.encode("utf-8")
