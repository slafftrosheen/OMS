"""Independent QA dependency: python -m pip install ezdxf; not an OMS runtime dependency."""
import math
import sys
import ezdxf
from ezdxf import bbox

path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/oms-cad-regression.dxf'
doc = ezdxf.readfile(path)
audit = doc.audit()
assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)
assert doc.dxfversion == 'AC1015' and doc.units == 4
entities = list(doc.modelspace())
assert [entity.dxftype() for entity in entities] == ['LWPOLYLINE', 'CIRCLE', 'ELLIPSE', 'ARC', 'LINE', 'SPLINE', 'SPLINE']
rectangle, circle, ellipse, arc, line, closed_curve, open_curve = entities
assert rectangle.closed and len(rectangle) == 4
assert list(rectangle.get_points('xy')) == [(0, 0), (1200, 0), (1200, 600), (0, 600)]
assert circle.dxf.center.isclose((100, 100, 0)) and math.isclose(circle.dxf.radius, 25)
assert ellipse.dxf.major_axis.isclose((100, 100, 0)) and math.isclose(ellipse.dxf.ratio, 0.5)
assert ellipse.dxf.start_param == 0 and ellipse.dxf.end_param == 2 * math.pi
assert arc.dxf.center.isclose((1050, 150, 0)) and math.isclose(arc.dxf.radius, 100)
assert arc.dxf.start_angle == 350 and arc.dxf.end_angle == 80
assert line.dxf.start.isclose((-20, 0, 0)) and line.dxf.end.isclose((-20, 600, 0))
assert [entity.dxf.layer for entity in entities] == ['OMS_CLOSED'] * 3 + ['OMS_OPEN'] * 2 + ['OMS_CLOSED', 'OMS_OPEN']
assert closed_curve.closed and not open_curve.closed
assert closed_curve.dxf.degree == open_curve.dxf.degree == 3
assert len(closed_curve.control_points) == 7 and len(open_curve.control_points) == 4
assert closed_curve.construction_tool().point(0.5).isclose((300, 175, 0))
assert closed_curve.construction_tool().point(1.5).isclose((300, 25, 0))
assert open_curve.construction_tool().point(0.5).isclose((400, 375, 0))
bounds = bbox.extents(entities)
assert bounds.extmin.isclose((-20, 0, 0)) and bounds.extmax.isclose((1200, 600, 0))
print('PASS: R2000 DXF, millimetres, 7 analytic entities, exact panel/hole/arc and open/closed cubic SPLINE coordinates, zero audit errors or repairs.')
