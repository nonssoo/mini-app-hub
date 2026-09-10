#!/usr/bin/env python3
"""Deep diagnosis: why isn't the mesh rendering?"""

import sys
try:
    import bpy
except ImportError:
    print("Run via: blender --background assets/pip_template_rigged.blend --python scripts/diagnose_mesh.py")
    sys.exit(1)

print("\n" + "="*70)
print("MESH RENDERING DIAGNOSIS")
print("="*70)

# Find mesh
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
if not meshes:
    print("❌ NO MESH OBJECTS FOUND!")
    sys.exit(1)

mesh_obj = meshes[0]
mesh_data = mesh_obj.data

print(f"\n📦 Mesh: {mesh_obj.name}")
print(f"   Vertices: {len(mesh_data.vertices):,}")
print(f"   Faces/Polygons: {len(mesh_data.polygons):,}")

# Visibility
print(f"\n👁️ VISIBILITY:")
print(f"   Hide render: {mesh_obj.hide_render}")
print(f"   Hide viewport: {mesh_obj.hide_viewport}")
print(f"   Is visible: {not mesh_obj.hide_render and not mesh_obj.hide_viewport}")

# Bounds
print(f"\n📐 BOUNDS:")
print(f"   Location: {mesh_obj.location}")
print(f"   Scale: {mesh_obj.scale}")
print(f"   Rotation: {mesh_obj.rotation_euler}")

bounds = mesh_obj.bound_box
print(f"   Bounding box min: ({bounds[0][0]:.2f}, {bounds[0][1]:.2f}, {bounds[0][2]:.2f})")
print(f"   Bounding box max: ({bounds[6][0]:.2f}, {bounds[6][1]:.2f}, {bounds[6][2]:.2f})")

# Mesh data
print(f"\n🔍 MESH DATA:")
print(f"   Materials: {len(mesh_data.materials)}")
for i, mat in enumerate(mesh_data.materials):
    print(f"      [{i}] {mat.name}")

# Check normals - sample a few faces
print(f"\n🔄 FACE NORMALS (sample 5):")
for i in range(min(5, len(mesh_data.polygons))):
    poly = mesh_data.polygons[i]
    print(f"   Face {i}: normal = ({poly.normal.x:.2f}, {poly.normal.y:.2f}, {poly.normal.z:.2f})")

# Check if all faces point same direction (red flag)
normals = [poly.normal for poly in mesh_data.polygons]
avg_normal = sum(normals, __import__('mathutils').Vector((0,0,0)))
print(f"\n   Average normal: ({avg_normal.x/len(normals):.2f}, {avg_normal.y/len(normals):.2f}, {avg_normal.z/len(normals):.2f})")
print(f"   (Should NOT all point same direction)")

# Material check
print(f"\n🎨 MATERIAL DETAILS:")
for mat in mesh_data.materials:
    if mat.use_nodes:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            color = bsdf.inputs["Base Color"].default_value
            alpha = bsdf.inputs.get("Alpha", None)
            print(f"   {mat.name}:")
            print(f"      Color: RGBA({color[0]:.2f}, {color[1]:.2f}, {color[2]:.2f}, {color[3]:.2f})")
            if alpha:
                print(f"      Alpha: {alpha.default_value:.2f}")
    else:
        print(f"   {mat.name}: No nodes (using legacy material)")

# Camera view check
print(f"\n📷 CAMERA VIEW:")
scene = bpy.context.scene
if scene.camera:
    cam = scene.camera
    print(f"   Camera location: {cam.location}")
    # Simple distance check
    dist = (mesh_obj.location - cam.location).length
    print(f"   Distance to mesh: {dist:.2f}")
    print(f"   Camera near clip: {cam.data.clip_start:.2f}")
    print(f"   Camera far clip: {cam.data.clip_end:.2f}")

    if dist < cam.data.clip_start:
        print(f"   ⚠️ MESH IS INSIDE CAMERA NEAR CLIP PLANE!")
    elif dist > cam.data.clip_end:
        print(f"   ⚠️ MESH IS BEYOND CAMERA FAR CLIP PLANE!")
    else:
        print(f"   ✓ Mesh is within camera clip range")

print("\n" + "="*70)
print("LIKELY ISSUES:")
print("="*70)
print("1. Hide render = True → Uncheck in Blender")
print("2. All normals face away → Run Mesh > Recalculate Normals (Outside)")
print("3. Material alpha = 0 → Check material transparency")
print("4. Mesh beyond clip plane → Adjust camera position")
print("5. Mesh scale = 0 → Check scale values")
