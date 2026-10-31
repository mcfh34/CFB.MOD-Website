"""Rebuild county geometry without independently simplifying shared borders.

Source: US Census 2010 cartographic county boundaries, 1:5,000,000.
Keep the established county order and FIPS IDs so map indexing stays stable.
Usage: python3 scripts/build-imperialism-counties.py [downloaded-census-shapefile.zip]
Requires pyshp (python3 -m pip install pyshp).
"""
import collections
import io
import json
from pathlib import Path
import sys
import urllib.request
import shapefile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://www2.census.gov/geo/tiger/GENZ2010/gz_2010_us_050_00_5m.zip"
archive = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(SOURCE, timeout=60).read()
with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
    reader = shapefile.Reader(encoding="latin1",shp=io.BytesIO(zipped.read(next(name for name in zipped.namelist() if name.endswith(".shp")))),dbf=io.BytesIO(zipped.read(next(name for name in zipped.namelist() if name.endswith(".dbf")))))
    shapes = {}
    for record in reader.iterShapeRecords():
        props = record.record.as_dict()
        geometry = record.shape.__geo_interface__
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        # Apply rounding once and identically to both copies of each border.
        shapes[props["STATE"] + props["COUNTY"]] = [[[[round(lon,6),round(lat,6)] for lon,lat in ring] for ring in polygon] for polygon in polygons]
path = ROOT / "public/imperialism/counties.json"
counties = json.loads(path.read_text())
for county in counties:
    if county["i"] not in shapes:
        raise ValueError(f"Census boundary missing: {county['i']}")
    county["g"] = shapes[county["i"]]
# Build connections from actual shared edges, not pixel distance tolerances.
edges = collections.defaultdict(set)
for index, county in enumerate(counties):
    for polygon in county["g"]:
        for ring in polygon:
            for first, second in zip(ring, ring[1:]):
                if first != second:
                    edges[tuple(sorted([tuple(first), tuple(second)]))].add(index)
neighbors = [set() for county in counties]
for members in edges.values():
    for first in members:
        neighbors[first].update(members - {first})
path.write_text(json.dumps(counties, separators=(",", ":")))
(ROOT / "public/imperialism/county-adjacency.json").write_text(json.dumps([sorted(row) for row in neighbors], separators=(",", ":")))
(ROOT / "public/imperialism/boundary-source.json").write_text(json.dumps({"source":SOURCE,"year":2010,"scale":"1:5,000,000","counties":len(counties),"sharedBorders":"Aligned Census vertices; no per-county simplification"},separators=(",", ":")))
print(f"{len(counties)} counties, {sum(map(len,neighbors))//2} shared-border neighbors, {path.stat().st_size} bytes")
print(f"{sum(len(value)==1 for value in edges.values())} exterior edges; {sum(len(value)>1 for value in edges.values())} aligned shared edges")
