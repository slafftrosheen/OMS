"""Hand-authored PDF, independent of OMS's writer: tiling pattern + isolated
transparency group + Multiply blending. ASCII source, no external PDF package.
"""
from pathlib import Path

def stream(data,extra=''):
 return f'<< /Length {len(data.encode())} {extra} >>\nstream\n{data}\nendstream'
objects=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 144 144] /Resources << /XObject << /Group 5 0 R >> /Pattern << /P1 6 0 R >> /ExtGState << /Blend 7 0 R >> /Font << /F1 8 0 R >> >> /Contents 4 0 R >>',
 stream('1 1 0 rg 0 0 144 144 re f\nq /Blend gs 0 0 1 rg 12 12 80 80 re f Q\nq /Group Do Q\nq /Pattern cs /P1 scn 0 110 144 34 re f Q\n0 0 0 rg BT /F1 9 Tf 12 98 Td (OMS) Tj ET'),
 stream('1 0 0 rg 90 15 40 40 re f 0 1 0 rg 90 55 40 40 re f','/Type /XObject /Subtype /Form /BBox [90 15 130 95] /Group << /S /Transparency /CS /DeviceRGB /I true >> /Resources << >>'),
 stream('1 0 1 rg 0 0 6 12 re f 0 1 1 rg 6 0 6 12 re f','/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 12 12] /XStep 12 /YStep 12 /Resources << >>'),
 '<< /Type /ExtGState /BM /Multiply /ca 0.5 >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
]
text='%PDF-1.7\n';offsets=[0]
for i,o in enumerate(objects,1):
 offsets.append(len(text.encode()));text+=f'{i} 0 obj\n{o}\nendobj\n'
xref=len(text.encode());text+=f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'+''.join(f'{n:010d} 00000 n \n' for n in offsets[1:])+f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'
Path(__file__).with_name('advanced-effects.pdf').write_text(text)
