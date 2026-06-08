import pandas as pd
import plotly.express as px

print("Loading clean data...")
df = pd.read_csv('112_clean.csv', encoding='utf-8')
print(f"Loaded {len(df):,} rows")
df.head()