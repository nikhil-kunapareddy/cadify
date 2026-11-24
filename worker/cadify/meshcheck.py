"""STL parsing and watertightness checks (no third-party dependencies)."""
from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Iterator

Vertex = tuple[float, float, float]
Triangle = tuple[Vertex, Vertex, Vertex]


@dataclass
class MeshReport:
    triangles: int
    open_edges: int
    nonmanifold_edges: int
    degenerate: int

    @property
    def watertight(self) -> bool:
        return self.triangles > 0 and self.open_edges == 0 and self.nonmanifold_edges == 0

    def to_json(self) -> dict[str, int | bool]:
        return {
            "triangles": self.triangles,
            "openEdges": self.open_edges,
            "nonmanifoldEdges": self.nonmanifold_edges,
            "degenerate": self.degenerate,
            "watertight": self.watertight,
        }


def _binary_triangles(data: bytes) -> Iterator[Triangle]:
    (count,) = struct.unpack_from("<I", data, 80)
    for i in range(count):
        v = struct.unpack_from("<12f", data, 84 + i * 50)
        yield (v[3], v[4], v[5]), (v[6], v[7], v[8]), (v[9], v[10], v[11])


def _ascii_triangles(data: bytes) -> Iterator[Triangle]:
    verts: list[Vertex] = []
    for line in data.decode("ascii", errors="replace").splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[0] == "vertex":
            verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
            if len(verts) == 3:
                yield verts[0], verts[1], verts[2]
                verts = []


def triangles(data: bytes) -> Iterator[Triangle]:
    if len(data) >= 84:
        (count,) = struct.unpack_from("<I", data, 80)
        if 84 + count * 50 == len(data):
            return _binary_triangles(data)
    return _ascii_triangles(data)


def check_mesh(data: bytes, decimals: int = 6) -> MeshReport:
    """Every edge of a closed 2-manifold mesh is shared by exactly two triangles."""
    edges: dict[tuple[Vertex, Vertex], int] = {}
    count = 0
    degenerate = 0
    for tri in triangles(data):
        count += 1
        a, b, c = (tuple(round(x, decimals) for x in v) for v in tri)
        if a == b or b == c or a == c:
            degenerate += 1
            continue
        for p, q in ((a, b), (b, c), (c, a)):
            key = (p, q) if p < q else (q, p)
            edges[key] = edges.get(key, 0) + 1
    open_edges = sum(1 for n in edges.values() if n == 1)
    nonmanifold = sum(1 for n in edges.values() if n > 2)
    return MeshReport(triangles=count, open_edges=open_edges, nonmanifold_edges=nonmanifold, degenerate=degenerate)
