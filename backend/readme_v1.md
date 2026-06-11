scikit-learn - library for DBSCAN type of clustering(we locked in for clustering of buckets based on 30 radius)
fastapi — the framework for defining API endpoints
uvicorn — the actual web server that runs your FastAPI app (FastAPI defines what the endpoints do; uvicorn is the engine that serves them over HTTP)

lt112-web/frontend
tele/backend

112_final.csv - fully cleaned csv file
112.csv - original data
explore.ipynb - the visualisation and cleaning of original data
events.db - databases can filter and aggregate 2M rows in milliseconds, which a CSV can't.
build_db.py - the database builder. Reads 112_final.csv, dumps it into events.db as a   table called events, creates the indexes, and runs a couple of verification queries. Also a one-time job (re-run only if the data changes).
cluster_events.py - analyzes of what radius and filters needed for most optimal clustering
cluster_full - clustering based off these buckets in clusters.txt
add_rtree - for faster requests between frontend and backend

pip install fastapi uvicorn
Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
uvicorn server:app --reload
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& c:\Users\Vartotojas\Desktop\things\school\projecct\tele\myenv\Scripts\Activate.ps1)
cd C:\Users\Vartotojas\Desktop\things\school\projecct\backend
.\myenv\Scripts\Activate.ps1

API-AIzaSyAsdFbJpil_Ci4sVgIQCNsZFAOB1S7ihCU


events.db - journal - probably to remove

The actual mechanical difference
Heatmap shows all events in the visible area, aggregated by cell, colored by count.

Includes everything: medical, police, fire, traffic, environmental, wildlife, etc.
Colors scale to "where is anything happening?"
Answers: "Where is the 112 system busy?"

Danger zones shows only specific incident categories in the same grid, colored by count.

Includes only: domestic violence, crimes against person (now + earlier), violence/rape, hanging, weapons, explosions, suicide attempts, public order violations
Colors scale to "where is this subset happening?"
Answers: "Where do disturbance- and violence-type calls concentrate?"


HOW TO START:
open the backend terminal
.\myenv\Scripts\Activate.ps1
download requirments.txt
uvicorn server:app --reload
open the frontend terminal
npm run dev
the website should be at: http://localhost:5175/

1. Development server (what you've been using)
When you ran npm run dev, that was Vite. It:

Serves your code at http://localhost:5173
Hot reload: when you save App.jsx, the browser updates immediately without you reloading
Resolves imports: when you write import { useState } from 'react', Vite finds React in node_modules and serves it

The hot reload is the magic — it's why editing your code feels instant.
2. Production builder
When you eventually run npm run build (you haven't yet), Vite:

Bundles all your JavaScript files into a few optimized files
Minifies the code (removes whitespace, shortens variable names)
Tree-shakes (removes unused code from libraries you import)
Optimizes images and CSS
Outputs a dist/ folder you can deploy anywhere