"""Builds CADify's sample assets: a mounting bracket as STEP + STL, and a
matching two-page engineering drawing PDF.

The geometry is real CadQuery/OpenCascade output. The drawing views are
projected from the same solid with hidden-line removal, so the drawing and the
model always agree.

Usage: python build_sample.py <output_dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cadquery as cq
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import Arc, FancyArrowPatch, Rectangle  # noqa: E402
from OCP.BRepLib import BRepLib  # noqa: E402
from OCP.GCPnts import GCPnts_QuasiUniformDeflection  # noqa: E402
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt  # noqa: E402
from OCP.HLRAlgo import HLRAlgo_Projector  # noqa: E402
from OCP.HLRBRep import HLRBRep_Algo, HLRBRep_HLRToShape  # noqa: E402

# ---------------------------------------------------------------- geometry ---
L, D, T = 120.0, 80.0, 10.0  # base length (X), depth (Y), thickness (Z)
WALL_T, WALL_H = 12.0, 70.0  # upright wall thickness (Y) and overall height
BORE_D, BORE_Z = 24.0, 45.0
WALL_HOLE_D, WALL_HOLE_X, WALL_HOLE_Z = 6.5, 40.0, 52.0
BASE_HOLE_D, BASE_HOLE_X = 9.0, 45.0
BASE_HOLE_Y = (15.0, 48.0)
SLOT_L, SLOT_W, SLOT_Y = 30.0, 10.0, 28.0
CORNER_R, BEND_R, BORE_CHAMFER = 8.0, 6.0, 1.0


def build_bracket() -> cq.Workplane:
    base = cq.Workplane("XY").box(L, D, T, centered=(True, False, False))
    wall = (
        cq.Workplane("XY")
        .box(L, WALL_T, WALL_H, centered=(True, False, False))
        .translate((0, D - WALL_T, 0))
    )
    body = base.union(wall)

    # Inner bend fillet between base top and wall front face.
    body = body.edges(
        cq.selectors.BoxSelector((-L, D - WALL_T - 0.1, T - 0.1), (L, D - WALL_T + 0.1, T + 0.1))
    ).fillet(BEND_R)
    # Front vertical corners of the base.
    body = body.edges(
        cq.selectors.BoxSelector((-L, -0.1, -0.1), (L, 0.1, T + 0.1))
    ).edges("|Z").fillet(CORNER_R)

    # Four through holes in the base.
    pts = [(sx * BASE_HOLE_X, y) for sx in (-1, 1) for y in BASE_HOLE_Y]
    body = body.faces("<Z").workplane(centerOption="ProjectedOrigin", origin=(0, 0, 0))
    body = body.pushPoints([(x, -y) for x, y in pts]).hole(BASE_HOLE_D)

    # Slot through the base.
    slot = (
        cq.Workplane("XY")
        .center(0, SLOT_Y)
        .slot2D(SLOT_L, SLOT_W)
        .extrude(T * 3, both=True)
    )
    body = body.cut(slot)

    # Bore and mounting holes through the wall.
    def wall_cyl(diameter: float, x: float, z: float) -> cq.Workplane:
        return (
            cq.Workplane("XZ", origin=(x, 0, z))
            .circle(diameter / 2)
            .extrude(-(D + 10))
            .translate((0, -5, 0))
        )

    body = body.cut(wall_cyl(BORE_D, 0, BORE_Z))
    for sx in (-1, 1):
        body = body.cut(wall_cyl(WALL_HOLE_D, sx * WALL_HOLE_X, WALL_HOLE_Z))

    # Chamfer both ends of the bore.
    body = body.edges(
        cq.selectors.BoxSelector(
            (-BORE_D, D - WALL_T - 0.2, BORE_Z - BORE_D), (BORE_D, D + 0.2, BORE_Z + BORE_D)
        )
    ).edges("%CIRCLE").chamfer(BORE_CHAMFER)
    return body


# -------------------------------------------------------------- projection ---
def project(shape: cq.Shape, normal, xdir):
    """Hidden-line projection. Returns (visible, hidden) lists of polylines."""
    hlr = HLRBRep_Algo()
    hlr.Add(shape.wrapped)
    hlr.Projector(HLRAlgo_Projector(gp_Ax2(gp_Pnt(), gp_Dir(*normal), gp_Dir(*xdir))))
    hlr.Update()
    hlr.Hide()
    out = HLRBRep_HLRToShape(hlr)

    def collect(compounds):
        lines = []
        for comp in compounds:
            if comp.IsNull():
                continue
            BRepLib.BuildCurves3d_s(comp, 1e-6)
            for edge in cq.Shape(comp).Edges():
                curve = edge._geomAdaptor()
                pts = GCPnts_QuasiUniformDeflection(
                    curve, 0.05, curve.FirstParameter(), curve.LastParameter()
                )
                if pts.IsDone():
                    lines.append(
                        [(pts.Value(i + 1).X(), pts.Value(i + 1).Y()) for i in range(pts.NbPoints())]
                    )
        return lines

    visible = collect([out.VCompound(), out.Rg1LineVCompound(), out.OutLineVCompound()])
    hidden = collect([out.HCompound(), out.OutLineHCompound()])
    return visible, hidden


# ----------------------------------------------------------------- drawing ---
INK = "#111111"
THIN = 0.35
THICK = 0.9


def draw_view(ax, shape, normal, xdir, origin, scale=1.0, hidden=True):
    vis, hid = project(shape, normal, xdir)
    ox, oy = origin
    for line in vis:
        xs = [ox + p[0] * scale for p in line]
        ys = [oy + p[1] * scale for p in line]
        ax.plot(xs, ys, color=INK, lw=THICK, solid_capstyle="round")
    if hidden:
        for line in hid:
            xs = [ox + p[0] * scale for p in line]
            ys = [oy + p[1] * scale for p in line]
            ax.plot(xs, ys, color=INK, lw=THIN, ls=(0, (4, 2.5)))


def centerline(ax, p0, p1):
    ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color=INK, lw=0.25, ls=(0, (12, 2, 2, 2)))


def arrow(ax, p0, p1):
    ax.add_patch(
        FancyArrowPatch(p0, p1, arrowstyle="<|-|>", mutation_scale=7, lw=0.35, color=INK,
                        shrinkA=0, shrinkB=0)
    )


def text(ax, x, y, s, size=7, rot=0, ha="center", va="center", weight="normal"):
    ax.text(x, y, s, fontsize=size, rotation=rot, ha=ha, va=va, color=INK,
            family="DejaVu Sans", weight=weight)


def hdim(ax, x0, x1, y_feat, y_dim, label):
    for x in (x0, x1):
        ax.plot([x, x], [y_feat + (1.5 if y_dim > y_feat else -1.5), y_dim + (2 if y_dim > y_feat else -2)],
                color=INK, lw=0.3)
    arrow(ax, (x0, y_dim), (x1, y_dim))
    text(ax, (x0 + x1) / 2, y_dim + 2.6, label)


def vdim(ax, y0, y1, x_feat, x_dim, label):
    for y in (y0, y1):
        ax.plot([x_feat + (1.5 if x_dim > x_feat else -1.5), x_dim + (2 if x_dim > x_feat else -2)], [y, y],
                color=INK, lw=0.3)
    arrow(ax, (x_dim, y0), (x_dim, y1))
    text(ax, x_dim - 2.6 if x_dim < x_feat else x_dim + 2.6, (y0 + y1) / 2, label, rot=90)


def leader(ax, p_tip, p_text, label, ha="left"):
    ax.annotate(label, xy=p_tip, xytext=p_text, fontsize=7, color=INK, ha=ha, va="center",
                arrowprops=dict(arrowstyle="-|>", lw=0.35, color=INK, mutation_scale=6))


def frame(ax, sheet: int, title: str):
    ax.add_patch(Rectangle((10, 10), 400, 277, fill=False, lw=1.0, ec=INK))
    ax.add_patch(Rectangle((5, 5), 410, 287, fill=False, lw=0.3, ec=INK))
    for i, letter in enumerate("ABCD"):
        text(ax, 7.5, 10 + 277 * (i + 0.5) / 4, letter, size=6)
    for i in range(8):
        text(ax, 10 + 400 * (i + 0.5) / 8, 7.5, str(8 - i), size=6)

    # Title block
    x0, y0, w, h = 250, 10, 160, 52
    ax.add_patch(Rectangle((x0, y0), w, h, fill=False, lw=0.8, ec=INK))
    rows = [y0 + 40, y0 + 30, y0 + 20, y0 + 10]
    for y in rows:
        ax.plot([x0, x0 + w], [y, y], color=INK, lw=0.4)
    ax.plot([x0 + 80, x0 + 80], [y0, y0 + 40], color=INK, lw=0.4)
    ax.plot([x0 + 120, x0 + 120], [y0, y0 + 20], color=INK, lw=0.4)

    def cell(x, y, label, value, vsize=7.5):
        text(ax, x + 2, y + 7.2, label, size=4.5, ha="left")
        text(ax, x + 2, y + 3.2, value, size=vsize, ha="left", weight="bold")

    text(ax, x0 + 2, y0 + 49, "TITLE", size=4.5, ha="left")
    text(ax, x0 + 2, y0 + 44.5, title, size=10, ha="left", weight="bold")
    cell(x0, y0 + 30, "PART NUMBER", "MB-120-A")
    cell(x0 + 80, y0 + 30, "MATERIAL", "AL 6061-T6")
    cell(x0, y0 + 20, "DRAWN", "CADify Samples")
    cell(x0 + 80, y0 + 20, "DATE", "2026-11-24")
    cell(x0, y0 + 10, "UNITS", "MILLIMETERS")
    cell(x0 + 80, y0 + 10, "SCALE", "1:1")
    cell(x0 + 120, y0 + 10, "REV", "A")
    cell(x0, y0, "TOLERANCES", "±0.1 UNLESS NOTED", vsize=6.5)
    cell(x0 + 80, y0, "SHEET", f"{sheet} OF 2")
    cell(x0 + 120, y0, "SIZE", "A3")

    # Third-angle projection symbol
    sx, sy = x0 + 128, y0 + 27
    ax.add_patch(Rectangle((sx - 4, sy - 3), 8, 6, fill=False, lw=0.4, ec=INK))
    ax.plot([sx + 7, sx + 7], [sy - 3, sy + 3], color=INK, lw=0.4)
    ax.add_patch(Arc((sx + 18, sy), 6, 6, lw=0.4, color=INK))
    ax.add_patch(Arc((sx + 18, sy), 2.5, 2.5, lw=0.4, color=INK))
    text(ax, x0 + 121.5, y0 + 37, "PROJECTION", size=4.5, ha="left")


def make_drawing(body: cq.Workplane, pdf_path: Path):
    shape = body.val()
    with PdfPages(pdf_path) as pdf:
        # ---------------- sheet 1: orthographic views ----------------
        fig = plt.figure(figsize=(420 / 25.4, 297 / 25.4))
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_xlim(0, 420)
        ax.set_ylim(0, 297)
        ax.set_aspect("equal")
        ax.axis("off")
        frame(ax, 1, "MOUNTING BRACKET")

        fx, fy = 120, 88       # front view origin (model x=0, z=0)
        tx, ty = 120, 180      # top view origin (model x=0, y=0)
        sx, sy = 225, 88       # right view origin (model y=0, z=0)

        draw_view(ax, shape, (0, -1, 0), (1, 0, 0), (fx, fy))
        draw_view(ax, shape, (0, 0, 1), (1, 0, 0), (tx, ty))
        draw_view(ax, shape, (1, 0, 0), (0, 1, 0), (sx, sy))
        draw_view(ax, shape, (1, -1, 1), (1, 1, 0), (338, 215), scale=0.52, hidden=False)

        text(ax, fx, fy - 22, "FRONT VIEW", size=7, weight="bold")
        text(ax, tx, ty + D + 17, "TOP VIEW", size=7, weight="bold")
        text(ax, sx + D / 2, sy - 22, "RIGHT VIEW", size=7, weight="bold")
        text(ax, 338, 190, "ISOMETRIC VIEW (REF)", size=7, weight="bold")

        # Centerlines
        centerline(ax, (fx - 18, fy + BORE_Z), (fx + 18, fy + BORE_Z))
        centerline(ax, (fx, fy + BORE_Z - 18), (fx, fy + BORE_Z + 18))
        for s in (-1, 1):
            cx = fx + s * WALL_HOLE_X
            centerline(ax, (cx - 6, fy + WALL_HOLE_Z), (cx + 6, fy + WALL_HOLE_Z))
            centerline(ax, (cx, fy + WALL_HOLE_Z - 6), (cx, fy + WALL_HOLE_Z + 6))
            for by in BASE_HOLE_Y:
                cx, cy = tx + s * BASE_HOLE_X, ty + by
                centerline(ax, (cx - 8, cy), (cx + 8, cy))
                centerline(ax, (cx, cy - 8), (cx, cy + 8))
        centerline(ax, (tx - SLOT_L / 2 - 10, ty + SLOT_Y), (tx + SLOT_L / 2 + 10, ty + SLOT_Y))

        # Front view dimensions
        hdim(ax, fx - L / 2, fx + L / 2, fy, fy - 12, "120")
        vdim(ax, fy, fy + WALL_H, fx - L / 2, fx - L / 2 - 14, "70")
        vdim(ax, fy, fy + BORE_Z, fx + L / 2, fx + L / 2 + 10, "45")
        hdim(ax, fx - WALL_HOLE_X, fx + WALL_HOLE_X, fy + WALL_H, fy + WALL_H + 9, "80")
        leader(ax, (fx + 8.5, fy + BORE_Z + 8.5), (fx + 22, fy + BORE_Z + 22),
               "Ø24 THRU\n1 × 45° BOTH SIDES")
        leader(ax, (fx + WALL_HOLE_X + 2.3, fy + WALL_HOLE_Z + 2.3),
               (fx + L / 2 + 6, fy + WALL_H + 8), "2× Ø6.5 THRU", ha="left")

        # Top view dimensions
        hdim(ax, tx - BASE_HOLE_X, tx + BASE_HOLE_X, ty + D, ty + D + 8, "90")
        vdim(ax, ty, ty + D, tx + L / 2, tx + L / 2 + 22, "80")
        vdim(ax, ty, ty + BASE_HOLE_Y[0], tx + L / 2, tx + L / 2 + 8, "15")
        vdim(ax, ty, ty + BASE_HOLE_Y[1], tx + L / 2, tx + L / 2 + 15, "48")
        leader(ax, (tx - BASE_HOLE_X - 3.2, ty + BASE_HOLE_Y[1] + 3.2),
               (tx - L / 2 - 6, ty + D + 4), "4× Ø9 THRU", ha="right")
        leader(ax, (tx + SLOT_L / 2, ty + SLOT_Y - SLOT_W / 2),
               (tx + 30, ty + 6), "SLOT 30 × 10", ha="left")
        vdim(ax, ty, ty + SLOT_Y, tx - L / 2, tx - L / 2 - 9, "28")
        leader(ax, (tx - L / 2 + 2.3, ty + 2.3), (tx - L / 2 - 14, ty - 8), "2× R8", ha="right")

        # Right view dimensions
        vdim(ax, sy, sy + T, sx, sx - 7, "10")
        hdim(ax, sx + D - WALL_T, sx + D, sy + WALL_H, sy + WALL_H + 8, "12")
        hdim(ax, sx, sx + D, sy, sy - 12, "80")
        leader(ax, (sx + D - WALL_T - 1.8, sy + T + 1.8), (sx + 30, sy + 32), "R6", ha="right")

        text(ax, 20, 52, "NOTES:", size=7, ha="left", weight="bold")
        for i, note in enumerate([
            "1. BREAK ALL SHARP EDGES 0.3 MAX.",
            "2. SURFACE FINISH Ra 3.2 UNLESS NOTED.",
            "3. ANODIZE CLEAR PER MIL-A-8625 TYPE II.",
            "4. SEE SHEET 2 FOR SLOT DETAIL.",
        ]):
            text(ax, 20, 45 - i * 6, note, size=6.5, ha="left")
        pdf.savefig(fig)
        plt.close(fig)

        # ---------------- sheet 2: detail + revisions ----------------
        fig = plt.figure(figsize=(420 / 25.4, 297 / 25.4))
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_xlim(0, 420)
        ax.set_ylim(0, 297)
        ax.set_aspect("equal")
        ax.axis("off")
        frame(ax, 2, "MOUNTING BRACKET")

        # Detail A: slot region of the top view at 2:1
        dx, dy = 130, 140
        draw_view(ax, shape, (0, 0, 1), (1, 0, 0), (dx, dy - SLOT_Y * 2), scale=2.0, hidden=False)
        ax.add_patch(Rectangle((dx - 70, dy - 45), 140, 90, fc="white", ec="none", zorder=0))
        text(ax, dx, dy - 70, "DETAIL A  (SCALE 2:1)", size=8, weight="bold")
        centerline(ax, (dx - 50, dy), (dx + 50, dy))
        hdim(ax, dx - SLOT_L, dx + SLOT_L, dy + SLOT_W, dy + 24, "30")
        vdim(ax, dy - SLOT_W, dy + SLOT_W, dx + SLOT_L + SLOT_W, dx + SLOT_L + 22, "10")
        leader(ax, (dx - SLOT_L - 8, dy + 4), (dx - 70, dy + 30), "SLOT DEPTH: SEE NOTE 4", ha="right")

        # Revision table
        rx, ry = 250, 240
        ax.add_patch(Rectangle((rx, ry - 30), 160, 40, fill=False, lw=0.6, ec=INK))
        text(ax, rx + 80, ry + 5, "REVISIONS", size=7, weight="bold")
        ax.plot([rx, rx + 160], [ry, ry], color=INK, lw=0.4)
        for col, label in ((rx + 8, "REV"), (rx + 50, "DESCRIPTION"), (rx + 135, "DATE")):
            text(ax, col, ry - 5, label, size=6, weight="bold")
        ax.plot([rx, rx + 160], [ry - 10, ry - 10], color=INK, lw=0.4)
        text(ax, rx + 8, ry - 15, "A", size=6.5)
        text(ax, rx + 50, ry - 15, "INITIAL RELEASE", size=6.5)
        text(ax, rx + 135, ry - 15, "2026-11-24", size=6.5)

        text(ax, 250, 150, "GENERAL NOTES:", size=7, ha="left", weight="bold")
        for i, note in enumerate([
            "1. INTERPRET DRAWING PER ASME Y14.5-2018.",
            "2. ALL DIMENSIONS IN MILLIMETERS.",
            "3. DEBURR ALL HOLES.",
            "4. SLOT DEPTH TO MATCH BASE THICKNESS.",
            "5. FILLETS NOT SHOWN R0.5 MAX.",
        ]):
            text(ax, 250, 142 - i * 7, note, size=6.5, ha="left")
        pdf.savefig(fig)
        plt.close(fig)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    out.mkdir(parents=True, exist_ok=True)
    body = build_bracket()
    solid = body.val()
    assert solid.isValid(), "generated solid is not valid"

    cq.exporters.export(body, str(out / "mounting-bracket.step"))
    cq.exporters.export(body, str(out / "mounting-bracket.stl"), tolerance=0.02, angularTolerance=0.1)
    make_drawing(body, out / "mounting-bracket-drawing.pdf")

    bb = solid.BoundingBox()
    meta = {
        "boundingBox": {"x": round(bb.xlen, 3), "y": round(bb.ylen, 3), "z": round(bb.zlen, 3)},
        "volumeMm3": round(solid.Volume(), 2),
        "solidCount": len(body.solids().vals()),
        "faceCount": len(solid.Faces()),
        "isValid": solid.isValid(),
    }
    (out / "mounting-bracket.meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
