"""Build neighbors from aligned county edges, independent of display projection.

Run build-imperialism-counties.py to refresh both the geometry and this graph.
Pixel-distance connections can join unrelated land across bays or inset boxes.
"""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
counties = json.loads((ROOT / "public/imperialism/counties.json").read_text())
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
(ROOT / "public/imperialism/county-adjacency.json").write_text(json.dumps([sorted(row) for row in neighbors], separators=(",", ":")))
print(f"{len(counties)} counties, {sum(map(len,neighbors))//2} shared-border neighbors")
