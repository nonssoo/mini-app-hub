#!/usr/bin/env python3
"""Diagnose why renders show nothing - check scene geometry, materials, camera."""

import sys
try:
    import bpy
except ImportError:
    print("Run via: blender --background assets/pip_template_rigged.blend --python scripts/diagnose_scene.py")
    sys.exit(1)

print("\n" + "="*70)
print("BLENDER SCENE DIAGNOSTIC")
print("="*70)

scene = bpy.context.scene

# Objects
print("\n📦 OBJECTS IN SCENE:")
print(f"   Total objects: {len(bpy.data.objects)}")
for obj in bpy.data.objects:
    print(f"   - {obj.name:30} | Type: {obj.type:10} | Visible: {not obj.hide_render}")
    if obj.type == 'MESH':
        print(f"      └─ Verts: {len(obj.data.vertices):,} | Faces: {len(obj.data.polygons):,}")
        print(f"      └─ Location: {obj.location}")
        print(f"      └─ Scale: {obj.scale}")
        print(f"      └─ Materials: {len(obj.data.materials)}")
    elif obj.type == 'CAMERA':
        print(f"      └─ Location: {obj.location}")
        print(f"      └─ Rotation: {obj.rotation_euler}")
        print(f"      └─ Focal length: {obj.data.lens}mm")
    elif obj.type == 'LIGHT':
        print(f"      └─ Energy: {obj.data.energy}")
        print(f"      └─ Type: {obj.data.type}")

# Camera
print("\n📷 ACTIVE CAMERA:")
if scene.camera:
    cam = scene.camera
    print(f"   Camera: {cam.name}")
    print(f"   Location: {cam.location}")
    print(f"   Rotation: {cam.rotation_euler}")
    print(f"   Lens: {cam.data.lens}mm")
else:
    print("   ⚠ NO ACTIVE CAMERA")

# Render
print("\n🎬 RENDER SETTINGS:")
print(f"   Engine: {scene.render.engine}")
print(f"   Resolution: {scene.render.resolution_x} x {scene.render.resolution_y}")
print(f"   Frame range: {scene.frame_start}-{scene.frame_end}")
if scene.render.engine == 'CYCLES':
    print(f"   Samples: {scene.cycles.samples}")
print(f"   Film transparent: {scene.render.film_transparent}")

# Lights
print("\n💡 LIGHTS:")
lights = [obj for obj in bpy.data.objects if obj.type == 'LIGHT']
if lights:
    for light in lights:
        print(f"   {light.name}: {light.data.type} | Energy: {light.data.energy} | Visible: {not light.hide_render}")
else:
    print("   ⚠ NO LIGHTS IN SCENE")

# Materials
print("\n🎨 MATERIALS:")
if bpy.data.materials:
    for mat in bpy.data.materials:
        print(f"   {mat.name}: Use nodes: {mat.use_nodes}")
else:
    print("   ⚠ NO MATERIALS")

# Armature
print("\n💀 ARMATURE/RIG:")
armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
if armatures:
    for arm in armatures:
        print(f"   {arm.name}: Bones: {len(arm.data.bones)}")
else:
    print("   ⚠ NO ARMATURE")

print("\n" + "="*70)
print("DIAGNOSTIC COMPLETE")
print("="*70)

# Recommendations
print("\n🔧 IF RENDER SHOWS NOTHING:")
print("   1. Check mesh location - is character at origin (0,0,0)?")
print("   2. Check mesh scale - is it 1.0 or very large/small?")
print("   3. Check camera - can you see geometry in viewport?")
print("   4. Check materials - are they black or invisible?")
print("   5. Check lights - do you have any lights?")

print("\n✓ To fix: Edit camera/light positions in shot config JSON")
