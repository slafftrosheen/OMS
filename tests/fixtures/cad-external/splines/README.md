# Upstream spline regression fixtures

These files preserve upstream geometry for independent OMS DXF import tests.
They are not exports of the user's failing drawing.

- `dxf-parser-splines.dxf`: unchanged [dxf-parser fixture](https://github.com/gdsestimating/dxf-parser/blob/0df7a37a4207a1f925b8d0bfffc270ff121446b4/test/data/splines.dxf), original blob `728e726c96ae676b79caf6fe28ed4a72f56a84d3`. Two cubic splines; includes fit-point metadata, non-unit knot intervals and repeated interior knots.
- `dxf-parser-arcs-as-splines.dxf`: unchanged [dxf-parser fixture](https://github.com/gdsestimating/dxf-parser/blob/0df7a37a4207a1f925b8d0bfffc270ff121446b4/test/data/arcs-as-splines.dxf), original blob `182a63ff24e5eb9374584898a5fade699b154cbc`. Two rational quadratic circles and one open rational quadratic arc. These files do not declare units; tests explicitly choose millimeters.
- `ezdxf-knot-imprecision.dxf`: original control points, weights and knots from [ezdxf issue 1284 regression](https://github.com/mozman/ezdxf/blob/a5a2eb642f8b2bac31414f9a06bed398d276883b/tests/test_10_issues/test_issue_1284_spline_knot_imprecision.py), serialized into a minimal planar DXF with millimeter units and a declared knot tolerance of 1e-9. The endpoint knots differ by about 6e-16.
- `ezdxf-linear-segments.dxf`: original controls and knots from [ezdxf's linear spline regression](https://github.com/mozman/ezdxf/blob/a5a2eb642f8b2bac31414f9a06bed398d276883b/tests/test_02_dxf_graphics/test_226_spline_with_linear_segments.py), serialized into a minimal planar DXF with millimeter units. Contains 22 cubic spans, including repeated controls and straight sections.

Upstream MIT license notices are retained in `LICENSES.txt`.
Tests evaluate the published knots and controls using Cox-de Boor basis functions independently of OMS knot insertion. Circle tests additionally use analytic center/radius checks, including every approximation chord's midpoint.
