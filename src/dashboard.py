import streamlit as st
import pandas as pd
import json
import boto3
import io
import folium
from streamlit_folium import st_folium

st.set_page_config(
    page_title="InfraWatch",
    page_icon="🛢️",
    layout="wide"
)

S3_BUCKET = "twelvelabs-bedrock-workshop-workshopbucket-utkbjav4rfns"

@st.cache_data
def load_data():
    s3 = boto3.client('s3', region_name='us-east-1')
    csv_obj = s3.get_object(Bucket=S3_BUCKET, Key='reports/infrawatch_findings_v2.csv')
    df = pd.read_csv(io.BytesIO(csv_obj['Body'].read()))
    json_obj = s3.get_object(Bucket=S3_BUCKET, Key='reports/infrawatch_report_v2.json')
    report = json.loads(json_obj['Body'].read())
    return df, report

df, report = load_data()

# Header
st.title("🛢️ InfraWatch — Pipeline Inspection Intelligence")
st.markdown("**Automated multi-sensor anomaly detection | TwelveLabs Pegasus + AWS Bedrock**")
st.divider()

# Top metrics
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Videos Analyzed", report['videos_analyzed'])
col2.metric("Total Findings", report['total_findings'])
col3.metric("🔴 Critical", report['critical_count'], delta="Immediate action")
col4.metric("🟡 Medium", report['medium_count'])
col5.metric("🟢 Low", report['low_count'])

st.divider()

# Two column layout
left, right = st.columns([1, 1])

with left:
    st.subheader("📋 Findings — Prioritized by Risk")
    
    colors = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}
    
    for _, row in df.iterrows():
        icon = colors.get(row['risk_level'], "⚪")
        with st.expander(f"{icon} [{row['risk_level']}] {row['anomaly_type']} — Score: {row['composite_risk_score']}/100"):
            c1, c2 = st.columns(2)
            c1.markdown(f"**Video:** {row['video']}")
            c1.markdown(f"**Type:** {row['anomaly_type']}")
            c1.markdown(f"**Severity:** {row['severity']}")
            c2.markdown(f"**Methane:** {row['methane_ppm']} ppm")
            c2.markdown(f"**Temp diff:** {row['temp_differential_c']}°C")
            c2.markdown(f"**Pressure:** {row['pressure_psi']} PSI")
            if str(row['phmsa_violation']) != 'nan' and row['phmsa_violation']:
                st.error(f"⚠️ {row['phmsa_violation']}")
            st.markdown(f"**Description:** {row['description']}")
            st.markdown(f"**Action:** {row['recommended_action']}")

with right:
    st.subheader("🗺️ Pipeline Route — St. Louis Region TX-447")
    
    m = folium.Map(location=[38.63, -90.21], zoom_start=12)
    
    risk_colors = {"CRITICAL": "red", "HIGH": "orange", "MEDIUM": "yellow", "LOW": "green"}
    
    for _, row in df.iterrows():
        if pd.notna(row['lat']) and pd.notna(row['lon']):
            color = risk_colors.get(row['risk_level'], 'blue')
            folium.CircleMarker(
                location=[row['lat'], row['lon']],
                radius=12,
                color=color,
                fill=True,
                fill_color=color,
                fill_opacity=0.8,
                popup=folium.Popup(
                    f"<b>{row['risk_level']}</b><br>"
                    f"Type: {row['anomaly_type']}<br>"
                    f"Score: {row['composite_risk_score']}/100<br>"
                    f"Methane: {row['methane_ppm']} ppm<br>"
                    f"Video: {row['video']}",
                    max_width=250
                ),
                tooltip=f"{row['risk_level']}: {row['anomaly_type']}"
            ).add_to(m)
    
    st_folium(m, width=600, height=450)

st.divider()

# Sensor data chart
st.subheader("📊 Sensor Readings — Anomaly Peaks")
chart_df = df[df['methane_ppm'].notna()][['video','methane_ppm','temp_differential_c','composite_risk_score']].copy()
chart_df['video'] = chart_df['video'].str.replace('.mp4','').str[:30]
chart_df = chart_df.sort_values('composite_risk_score', ascending=False)

col1, col2 = st.columns(2)
with col1:
    st.bar_chart(chart_df.set_index('video')['methane_ppm'], color="#ff4444")
    st.caption("Methane ppm by video (PHMSA alert threshold: 4.0 ppm)")
with col2:
    st.bar_chart(chart_df.set_index('video')['temp_differential_c'], color="#ff8800")
    st.caption("Temp differential °C (NERC alert threshold: 5.0°C)")

st.divider()

# Operational impact
st.subheader("💰 Operational Impact")
i1, i2, i3 = st.columns(3)
i1.metric("Manual Review Speed", "20-30 miles/day", "per analyst")
i2.metric("InfraWatch Speed", "200+ miles/day", "10x improvement")
i3.metric("Incident Prevention", "$1M-$100M", "per avoided failure")

st.markdown(f"""
**Regulatory Compliance:** {', '.join(report['regulatory_framework'])}  
**Data Sources Fused:** {', '.join(report['data_sources'])}  
**Powered by:** TwelveLabs Pegasus 1.2 via Amazon Bedrock
""")