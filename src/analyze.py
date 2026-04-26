from twelvelabs import TwelveLabs

# The 3 anomaly types we're focusing on — narrow and winnable
ANOMALY_QUERIES = [
    {"type": "corrosion", "query": "rust corrosion damage on metal pipeline surface", "severity": "high"},
    {"type": "vegetation", "query": "vegetation overgrowth plants encroaching on pipeline right of way", "severity": "medium"},
    {"type": "equipment_damage", "query": "damaged broken equipment valve assembly structural defect", "severity": "high"},
]

def analyze_video(client: TwelveLabs, video_id: str) -> list:
    findings = []

    for anomaly in ANOMALY_QUERIES:
        print(f"Searching for: {anomaly['type']}...")
        results = client.search.query(
            index_id=get_index_id(client),
            query_text=anomaly["query"],
            options=["visual"],
            threshold="medium"
        )

        for clip in results.data:
            finding = {
                "type": anomaly["type"],
                "severity": anomaly["severity"],
                "start": clip.start,
                "end": clip.end,
                "confidence": clip.score,
                "description": get_description(client, video_id, clip.start, clip.end),
                "timestamp": f"{int(clip.start//60):02d}:{int(clip.start%60):02d}"
            }
            findings.append(finding)
            print(f"  Found {anomaly['type']} at {finding['timestamp']} (confidence: {clip.score:.2f})")

    # Sort by severity then confidence
    severity_order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda x: (severity_order[x["severity"]], -x["confidence"]))
    return findings

def get_description(client, video_id, start, end):
    try:
        result = client.generate.text(
            video_id=video_id,
            prompt=f"Describe any infrastructure damage, anomalies, or maintenance issues visible between {start}s and {end}s. Be specific about what you see.",
        )
        return result.data
    except:
        return "Description unavailable"

def get_index_id(client):
    indexes = client.index.list()
    for idx in indexes:
        if idx.name == "infrawatch-pipeline":
            return idx.id
    return None