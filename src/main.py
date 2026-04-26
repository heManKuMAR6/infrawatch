import os
from dotenv import load_dotenv
from twelvelabs import TwelveLabs
from analyze import analyze_video
from report import generate_report

load_dotenv()

client = TwelveLabs(api_key=os.getenv("TWELVELABS_API_KEY"))

def main(video_path: str):
    print(f"Processing: {video_path}")
    
    # Step 1: Upload and index video
    print("Uploading video to TwelveLabs...")
    task = client.task.create(
        index_id=get_or_create_index(),
        file=video_path
    )
    task.wait_for_done()
    video_id = task.video_id
    print(f"Video indexed. ID: {video_id}")

    # Step 2: Analyze for anomalies
    findings = analyze_video(client, video_id)
    print(f"Found {len(findings)} anomalies")

    # Step 3: Generate report
    report = generate_report(findings, video_path)
    print("Report generated:")
    print(report)
    return report

def get_or_create_index():
    indexes = client.index.list()
    for idx in indexes:
        if idx.name == "infrawatch-pipeline":
            return idx.id
    new_index = client.index.create(
        name="infrawatch-pipeline",
        engines=[{"name": "marengo2.7", "options": ["visual", "conversation"]}]
    )
    return new_index.id

if __name__ == "__main__":
    import sys
    video_path = sys.argv[1] if len(sys.argv) > 1 else "data/videos/test.mp4"
    main(video_path)