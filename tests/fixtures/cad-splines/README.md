# Constructed DXF spline regression fixtures

These fixtures were constructed for OMS regression tests, not captured from the user or presented as a reproduction of their failing file.

`mixed-ascii.dxf` and `mixed-binary.dxf` represent the same millimetre document:

- A1: a periodic, nonclamped cubic with repeated leading control points.
- A2: two degree-one spans separated by a full-multiplicity knot discontinuity.
- A3: a rational quadratic quarter circle.
- A4: a fit-point-only record that must remain an explicit omission.

The binary file uses the standard R13+ 16-bit group-code encoding, IEEE-754 little-endian doubles, 16-bit integer counts/flags, and zero-terminated ASCII strings. The header is `AutoCAD Binary DXF\\r\\n\\x1a\\0`.

Reference: [Autodesk SPLINE group codes](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm).
