"""Independent DXF fixtures: Python + ezdxf 1.4.5, run from any directory.
Binary DXF is base64-wrapped so repository tooling can transport it losslessly.
"""
import base64, io, json
from pathlib import Path
import ezdxf
from ezdxf.enums import TextEntityAlignment
from ezdxf.disassemble import recursive_decompose
out=Path(__file__).parent
for version in ['R12','R2010']:
 d=ezdxf.new(version);d.units=4
 m=d.modelspace();m.add_line((1,2,0),(31,42,0));m.add_circle((20,20),5)
 m.add_text('H Ø ± °',dxfattribs={'height':5}).set_placement((10,70))
 b=io.BytesIO();d.write(b,fmt='bin');(out/f'binary-{version}.base64').write_text(base64.b64encode(b.getvalue()).decode()+'\n')

d=ezdxf.new('R2010');d.units=4;m=d.modelspace()
m.add_text('H',dxfattribs={'height':10}).set_placement((10,20))
m.add_text('H',dxfattribs={'height':10}).set_placement((100,50),align=TextEntityAlignment.TOP_RIGHT)
m.add_text('HH',dxfattribs={'height':10}).set_placement((10,100),(90,100),align=TextEntityAlignment.FIT)
m.add_text('HH',dxfattribs={'height':10}).set_placement((100,100),(100,180),align=TextEntityAlignment.ALIGNED)
m.add_mtext('Ābols\\PТест %%d',dxfattribs={'char_height':5,'insert':(150,20),'attachment_point':1})
b=d.blocks.new('TAG');b.add_attdef('LABEL',(0,0),height=5);b.add_circle((0,0),10)
i=m.add_blockref('TAG',(200,50),dxfattribs={'rotation':30,'xscale':2,'yscale':2});i.add_auto_attribs({'LABEL':'OMS'})
d.saveas(out/'text-layout.dxf')

d=ezdxf.new('R2010');d.units=4;m=d.modelspace();d.layers.new('RED',dxfattribs={'color':1,'true_color':0xcc2200})
m.add_line((1,2,3),(10,20,30));m.add_polyline3d([(5,5,5),(15,10,20),(25,30,40)])
m.add_3dface([(40,5,3),(60,5,12),(60,25,23),(40,25,9)],dxfattribs={'invisible_edges':2})
p=m.add_polyface();p.append_face([(80,0,0),(100,0,10),(100,20,20),(80,20,10)])
b=d.blocks.new('TILTED',base_point=(1,2,3));b.add_line((1,2,3),(11,22,33),dxfattribs={'color':0})
inner=d.blocks.new('NESTED',base_point=(2,3,4));inner.add_blockref('TILTED',(5,6,7),dxfattribs={'rotation':30,'xscale':2,'yscale':.5,'zscale':3,'extrusion':(0,1,1),'color':0})
m.add_blockref('NESTED',(100,60,20),dxfattribs={'rotation':-20,'xscale':1.5,'yscale':1.5,'zscale':1.5,'extrusion':(1,1,2),'layer':'RED'})
m.add_circle((30,40,5),10,dxfattribs={'extrusion':(0,1,1)})
# Independent expected endpoints from ezdxf's own nested 3D matrix handling.
expected=[]
for e in recursive_decompose([list(m.query('INSERT'))[0]]):
 if e.dxftype()=='LINE':expected.append([list(e.dxf.start),list(e.dxf.end)])
(out/'projection-samples.json').write_text(json.dumps(expected))
d.saveas(out/'projection-3d.dxf')
