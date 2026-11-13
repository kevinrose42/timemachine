# Historical Photo Time Machine — Menlo Park & Santa Cruz Google Maps Atlas

An interactive Google Maps historical photo & postcard explorer for three public Google Photos archival collections:

1. **Menlo Park Historical Photo Archive** ([Google Photos Album](https://photos.app.goo.gl/jRkKPneBYiDHSSpYA)) — **518** geolocated photos (out of 606 total)
2. **Santa Cruz Public Libraries — Photograph Collection** ([Google Photos Album](https://photos.app.goo.gl/XmBhLr6D7ck8fCUu6)) — **2,137** geolocated photos (out of 2,163 total), each containing a structured JSON metadata blob in the Google Photos `"info"` field
3. **Santa Cruz Public Libraries — Postcard Collection** ([Google Photos Album](https://photos.app.goo.gl/KVwZhnmEhSdExCZWA)) — **1,175** geolocated postcards (out of 1,188 total), each containing a structured JSON metadata blob in the Google Photos `"info"` field

- **Live Website:** https://kevinrose42.github.io/timemachine/
- **Combined Dataset:** **3,830** geolocated items across **953** unique GPS coordinate locations

## Features

- **Multi-Album Switcher:** Toggle between **All Albums (3,830)**, **Menlo Park (518)**, **SCPL Photos (2,137)**, and **SCPL Postcards (1,175)** in the header with automatic map fly-to transitions.
- **JSON `"info"` Blob Processing & Display:** Automatically parses the JSON metadata blob stored in each Santa Cruz item's Google Photos description (`info`) field and displays:
  - **Title**, **Date**, **Identifier** (`#LH-619`, `#PC-V4-125`), and **Description**
  - **Interactive Tags & Subjects Chips:** Click any `tags` or `subjects` chip inside an item's detail view to filter the entire map to matching items
  - **Full Structured Archival Metadata:** Year & Location Confidence (`year_confidence`, `location_confidence`), Reasoning (`how_year_was_determined`, `how_location_was_determined`), Coverage/Place, Creator, Source/Donor, Collection, Publisher, Relation, Record/Item Type, Original Format, Physical & Scan Dimensions, Catalog Item ID & Page, Rights, Citation, and an expandable **Raw JSON Info Blob** viewer
  - **Direct Archive Links:** One-click buttons to open the official SCPL Omeka **Archive Catalog Record** (`item_page_url`) and **Original Archive Scan** (`original_image_url`)
- **Pin Display Modes:**
  - **All Photo Pins (3,830):** Drops an individual pin for every geolocated photo or postcard using a golden-angle spiral offset so co-located pins never hide each other.
  - **By Landmark (953):** Groups items sharing identical coordinates into numbered cluster pins.
- **Automated Daily Sync:** `.github/workflows/sync-album.yml` runs `python3 scripts/extract_album.py` daily at `09:00 UTC` (and on manual `workflow_dispatch`) to keep all three albums' coordinates and metadata synced and deployed to GitHub Pages.
