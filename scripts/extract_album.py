#!/usr/bin/env python3
"""
Extracts photo metadata and geolocation (latitude/longitude) from the public
Google Photos shared album:
  https://photos.app.goo.gl/jRkKPneBYiDHSSpYA

Outputs:
  - data/photos.json
  - data/photos.js (window.ALBUM_DATA for zero-config static/file:// usage)
"""

import datetime
import json
import os
import re
import urllib.parse
import urllib.request
from collections import defaultdict
import math

SHORT_URL = "https://photos.app.goo.gl/jRkKPneBYiDHSSpYA"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def fetch_album_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8")


def call_batchexecute(rpc_calls: list) -> str:
    rpcids = ",".join(sorted(set(c[0] for c in rpc_calls)))
    url = f"https://photos.google.com/_/PhotosUi/data/batchexecute?rpcids={rpcids}"
    req_data = urllib.parse.urlencode({"f.req": json.dumps([rpc_calls])}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8")


def parse_year_and_caption(caption: str, filename: str, ts_ms: int, tz_offset_ms: int):
    cleaned = (caption or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    lines = [line.strip() for line in cleaned.split("\n") if line.strip()]
    first_line = lines[0] if lines else ""
    notes = "\n".join(lines[1:]) if len(lines) > 1 else ""

    catalog_id = None
    title = first_line
    m_cat = re.match(r"^(\d{3,4}[a-zA-Z]?)\s+(.*)$", first_line)
    if m_cat:
        catalog_id = m_cat.group(1)
        title = m_cat.group(2).strip()
    elif filename:
        m_fn = re.match(r"^ph-(\d{3,4}[a-zA-Z]?)-", filename)
        if m_fn:
            catalog_id = m_fn.group(1)

    if not title:
        title = filename or "Untitled Photo"

    # Extract historical year (e.g. "(c. 1885)", "(1917)", "(1940s)")
    year = None
    year_label = None

    m_paren = re.search(
        r"\(([^)]*?\b(?:18[5-9]\d|19\d{2}|200\d|201[0-8])s?\b[^)]*?)\)",
        title + " " + notes,
    )
    if m_paren:
        year_label = m_paren.group(1).strip()
        m_yr = re.search(r"\b(18[5-9]\d|19\d{2}|200\d|201[0-8])\b", year_label)
        if m_yr:
            year = int(m_yr.group(1))

    if year is None:
        m_any = re.findall(r"\b(18[5-9]\d|19\d{2}|200\d|201[0-8])\b", title + " " + notes)
        if m_any:
            year = int(m_any[0])
            year_label = str(year)

    if year is None and ts_ms is not None:
        try:
            dt = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc) + datetime.timedelta(
                milliseconds=ts_ms + (tz_offset_ms or 0)
            )
            if 1850 <= dt.year <= 2018 and dt.year not in (1969, 1970):
                year = dt.year
                year_label = str(year)
        except Exception:
            pass

    decade = (year // 10) * 10 if year else None
    return catalog_id, title, notes, year, year_label, decade


def build_dataset():
    print(f"Fetching {SHORT_URL}...")
    req = urllib.request.Request(SHORT_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as resp:
        final_url = resp.geturl()
        html = resp.read().decode("utf-8")

    parsed_url = urllib.parse.urlparse(final_url)
    url_qs = urllib.parse.parse_qs(parsed_url.query)
    url_key = url_qs.get("key", [None])[0]

    matches = re.findall(r"AF_initDataCallback\((\{.*?\})\);</script>", html, re.DOTALL)
    b1 = matches[1]
    data_str = re.search(r"data:(\[.*\]), sideChannel:", b1, re.DOTALL).group(1)
    data = json.loads(data_str)

    all_items = list(data[1])
    next_token = data[2]
    album_id = data[3][0]
    album_key = data[3][19] if (len(data[3]) > 19 and data[3][19]) else url_key

    while next_token:
        text = call_batchexecute(
            [["snAcKc", json.dumps([album_id, next_token, None, album_key]), None, "generic"]]
        )
        next_token = None
        for line in text.splitlines():
            if line.startswith('[["wrb.fr"'):
                arr = json.loads(line)
                for entry in arr:
                    if entry[0] == "wrb.fr" and entry[2]:
                        parsed = json.loads(entry[2])
                        all_items.extend(parsed[1] or [])
                        next_token = parsed[2]
                        break

    seen = set()
    unique_items = []
    for item in all_items:
        if item[0] not in seen:
            seen.add(item[0])
            unique_items.append(item)

    print(f"Found {len(unique_items)} photos in album. Fetching per-photo geolocation metadata...")
    info_map = {}
    batch_size = 50
    for start in range(0, len(unique_items), batch_size):
        batch = unique_items[start : start + batch_size]
        calls = [
            ["fDcn4b", json.dumps([item[0], 1, album_key]), None, str(start + i)]
            for i, item in enumerate(batch)
        ]
        text = call_batchexecute(calls)
        for line in text.splitlines():
            if line.startswith('[["wrb.fr"'):
                arr = json.loads(line)
                for entry in arr:
                    if entry[0] == "wrb.fr" and entry[2]:
                        parsed = json.loads(entry[2])
                        if parsed and parsed[0]:
                            pinfo = parsed[0]
                            info_map[pinfo[0]] = pinfo

    geolocated_photos = []
    unmapped_photos = []
    coord_groups = defaultdict(list)

    for idx, item in enumerate(unique_items):
        pid = item[0]
        base_url = item[1][0]
        width = item[1][1]
        height = item[1][2]
        pinfo = info_map.get(pid) or []

        caption = pinfo[1] if len(pinfo) > 1 else ""
        filename = pinfo[2] if len(pinfo) > 2 else ""
        ts_ms = pinfo[3] if len(pinfo) > 3 else item[2]
        tz_offset_ms = pinfo[4] if len(pinfo) > 4 else item[4]
        file_bytes = pinfo[5] if len(pinfo) > 5 else None

        catalog_id, title, notes, year, year_label, decade = parse_year_and_caption(
            caption, filename, ts_ms, tz_offset_ms
        )

        location_name = None
        if len(pinfo) > 13 and pinfo[13]:
            try:
                location_name = pinfo[13][2][0][1][0][0]
            except Exception:
                location_name = None

        photo_Share_url = (
            f"https://photos.google.com/share/{album_id}/photo/{pid}?key={album_key}"
        )

        record = {
            "id": pid,
            "index": idx,
            "catalogId": catalog_id,
            "title": title,
            "notes": notes,
            "rawCaption": (caption or "").strip(),
            "filename": filename,
            "year": year,
            "yearLabel": year_label or (str(year) if year else "Unknown Date"),
            "decade": decade,
            "timestamp": ts_ms,
            "width": width,
            "height": height,
            "fileBytes": file_bytes,
            "baseUrl": base_url,
            "thumbUrl": f"{base_url}=w360-h270-c",
            "previewUrl": f"{base_url}=w800",
            "fullUrl": f"{base_url}=w1600",
            "downloadUrl": f"{base_url}=d",
            "albumPhotoUrl": photo_Share_url,
            "locationName": location_name or "Menlo Park, CA",
        }

        gps = pinfo[9] if len(pinfo) > 9 else None
        if gps and isinstance(gps, list) and gps[0] and len(gps[0]) == 2:
            lat = round(gps[0][0] / 1e7, 7)
            lng = round(gps[0][1] / 1e7, 7)
            record["lat"] = lat
            record["lng"] = lng
            record["googleMapsUrl"] = f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
            record["streetViewUrl"] = (
                f"https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lng}"
            )
            geolocated_photos.append(record)
            coord_groups[(lat, lng)].append(record)
        else:
            unmapped_photos.append(record)

    # Sort co-located photos chronologically and compute subtle spiral offsets
    # so that in "All 439 Pins" mode, co-located pins don't completely hide each other.
    location_clusters = []
    for loc_idx, ((lat, lng), group) in enumerate(
        sorted(coord_groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    ):
        group.sort(key=lambda p: (p["year"] or 9999, p["catalogId"] or "", p["index"]))
        loc_id = f"loc-{loc_idx + 1:02d}"
        n = len(group)
        cos_lat = math.cos(math.radians(lat))
        for i, photo in enumerate(group):
            photo["locationId"] = loc_id
            photo["locationCount"] = n
            photo["locationIndex"] = i
            if n == 1:
                photo["displayLat"] = lat
                photo["displayLng"] = lng
            else:
                # Golden-angle spiral around the true coordinate (~12m to 45m radius)
                angle = i * 2.399963229728653
                radius_deg = 0.00011 * math.sqrt(i + 1)
                photo["displayLat"] = round(lat + radius_deg * math.sin(angle), 7)
                photo["displayLng"] = round(lng + (radius_deg * math.cos(angle)) / max(cos_lat, 0.2), 7)

        years_in_loc = [p["year"] for p in group if p["year"]]
        location_clusters.append(
            {
                "id": loc_id,
                "lat": lat,
                "lng": lng,
                "count": n,
                "primaryTitle": group[0]["title"],
                "minYear": min(years_in_loc) if years_in_loc else None,
                "maxYear": max(years_in_loc) if years_in_loc else None,
                "coverThumbUrl": group[0]["thumbUrl"],
                "photoIds": [p["id"] for p in group],
            }
        )

    geolocated_photos.sort(key=lambda p: (p["year"] or 9999, p["catalogId"] or "", p["index"]))

    if not geolocated_photos:
        raise RuntimeError(
            f"Extracted 0 geolocated photos out of {len(unique_items)} items; "
            "aborting write to preserve existing dataset."
        )

    output = {
        "albumTitle": "MenloPark Historical Photo Archive",
        "albumShortUrl": SHORT_URL,
        "albumId": album_id,
        "totalAlbumPhotos": len(unique_items),
        "geolocatedCount": len(geolocated_photos),
        "unmappedCount": len(unmapped_photos),
        "uniqueLocationCount": len(location_clusters),
        "photos": geolocated_photos,
        "locations": location_clusters,
        "unmappedPhotos": unmapped_photos,
    }

    os.makedirs("data", exist_ok=True)
    with open("data/photos.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    with open("data/photos.js", "w", encoding="utf-8") as f:
        f.write("window.ALBUM_DATA = ")
        json.dump(output, f, separators=(",", ":"))
        f.write(";\n")

    print(
        f"Wrote data/photos.json and data/photos.js: "
        f"{len(geolocated_photos)} geolocated photos across {len(location_clusters)} unique locations "
        f"({len(unmapped_photos)} unmapped)."
    )


if __name__ == "__main__":
    build_dataset()
