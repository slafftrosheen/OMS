"""Regenerate with Python + ezdxf 1.4.5. Neither geometry nor samples use OMS.
Run from the repository root. Generated DXFs are committed; Python is not needed for tests.
"""
import json
from pathlib import Path
import ezdxf
from ezdxf.math import BSpline
out=Path(__file__).parent

def doc():
 d=ezdxf.new('R2010');d.units=4;return d

d=doc();m=d.modelspace();d.layers.new('SIGN',dxfattribs={'color':1,'true_color':0x1255bb})
b=d.blocks.new('MODULE',base_point=(2,3));b.add_circle((12,8),5);b.add_line((2,3),(22,3));
i=m.add_blockref('MODULE',(100,50),dxfattribs={'xscale':2,'yscale':.5,'rotation':30,'layer':'SIGN'});i.grid(size=(2,3),spacing=(40,60))
d.saveas(out/'block-array.dxf')

d=doc();m=d.modelspace()
h=m.add_hatch(color=2);h.paths.add_polyline_path([(0,0),(100,0),(100,60),(0,60)],is_closed=True,flags=1);h.paths.add_polyline_path([(20,20),(40,20),(40,40),(20,40)],is_closed=True,flags=0)
h=m.add_hatch(color=3);edge=h.paths.add_edge_path(flags=1);edge.add_arc((150,30),25,0,180,ccw=True);edge.add_line((125,30),(175,30))
h=m.add_hatch(color=4);edge=h.paths.add_edge_path(flags=1);edge.add_ellipse((220,30),(25,0),.5,0,360,ccw=True)
m.add_solid([(0,80),(20,80),(0,100),(20,100)],dxfattribs={'color':1})
m.add_3dface([(30,80,5),(50,80,5),(50,100,5),(30,100,5)])
m.add_lwpolyline([(5,5),(25,5),(25,25)],dxfattribs={'extrusion':(0,0,-1),'elevation':7})
d.saveas(out/'fills-ocs.dxf')

d=doc();m=d.modelspace();controls=[(0,0),(50,0),(60,30),(30,60),(0,40),(0,0),(50,0),(60,30)]
s=m.add_spline(degree=3);s.control_points=controls;s.knots=list(range(len(controls)+4));s.dxf.flags=3
bs=BSpline(controls,order=4,knots=s.knots)
# The mathematical active interval is [U[p], U[n+1]].
lo=s.knots[3];hi=s.knots[len(controls)]
samples=[list(bs.point(lo+(hi-lo)*i/400))[:2] for i in range(401)]
d.saveas(out/'periodic-spline.dxf');(out/'periodic-samples.json').write_text(json.dumps(samples))

d=doc();m=d.modelspace();h=m.add_hatch();edge=h.paths.add_edge_path(flags=1)
edge.add_spline(control_points=[(50,0),(50,50),(0,50)],knot_values=[0,0,0,1,1,1],weights=[1,2**-.5,1],degree=2)
edge.add_line((0,50),(0,0));edge.add_line((0,0),(50,0))
h=m.add_hatch();h.set_pattern_fill('ANSI31',scale=2);h.paths.add_polyline_path([(70,0),(100,0),(100,30),(70,30)],is_closed=True)
m.add_linear_dim(base=(0,-20),p1=(0,0),p2=(100,0),dimstyle='Standard').render()
d.saveas(out/'spline-hatch-dimension.dxf')
