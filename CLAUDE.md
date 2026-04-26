# InfraWatch — Backend Context for Claude Code

## What This Project Is
Automated pipeline inspection system using TwelveLabs Pegasus + Marengo on AWS Bedrock.
Fuses drone video + sensor telemetry + GPS to detect infrastructure anomalies.

## Backend Stack
- Python + FastAPI + SSE
- AWS S3 (data storage) + SageMaker (AI processing)
- TwelveLabs Pegasus 1.2 (video analysis)
- TwelveLabs Marengo 3.0 (frame embeddings)

## Running The API
```bash
cd ~/Workspace/projects/infrawatch
source env/bin/activate
python -m uvicorn src.api:app --reload --port 8000
```

## API Endpoints

GET /                    — health check
GET /chunks              — all 12 processed chunks
GET /findings            — 7 anomaly findings sorted by risk score
GET /report              — full inspection report
GET /stream?speed=8      — SSE stream (main endpoint for frontend)

## SSE Stream Events

The frontend connects to /stream and receives these events:

event: start
data: {"type":"start","total_chunks":12}

event: position
data: {"type":"position","lat":38.609,"lon":-90.186,"timestamp_video":"00:15","chunk_index":1,"original_video":"pipeline_thermal_rgb.mp4"}

event: sensor
data: {"type":"sensor","methane_ppm":9.1,"temp_differential_c":14.5,"pressure_psi":825,"phmsa_violation":"PHMSA Part 192: 9.1ppm CRITICAL"}

event: chunk_status
data: {"type":"chunk_status","chunk_index":1,"chunk_total":12,"progress_pct":8.3,"timestamp_video":"00:15"}

event: finding
data: {"type":"finding","finding_id":"chunk_0000","lat":38.609,"lon":-90.186,"anomaly_type":"corrosion|thermal_anomaly","severity":"medium","risk_level":"CRITICAL","composite_risk_score":85,"description":"...","regulatory_violations":["PHMSA Part 192: 9.1ppm CRITICAL"],"people_present":true,"animals_present":false,"sensor":{...}}

event: complete
data: {"type":"complete","total_findings":7,"critical_count":2}

## Risk Levels and Colors
CRITICAL → red   (score >= 70)
HIGH     → orange (score >= 50)
MEDIUM   → yellow (score >= 30)
LOW      → green  (score < 30)

## Drone Route GPS Points
The drone follows this route around St. Louis TX-447 pipeline:
[38.6089,-90.1876],[38.6094,-90.1862],[38.6100,-90.1848],
[38.6103,-90.1835],[38.6108,-90.1821],[38.6120,-90.1790],
[38.6134,-90.1743],[38.6155,-90.1780],[38.6180,-90.1820],
[38.6198,-90.2050],[38.6210,-90.2150],[38.6220,-90.2200],
[38.6241,-90.2118],[38.6280,-90.2200],[38.6334,-90.2380]

## Sensor Thresholds (PHMSA/NERC Regulatory)
Methane:  alert > 4.0 ppm, critical > 8.0 ppm  (PHMSA Part 192)
Temp:     alert > 5.0°C diff, critical > 10.0°C (NERC FAC-003)
Pressure: alert < 840 PSI, critical < 830 PSI    (PHMSA Part 195)

## S3 Bucket
twelvelabs-bedrock-workshop-workshopbucket-utkbjav4rfns

Key paths:
- chunks_final/         — 12 processed chunk JSONs
- reports/              — final report, GeoJSON, validation
- exports/              — CSV files for frontend
- videos/               — infrawatch_final.mp4

## What Frontend Needs To Do
1. Connect to GET /stream?speed=2
2. On "position" event → move drone marker on map
3. On "sensor" event → update methane/temp/pressure gauges
4. On "chunk_status" event → update progress bar
5. On "finding" event → add colored dot on map + finding card
6. On "complete" event → show summary

## CORS
API has CORS enabled for all origins — no proxy needed.

## Key Numbers For Demo
- 12 chunks processed in 8 minutes 34 seconds
- 7 anomaly findings detected
- 2 CRITICAL, 2 HIGH, 2 MEDIUM, 1 LOW (after fix)
- People detected in 5 chunks
- Wildlife (deer) detected in 1 chunk
- All findings have GPS, timestamp, sensor readings, PHMSA/NERC violations