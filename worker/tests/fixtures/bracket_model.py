import cadquery as cq

# Mounting bracket MB-120-A (samples/mounting-bracket-drawing.pdf), millimeters.
LENGTH, DEPTH, BASE_T = 120.0, 80.0, 10.0
WALL_T, WALL_H = 12.0, 70.0
BORE_D, BORE_Z = 24.0, 45.0
WALL_HOLE_D, WALL_HOLE_X, WALL_HOLE_Z = 6.5, 40.0, 52.0
BASE_HOLE_D, BASE_HOLE_X = 9.0, 45.0
BASE_HOLE_Y = (15.0, 48.0)
SLOT_L, SLOT_W, SLOT_Y = 30.0, 10.0, 28.0
CORNER_R, BEND_R, BORE_CHAMFER = 8.0, 6.0, 1.0


def wall_hole(diameter, x, z):
    return cq.Workplane("XZ", origin=(x, 0, z)).circle(diameter / 2).extrude(-(DEPTH + 10)).translate((0, -5, 0))


def build():
    base = cq.Workplane("XY").box(LENGTH, DEPTH, BASE_T, centered=(True, False, False))
    wall = cq.Workplane("XY").box(LENGTH, WALL_T, WALL_H, centered=(True, False, False)).translate((0, DEPTH - WALL_T, 0))
    body = base.union(wall)
    body = body.edges(cq.selectors.BoxSelector((-LENGTH, DEPTH - WALL_T - 0.1, BASE_T - 0.1), (LENGTH, DEPTH - WALL_T + 0.1, BASE_T + 0.1))).fillet(BEND_R)
    body = body.edges(cq.selectors.BoxSelector((-LENGTH, -0.1, -0.1), (LENGTH, 0.1, BASE_T + 0.1))).edges("|Z").fillet(CORNER_R)

    holes = [(sx * BASE_HOLE_X, y) for sx in (-1, 1) for y in BASE_HOLE_Y]
    cutters = cq.Workplane("XY").pushPoints(holes).circle(BASE_HOLE_D / 2).extrude(BASE_T * 3, both=True)
    body = body.cut(cutters)
    body = body.cut(cq.Workplane("XY").center(0, SLOT_Y).slot2D(SLOT_L, SLOT_W).extrude(BASE_T * 3, both=True))

    body = body.cut(wall_hole(BORE_D, 0, BORE_Z))
    for sx in (-1, 1):
        body = body.cut(wall_hole(WALL_HOLE_D, sx * WALL_HOLE_X, WALL_HOLE_Z))
    body = body.edges(
        cq.selectors.BoxSelector((-BORE_D, DEPTH - WALL_T - 0.2, BORE_Z - BORE_D), (BORE_D, DEPTH + 0.2, BORE_Z + BORE_D))
    ).edges("%CIRCLE").chamfer(BORE_CHAMFER)
    return body
