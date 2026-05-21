# Emergency Incident Analysis & Spatial Intelligence System

## Overview

This project focuses on the analysis of emergency incident data using statistical analysis, spatial analysis, visualization techniques, and route optimization methods. The dataset contains nearly 2 million emergency-related records with temporal, categorical, and coordinate-based information.

The goal of the project is to identify temporal and spatial patterns in emergency incidents, visualize high-risk areas, and develop tools that could support emergency response optimization.

---

# Dataset

The dataset used in this project is publicly available from the Lithuanian Open Data Portal:

[Lithuanian Open Data Portal – Emergency Incident Dataset](https://open-data.stat.gov.lt/datasets/LTdata::bendrojo-pagalbos-centro-bpc-gauti-prane%C5%A1imai-numeriu-112/

The dataset contains approximately **1.97 million records** and includes:

| Column                  | Description             |
| ----------------------- | ----------------------- |
| X                       | X coordinate            |
| Y                       | Y coordinate            |
| ivykio_tipo_kodas       | Event type code         |
| ivykio_id               | Event identifier        |
| metai                   | Year                    |
| menuo                   | Month                   |
| aukstesnis_ivykio_tipas | Higher-level event type |
| zemesnis_ivykio_tipas   | Lower-level event type  |
| object_id               | Object identifier       |

---

# Project Objectives

* Perform exploratory data analysis (EDA)
* Analyze temporal patterns of incidents
* Investigate relationships between categorical variables
* Perform statistical testing and effect size analysis
* Analyze spatial distributions using coordinates
* Detect hotspots and clustering patterns
* Build an interactive dashboard
* Develop an emergency response routing application

---

# Technologies Used

## Programming & Analysis

* Python
* Jupyter Notebook

## Data Processing

* pandas
* NumPy

## Statistical Analysis

* SciPy

## Visualization

* Matplotlib
* Seaborn
* Plotly

## Spatial & Machine Learning

* scikit-learn

---

# Analysis Performed

## Temporal Analysis

* Incident distribution by year
* Incident distribution by month
* Year-month trend analysis
* Seasonal pattern identification

## Statistical Analysis

* Chi-square tests
* Cramér’s V effect size analysis
* Correlation analysis
* Mixed data correlation matrix

## Spatial Analysis

* Coordinate transformation
* Density heatmaps
* Spatial clustering
* Hotspot visualization

---

# Dashboard Features

The interactive dashboard includes:

* Time-based filtering
* Incident category filtering
* Spatial heatmaps
* Statistical visualizations
* Trend analysis charts
* Interactive map visualizations

---

# Emergency Routing Application

The application is designed to:

* Calculate shortest routes to emergency locations
* Visualize response paths on the map
* Identify nearest response points
* Support emergency route optimization

---

# Key Findings

* 2022 recorded the highest number of incidents.
* Several seasonal trends were identified across months.
* Statistical tests revealed significant relationships between some variables; however, effect size analysis showed that many associations were practically weak.
* Spatial visualizations indicate concentrated incident hotspots in major urban areas.

---

# Installation

Clone the repository:

```bash id="7yuldr"
git clone https://github.com/your-username/your-repository.git
```

Install dependencies:

```bash id="jqxq2e"
pip install -r requirements.txt
```

Run Jupyter Notebook:

```bash id="kq97qn"
jupyter notebook
```

---

# Collaborators

This project was developed collaboratively as part of a data analytics, GIS, and spatial intelligence initiative focused on emergency incident analysis and emergency response optimization.
