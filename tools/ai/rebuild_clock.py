"""Planar architectural reconstruction from the supplied clock reference.

The v2 neural mesh remains intact. No new image is generated or edited here:
the original orthographic atlas is embedded and faces receive continuous UVs.
"""
from pathlib import Path
import json, hashlib
import numpy as np
import trimesh
from PIL import Image
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path,help='Local directory containing the original orthographic atlas')
root=parser.parse_args().source.resolve()
atlas=Image.open(root/'clocktower-orthographic-atlas-v2.png')
facade=PBRMaterial(name='Orthographic-estimated-elevations',baseColorTexture=atlas,metallicFactor=0,roughnessFactor=.92)
plain=PBRMaterial(name='Ivory-estimated-stone',baseColorFactor=[231,227,215,255],metallicFactor=0,roughnessFactor=.96)
roof=PBRMaterial(name='Flat-grey-roof',baseColorFactor=[123,128,126,255],metallicFactor=0,roughnessFactor=.96)
red=PBRMaterial(name='Red-roof-cap',baseColorFactor=[160,60,52,255],metallicFactor=0,roughnessFactor=.93)
glass=PBRMaterial(name='Side-glazing',baseColorFactor=[46,77,89,255],metallicFactor=.05,roughnessFactor=.6)
scene=trimesh.Scene()
verts={}; uvs={}
def quad(name, points, uv=None):
    order=[0,1,2,0,2,3]
    verts.setdefault(name,[]).extend([points[i] for i in order])
    uvs.setdefault(name,[]).extend([uv[i] if uv else [0,0] for i in order])
def world(px,py,z): return [(px-275.5)/6,(496-py)/6,z]
def facade_uv(points,back=False):
    x0,x1=(574,1108) if back else (18,534)
    return [[(x0+(1-(p[0]*6+275.5-18)/516 if back else (p[0]*6+275.5-18)/516)*(x1-x0))/atlas.width,1-(496-p[1]*6)/atlas.height] for p in points]
def box(x0,x1,y0,y1,z0,z1, glazing=False):
    a,b,c,d=world(x0,y1,z1),world(x1,y1,z1),world(x1,y0,z1),world(x0,y0,z1)
    quad('facade',[a,b,c,d],facade_uv([a,b,c,d]))
    a,b,c,d=world(x1,y1,z0),world(x0,y1,z0),world(x0,y0,z0),world(x1,y0,z0)
    quad('facade',[a,b,c,d],facade_uv([a,b,c,d],True))
    quad('stone',[world(x0,y1,z0),world(x0,y1,z1),world(x0,y0,z1),world(x0,y0,z0)])
    quad('stone',[world(x1,y1,z1),world(x1,y1,z0),world(x1,y0,z0),world(x1,y0,z1)])
    quad('roof',[world(x0,y0,z1),world(x1,y0,z1),world(x1,y0,z0),world(x0,y0,z0)])
    quad('stone',[world(x0,y1,z0),world(x1,y1,z0),world(x1,y1,z1),world(x0,y1,z1)])
    if glazing:
        # Side windows are straight individual panes, never a projected whole-building silhouette.
        for px, side in [(x0,-1),(x1,1)]:
            for y in np.arange((496-y1)/6+2,(496-y0)/6-1,3.3):
                for z in np.arange(z0+2,z1-1,3):
                    x=(px-275.5)/6+side*.035
                    p=[[x,y,z],[x,y,z+1.6],[x,y+1.7,z+1.6],[x,y+1.7,z]]
                    if side>0:p=p[::-1]
                    quad('glass',p)

box(18,110,350,496,-9,11,True)
box(110,217,363,496,-8,8,True)
box(334,438,363,496,-8,8,True)
box(438,534,350,496,-9,11,True)
box(217,334,207,496,-9,9,True)
box(235,317,156,207,-7,7,True)
box(245,305,130,156,-6,6,True)
box(228,322,424,496,9,11.1)
# Cornices and pyramid roof use clean flat surfaces.
for x0,x1,y,depth in [(213,338,207,9.3),(232,320,156,7.3),(243,307,130,6.3)]:box(x0,x1,y-2,y+1,-depth,depth)
base=[world(249,130,-4.4),world(301,130,-4.4),world(301,130,4.4),world(249,130,4.4)]
top=world(275.5,100,0)
for i in range(4):
    points=[base[(i+1)%4],base[i],top]
    verts.setdefault('red',[]).extend(points);uvs.setdefault('red',[]).extend([[0,0]]*3)
# Long tapered spire with square cross section.
lower=[world(272,100,-.6),world(279,100,-.6),world(279,100,.6),world(272,100,.6)]
tip=world(275.5,16,0)
for i in range(4):
    verts.setdefault('stone',[]).extend([lower[(i+1)%4],lower[i],tip]);uvs.setdefault('stone',[]).extend([[0,0]]*3)
for name,material in [('facade',facade),('stone',plain),('roof',roof),('red',red),('glass',glass)]:
    v=np.array(verts[name]);mesh=trimesh.Trimesh(vertices=v,faces=np.arange(len(v)).reshape(-1,3),process=False)
    mesh.visual=TextureVisuals(uv=np.array(uvs[name]),material=material)
    # Keep every corner independent: glass rows and architectural edges stay straight.
    mesh.vertex_normals=np.repeat(mesh.face_normals,3,axis=0)
    scene.add_geometry(mesh,geom_name=name,node_name=name)
scene.metadata={'method':'Planar architectural reconstruction with orthographic facade projection','source':'User panorama + AI orthographic elevation reference','estimated':True,'notPhotogrammetry':True,'previousPrototype':'Tencent Hunyuan3D-2 shape retained locally, not used as final geometry'}
out=root/'clocktower-textured-v3.glb'
scene.export(out,include_normals=True)
print(json.dumps({'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'faces':sum(len(g.faces) for g in scene.geometry.values()),'bounds':scene.bounds.tolist()}))
