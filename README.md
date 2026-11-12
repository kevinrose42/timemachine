# Historical Photo Time Machine — Menlo Park & Santa Cruz Google Maps Atlas

An interactive Google Maps historical photo explorer for two public Google Photos archival collections:

1. **Menlo Park Historical Photo Archive** ([Google Photos Album](https://photos.app.goo.gl/jRkKPneBYiDHSSpYA)) — **518** geolocated photos (out of 606 total)
2. **Santa Cruz Public Libraries — Photograph Collection** ([Google Photos Album](https://photos.app.goo.gl/XmBhLr6D7ck8fCUu6)) — **2,137** geolocated photos (out of 2,163 total), each containing a structured JSON metadata blob in the Google Photos `"info"` field

- **Live Website:** https://kevinrose42.github.io/timemachine/
- **Combined Dataset:** **2,655** geolocated photos across **672** unique GPS coordinate locations

## Features

- **Multi-Album Switcher:** Toggle between **All Albums (2,655)**, **Menlo Park (518)**, and **Santa Cruz (2,137)** in the header with automatic map fly-to transitions.
- **JSON `"info"` Blob Processing & Display:** Automatically parses the JSON metadata blob stored in each Santa Cruz photo's Google Photos description (`info`) field and displays:
  - **Title**, **Date**, **Identifier** (`#LH-619`), and **Description**
  - **Interactive Tags & Subjects Chips:** Click any `tags` or `subjects` chip inside a photo's detail view to filter the entire map to matching photos
  - **Full Structured Archival Metadata:** Coverage/Place, Creator/Photographer, Source/Donor, Collection, Publisher, Relation, Record/Item Type, Original Format, Physical & Scan Dimensions, Catalog Item ID & Page, Rights, Citation, and an expandable **Raw JSON Info Blob** viewer
  - **Direct Archive Links:** One-click buttons to open the official SCPL Omeka **Archive Catalog Record** (`item_page_url`) and **Original Archive Scan** (`original_image_url`)
- **Pin Display Modes:**
  - **All Photo Pins (2,655):** Drops an individual pin for every geolocated photo using a golden-angle spiral offset so co-located pins never hide each other.
  - **By Landmark (672):** Groups photos sharing identical coordinates into numbered cluster pins.
- **Automated Daily Sync:** `.github/workflows/sync-album.yml` runs `python3 scripts/extract_album.py` daily at `09:00 UTC` (and on manual `workflow_dispatch`) to keep both albums' coordinates and metadata synced and deployed to GitHub Pages.
