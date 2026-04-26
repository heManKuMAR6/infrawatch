import boto3
import subprocess
import os
import json

BUCKET = "twelvelabs-bedrock-workshop-workshopbucket-utkbjav4rfns"
s3 = boto3.client('s3', region_name='us-east-1')

# Load segment plan from S3
obj = s3.get_object(Bucket=BUCKET, Key='data/segment_plan.json')
segment_plan = json.loads(obj['Body'].read())

os.makedirs("data/segments", exist_ok=True)
os.makedirs("data/videos", exist_ok=True)

cut_files = []
segment_index = 0

for video_plan in segment_plan:
    if not video_plan['has_useful_footage']:
        continue
    
    video_name = video_plan['video_name']
    video_key = video_plan['video_key']
    local_path = f"data/videos/{video_name}"
    
    # Download if not already there
    if not os.path.exists(local_path):
        print(f"Downloading {video_name}...")
        s3.download_file(BUCKET, video_key, local_path)
    
    for seg in video_plan['segments']:
        start = seg['start_sec']
        end = seg['end_sec']
        duration = end - start
        
        if duration < 3:
            continue
        
        out_path = f"data/segments/seg_{segment_index:03d}.mp4"
        print(f"Cutting {video_name} {start}s-{end}s ({duration}s)...")
        
        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start),
            '-i', local_path,
            '-t', str(duration),
            '-vcodec', 'libx264',
            '-acodec', 'aac',
            '-vf', 'scale=1280:720',
            '-r', '30',
            out_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            cut_files.append(out_path)
            print(f"  ✅ seg_{segment_index:03d}.mp4")
            segment_index += 1
        else:
            print(f"  ❌ Failed: {result.stderr[-100:]}")

print(f"\nCut {len(cut_files)} segments")

# Write concat list
with open("data/segments/concat.txt", 'w') as f:
    for path in cut_files:
        f.write(f"file '../{path}'\n")

# Combine
print("Combining segments...")
cmd = [
    'ffmpeg', '-y',
    '-f', 'concat', '-safe', '0',
    '-i', 'data/segments/concat.txt',
    '-vcodec', 'libx264',
    '-acodec', 'aac',
    'data/videos/infrawatch_clean.mp4'
]
result = subprocess.run(cmd, capture_output=True, text=True)

if result.returncode == 0:
    size = os.path.getsize('data/videos/infrawatch_clean.mp4')
    print(f"✅ infrawatch_clean.mp4 created ({size/1024/1024:.1f} MB)")
    
    # Upload to S3
    print("Uploading to S3...")
    s3.upload_file(
        'data/videos/infrawatch_clean.mp4',
        BUCKET,
        'videos/infrawatch_clean.mp4'
    )
    print(f"✅ Uploaded to S3")
else:
    print(f"❌ Combine failed: {result.stderr[-200:]}")