# Menlo Park Time Machine

Interactive Google Maps historical photo atlas built from the public [MenloPark Google Photos Album](https://photos.app.goo.gl/jRkKPneBYiDHSSpYA).

## Overview

- **Total Album Photos Scanned**: 606
- **Geolocated Photos Mapped**: 439 photos across 83 unique GPS coordinate pairs (436 in Menlo Park, CA and 3 at Menlo Castle in Galway, Ireland)
- **Date Range**: 1855 – 2013

## Features

- **Google Maps Layers**: Switch between Road Map (`m`), Hybrid Satellite (`y`), Satellite (`s`), and Terrain (`p`) tiles.
- **Individual & Landmark Pin Modes**:
  - **All Photo Pins (439)**: Drops an individual pin for each geolocated photo, using a subtle golden-angle spiral offset and GPS leader line when multiple historical photos share the exact same coordinate.
  - **By Landmark (83)**: Groups co-located photos into landmark pins with photo count badges.
- **Click-to-View Photo Lightbox**: Clicking any pin displays the high-resolution historical photograph, archival catalog ID, date/era badge, historical notes, exact latitude/longitude, a thumbnail filmstrip of all co-located photos at that spot, and direct links to **Google Street View**, **Google Maps**, and the **Google Photos Album**.
- **Search & Era Filtering**: Filter pins and sidebar cards in real time by keyword, street name, catalog ID, or historical era (`1855–1899` through `1980+`).

## Running Locally

Serve the repository with any static HTTP server:

```bash
python3 -m http.server 8080
```

To re-extract metadata from the public Google Photos album:

```bash
python3 scripts/extract_album.py
```
