import json
import csv
from datetime import datetime

def generate_report(findings: list, video_path: str) -> dict:
    report = {
        "inspection_date": datetime.now().isoformat(),
        "video_source": video_path,
        "total_findings": len(findings),
        "critical_count": len([f for f in findings if f["severity"] == "high"]),
        "summary": build_summary(findings),
        "findings": findings
    }

    # Save JSON report
    with open("data/report.json", "w") as f:
        json.dump(report, f, indent=2)

    # Save CSV for work order systems
    save_csv(findings)

    print(f"\nReport saved to data/report.json")
    print(f"CSV saved to data/findings.csv")
    return report

def build_summary(findings):
    types = {}
    for f in findings:
        types[f["type"]] = types.get(f["type"], 0) + 1
    lines = []
    for t, count in types.items():
        lines.append(f"{count} {t} finding(s)")
    return ", ".join(lines) if lines else "No anomalies detected"

def save_csv(findings):
    if not findings:
        return
    with open("data/findings.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["timestamp", "type", "severity", "confidence", "description"])
        writer.writeheader()
        for finding in findings:
            writer.writerow({
                "timestamp": finding["timestamp"],
                "type": finding["type"],
                "severity": finding["severity"],
                "confidence": f"{finding['confidence']:.2f}",
                "description": finding["description"]
            })