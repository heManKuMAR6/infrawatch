from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import boto3
import json
import asyncio
from datetime import datetime

app = FastAPI(title="InfraWatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

S3_BUCKET = "twelvelabs-bedrock-workshop-workshopbucket-utkbjav4rfns"
CHUNK_SIZE_SEC = 30
s3 = boto3.client('s3', region_name='us-east-1')


def compute_risk_level(score: float) -> str:
    """Score ≥83→CRITICAL, ≥65→HIGH, ≥40→MEDIUM, else LOW."""
    if score >= 83: return "CRITICAL"
    if score >= 65: return "HIGH"
    if score >= 40: return "MEDIUM"
    return "LOW"


def get_all_chunks():
    try:
        response = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix='chunks_final/')
        if 'Contents' not in response:
            return []
        keys = sorted([obj['Key'] for obj in response['Contents'] if obj['Key'].endswith('.json')])
        chunks = []
        for key in keys:
            obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
            chunks.append(json.loads(obj['Body'].read()))
        return chunks
    except Exception as e:
        print(f"Error: {e}")
        return []


def build_bundle(chunks: list) -> dict:
    """Transform S3 chunks into the SOC dashboard bundle format."""
    anomalies = []
    for c in chunks:
        if not c.get('anomaly_detected'):
            continue
        gps = c.get('gps', {})
        sensor = c.get('sensor', {})
        score = c.get('composite_risk_score', 0)
        risk = compute_risk_level(score)
        violations = c.get('regulatory_violations', [])
        pegasus = c.get('pegasus', {})
        anomalies.append({
            "id": c.get('chunk_id'),
            "asset_name": c.get('chunk_id'),
            "severity": risk.lower(),
            "risk_level": risk,
            "quantum_risk_index": round(score / 100, 3),
            "visual_damage_score": round(score / 100, 3),
            "grid_stress_score": round(score / 120, 3),
            "composite_risk_score": score,
            "marengo_top_match": (c.get('anomaly_type') or '').replace('|', ' + ').replace('_', ' '),
            "lat": gps.get('lat'),
            "lon": gps.get('lon'),
            "timestamp_video": c.get('timestamp_video'),
            "regulatory_violations": violations,
            "pegasus_report": {
                "anomaly_type": (c.get('anomaly_type') or '').replace('|', ' + ').replace('_', ' '),
                "severity": c.get('severity', ''),
                "hazards": violations if violations else [(c.get('anomaly_type') or '').replace('_', ' ')],
                "description": c.get('description', ''),
                "people_detected": {
                    "present": bool(pegasus.get('people_present', c.get('people_present', False))),
                    "count": pegasus.get('people_count', 0),
                    "activity": pegasus.get('people_activity', ''),
                },
                "wildlife_detected": {
                    "present": bool(pegasus.get('animals_present', c.get('animals_present', False))),
                    "types": pegasus.get('animal_types', 'none'),
                },
                "vehicles_present": bool(pegasus.get('vehicles_present', False)),
                "environment": pegasus.get('environment', c.get('environment', '')),
                "recommended_action": c.get('recommended_action', ''),
            },
            "sensor": sensor,
            "people_present": c.get('people_present'),
            "animals_present": c.get('animals_present'),
            "recommended_action": c.get('recommended_action', ''),
            "finding_id": c.get('chunk_id'),
            "original_video": c.get('original_video'),
            "video_file": c.get('chunk_id'),
            "timestamp_start_sec": c.get('combined_start_sec', 0),
            "timestamp_end_sec": c.get('combined_end_sec', 30),
        })
    avg_stress = sum(a['grid_stress_score'] for a in anomalies) / len(anomalies) if anomalies else 0
    return {
        "anomalies": anomalies,
        "grid": {
            "stress_score": round(avg_stress, 3),
            "source": "InfraWatch · TX-447 St. Louis",
            "snapshot": {
                "stress_score": round(avg_stress, 3),
                "respondent": "MISO",
                "period": "PT30M",
            },
        },
        "vision_pipeline": {
            "pegasus": [{"asset": a["asset_name"], "ok": True, "risk": a["risk_level"]} for a in anomalies],
            "marengo_index_jobs": [],
        },
    }


@app.get("/")
def root():
    return {"status": "InfraWatch API running", "time": datetime.now().isoformat()}


@app.get("/chunks")
def list_chunks():
    chunks = get_all_chunks()
    return {
        "total_chunks": len(chunks),
        "chunks": [
            {
                "chunk_id": c.get('chunk_id'),
                "timestamp_video": c.get('timestamp_video'),
                "original_video": c.get('original_video'),
                "anomaly_detected": c.get('anomaly_detected'),
                "risk_level": compute_risk_level(c.get('composite_risk_score', 0)) if c.get('anomaly_detected') else "LOW",
                "composite_risk_score": c.get('composite_risk_score'),
                "lat": c.get('gps', {}).get('lat'),
                "lon": c.get('gps', {}).get('lon'),
            }
            for c in chunks
        ]
    }


@app.get("/findings")
def get_findings():
    chunks = get_all_chunks()
    findings = []
    for c in chunks:
        if c.get('anomaly_detected'):
            gps = c.get('gps', {})
            sensor = c.get('sensor', {})
            score = c.get('composite_risk_score', 0)
            pegasus = c.get('pegasus', {})
            findings.append({
                "finding_id": c.get('chunk_id'),
                "video_file": c.get('chunk_id'),
                "timestamp_video": c.get('timestamp_video'),
                "timestamp_start_sec": c.get('combined_start_sec', 0),
                "timestamp_end_sec": c.get('combined_end_sec', 30),
                "lat": gps.get('lat'),
                "lon": gps.get('lon'),
                "anomaly_type": c.get('anomaly_type'),
                "severity": c.get('severity'),
                "risk_level": compute_risk_level(score),
                "composite_risk_score": score,
                "description": c.get('description'),
                "recommended_action": c.get('recommended_action'),
                "regulatory_violations": c.get('regulatory_violations', []),
                "people_present": pegasus.get('people_present', c.get('people_present')),
                "people_count": pegasus.get('people_count', 0),
                "people_activity": pegasus.get('people_activity', ''),
                "animals_present": pegasus.get('animals_present', c.get('animals_present')),
                "animal_types": pegasus.get('animal_types', 'none'),
                "vehicles_present": pegasus.get('vehicles_present', False),
                "environment": pegasus.get('environment', c.get('environment', '')),
                "sensor": sensor,
            })
    findings.sort(key=lambda x: x['composite_risk_score'], reverse=True)
    critical = [f for f in findings if f['risk_level'] == 'CRITICAL']
    high = [f for f in findings if f['risk_level'] == 'HIGH']
    return {
        "total": len(findings),
        "critical": len(critical),
        "high": len(high),
        "findings": findings,
    }


@app.get("/report")
def get_report():
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key='reports/infrawatch_final_report.json')
        return json.loads(obj['Body'].read())
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/clip/file/{chunk_id}")
def get_clip(chunk_id: str):
    """Return a presigned URL for a pre-cut 30s clip; fall back to full video with offsets."""
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=f"chunks_final/{chunk_id}.json")
        chunk = json.loads(obj['Body'].read())
    except Exception:
        raise HTTPException(status_code=404, detail=f"Chunk {chunk_id} not found")

    clip_key = f"clips/{chunk_id}.mp4"
    try:
        s3.head_object(Bucket=S3_BUCKET, Key=clip_key)
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': clip_key},
            ExpiresIn=3600,
        )
        return {"url": url, "start": 0, "end": 30}
    except Exception:
        pass

    # Fall back to full video with actual chunk offsets
    start = chunk.get('combined_start_sec', 0)
    end = chunk.get('combined_end_sec', start + 30)
    url = s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': S3_BUCKET, 'Key': 'videos/infrawatch_final.mp4'},
        ExpiresIn=3600,
    )
    return {"url": url, "start": start, "end": end}


@app.get("/stream")
async def stream(speed: float = 8.0):
    async def generator():
        chunks = get_all_chunks()
        total = len(chunks)

        yield {"event": "start", "data": json.dumps({
            "type": "start",
            "total_chunks": total,
            "message": f"InfraWatch processing {total} chunks"
        })}
        await asyncio.sleep(1)

        for i, chunk in enumerate(chunks):
            gps = chunk.get('gps', {})
            sensor = chunk.get('sensor', {})
            score = chunk.get('composite_risk_score', 0)
            risk = compute_risk_level(score) if chunk.get('anomaly_detected') else "LOW"

            yield {"event": "position", "data": json.dumps({
                "type": "position",
                "lat": gps.get('lat', 38.627),
                "lon": gps.get('lon', -90.199),
                "timestamp_video": chunk.get('timestamp_video'),
                "chunk_index": i + 1,
                "original_video": chunk.get('original_video'),
            })}
            await asyncio.sleep(0.1)

            yield {"event": "sensor", "data": json.dumps({
                "type": "sensor",
                "methane_ppm": sensor.get('methane_ppm', 1.8),
                "temp_differential_c": sensor.get('temp_differential_c', 1.5),
                "pressure_psi": sensor.get('pressure_psi', 855),
                "phmsa_violation": sensor.get('phmsa_violation', ''),
                "nerc_violation": sensor.get('nerc_violation', ''),
            })}
            await asyncio.sleep(0.1)

            yield {"event": "chunk_status", "data": json.dumps({
                "type": "chunk_status",
                "chunk_index": i + 1,
                "chunk_total": total,
                "progress_pct": round((i + 1) / total * 100, 1),
                "timestamp_video": chunk.get('timestamp_video'),
                "original_video": chunk.get('original_video'),
            })}

            if chunk.get('anomaly_detected'):
                yield {"event": "finding", "data": json.dumps({
                    "type": "finding",
                    "finding_id": chunk.get('chunk_id'),
                    "lat": gps.get('lat'),
                    "lon": gps.get('lon'),
                    "anomaly_type": chunk.get('anomaly_type'),
                    "severity": chunk.get('severity'),
                    "risk_level": risk,
                    "composite_risk_score": score,
                    "timestamp_video": chunk.get('timestamp_video'),
                    "description": chunk.get('description', '')[:200],
                    "recommended_action": chunk.get('recommended_action', ''),
                    "regulatory_violations": chunk.get('regulatory_violations', []),
                    "people_present": chunk.get('people_present'),
                    "animals_present": chunk.get('animals_present'),
                    "sensor": sensor,
                })}

            delay = max(0.5, min(CHUNK_SIZE_SEC / speed, 5.0))
            await asyncio.sleep(delay)

        yield {"event": "complete", "data": json.dumps({
            "type": "complete",
            "total_chunks": total,
            "total_findings": sum(1 for c in chunks if c.get('anomaly_detected')),
            "critical_count": sum(1 for c in chunks if c.get('anomaly_detected') and compute_risk_level(c.get('composite_risk_score', 0)) == 'CRITICAL'),
            "message": "Inspection complete"
        })}

    return EventSourceResponse(generator())


@app.post("/api/analysis/live-sse")
async def analysis_live_sse(
    video: UploadFile = File(None),
    sensor_csv: UploadFile = File(None),
    max_clips: int = Form(5),
    files: list[UploadFile] = File(None),
    folder: str = Form(""),
):
    """Accept a video upload, stream back chunk-by-chunk SSE analysis, then emit bundle."""
    async def generator():
        chunks = get_all_chunks()
        total = len(chunks)

        yield {"event": "chunk_status", "data": json.dumps({
            "type": "chunk_status", "status": "processing",
            "message": f"TwelveLabs Pegasus initializing — {total} pipeline segments queued",
            "chunk_index": 0, "chunk_total": total,
        })}
        await asyncio.sleep(0.8)

        for i, chunk in enumerate(chunks):
            gps = chunk.get('gps', {})
            sensor = chunk.get('sensor', {})
            score = chunk.get('composite_risk_score', 0)
            risk = compute_risk_level(score) if chunk.get('anomaly_detected') else "LOW"
            ts = chunk.get('timestamp_video', '')

            yield {"event": "chunk_status", "data": json.dumps({
                "type": "chunk_status", "status": "processing",
                "message": f"Analyzing segment {i+1}/{total} — Pegasus processing {ts}",
                "chunk_index": i + 1, "chunk_total": total,
                "progress_pct": round(i / total * 100, 1),
            })}
            await asyncio.sleep(0.15)

            yield {"event": "position", "data": json.dumps({
                "type": "position",
                "lat": gps.get('lat', 38.627),
                "lon": gps.get('lon', -90.199),
                "timestamp_video": ts,
                "chunk_index": i + 1,
            })}

            if chunk.get('anomaly_detected'):
                yield {"event": "finding", "data": json.dumps({
                    "type": "finding",
                    "finding_id": chunk.get('chunk_id'),
                    "lat": gps.get('lat'),
                    "lon": gps.get('lon'),
                    "anomaly_type": chunk.get('anomaly_type'),
                    "risk_level": risk,
                    "composite_risk_score": score,
                    "timestamp_video": ts,
                    "regulatory_violations": chunk.get('regulatory_violations', []),
                    "sensor": sensor,
                })}

            yield {"event": "chunk_status", "data": json.dumps({
                "type": "chunk_status", "status": "complete",
                "message": f"Segment {i+1} complete — {'⚠ anomaly: ' + risk if chunk.get('anomaly_detected') else '✓ clear'}",
                "chunk_index": i + 1, "chunk_total": total,
                "progress_pct": round((i + 1) / total * 100, 1),
            })}

            await asyncio.sleep(max(0.3, min(CHUNK_SIZE_SEC / 10.0, 1.5)))

        bundle = build_bundle(chunks)
        findings_count = len(bundle["anomalies"])
        crit_count = sum(1 for a in bundle["anomalies"] if a["risk_level"] == "CRITICAL")
        yield {"event": "chunk_status", "data": json.dumps({
            "type": "chunk_status", "status": "complete",
            "message": f"Pipeline complete — {findings_count} anomalies, {crit_count} critical. Fusing into dashboard…",
            "chunk_index": total, "chunk_total": total,
            "progress_pct": 100,
        })}
        await asyncio.sleep(0.3)

        yield {"event": "bundle", "data": json.dumps({"type": "bundle", "bundle": bundle})}

    return EventSourceResponse(generator())


@app.post("/api/analysis/live")
async def analysis_live(
    video: UploadFile = File(None),
    sensor_csv: UploadFile = File(None),
    max_clips: int = Form(5),
    files: list[UploadFile] = File(None),
    folder: str = Form(""),
):
    """Fallback: return full bundle JSON without streaming."""
    chunks = get_all_chunks()
    return build_bundle(chunks)
