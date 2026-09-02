#!/usr/bin/env python3
"""
Stage 3: Blender scene setup with character import and animation.

Imports rigged FBX character, applies animations via NLA tracks, sets up
lighting and camera, then saves as a reusable .blend template.

Run via:
    blender --background --python scripts/import_and_animate.py -- \\
        --character assets/rigged/pip_rigged.fbx \\
        --animations assets/rigged/pip_walk.fbx assets/rigged/pip_idle.fbx \\
        --output assets/pip_template.blend

Requires: Blender 3.0+ with bpy
"""

import argparse
import sys
from pathlib import Path

# Blender must be run with this script; bpy will be available
try:
    import bpy
    from mathutils import Vector, Matrix, Euler
except ImportError:
    print("Error: This script must be run via: blender --background --python <script>")
    sys.exit(1)


def clear_default_scene():
    """Remove default cube, camera, light."""
    print("  Clearing default scene...")
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()


def import_fbx(fbx_path: str) -> object:
    """Import FBX file and return the first armature/character."""
    print(f"  Importing: {Path(fbx_path).name}")
    bpy.ops.import_scene.fbx(filepath=fbx_path, ignore_leaf_bones=False)

    # Find the armature (skeleton)
    armature = None
    for obj in bpy.context.selected_objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break

    if not armature:
        # If no armature found in selection, search the scene
        for obj in bpy.data.objects:
            if obj.type == 'ARMATURE':
                armature = obj
                break

    if not armature:
        raise ValueError(f"No armature found in {fbx_path}")

    return armature


def setup_lighting():
    """Create a 3-point lighting setup."""
    print("  Setting up 3-point lighting...")

    # Light data
    lights = [
        {
            "name": "Key Light",
            "type": "SUN",
            "energy": 2.0,
            "location": (5, 5, 8),
            "angle": 0.5,
        },
        {
            "name": "Fill Light",
            "type": "SUN",
            "energy": 1.0,
            "location": (-4, -2, 6),
            "angle": 0.5,
        },
        {
            "name": "Back Light",
            "type": "SUN",
            "energy": 1.5,
            "location": (0, -8, 5),
            "angle": 0.5,
        },
    ]

    for light_data in lights:
        # Create light object
        light = bpy.data.lights.new(name=light_data["name"], type=light_data["type"])
        light.energy = light_data["energy"]
        light.angle = light_data["angle"]

        # Create object and link to scene
        light_obj = bpy.data.objects.new(name=light_data["name"], object_data=light)
        bpy.context.collection.objects.link(light_obj)

        # Position
        light_obj.location = light_data["location"]


def setup_camera():
    """Create and position camera."""
    print("  Setting up camera...")

    # Create camera
    camera_data = bpy.data.cameras.new(name="Camera")
    camera_obj = bpy.data.objects.new(name="Camera", object_data=camera_data)
    bpy.context.collection.objects.link(camera_obj)

    # Position camera to frame character (looking at origin from front-right)
    camera_obj.location = (2.5, -3, 1.5)
    camera_obj.rotation_euler = Euler((1.1, 0, 0.4), 'XYZ')

    # Set as active camera
    bpy.context.scene.camera = camera_obj

    # Adjust focal length if needed
    camera_data.lens = 50


def setup_environment(transparent: bool = True):
    """Configure world/background."""
    print("  Setting up environment...")

    world = bpy.data.worlds["World"]
    world.use_nodes = True

    # Get background node
    bg_node = world.node_tree.nodes.get("Background")

    if transparent:
        # Set to transparent
        bg_node.inputs[0].default_value = (1, 1, 1, 0)  # RGBA with alpha=0
        # Enable alpha in render
        bpy.context.scene.render.film_transparent = True
    else:
        # Set to light gray background
        bg_node.inputs[0].default_value = (0.9, 0.9, 0.95, 1.0)
        bpy.context.scene.render.film_transparent = False


def load_animation_to_nla(armature: object, animation_fbx: str, anim_name: str = None):
    """
    Load animation from FBX and add to NLA track.

    Args:
        armature: Armature object to apply animation to
        animation_fbx: Path to animation FBX file
        anim_name: Custom name for the animation (defaults to filename)
    """
    if not anim_name:
        anim_name = Path(animation_fbx).stem

    print(f"    Loading animation: {anim_name} ({Path(animation_fbx).name})")

    # Import animation FBX
    bpy.ops.import_scene.fbx(filepath=animation_fbx, ignore_leaf_bones=False)

    # The import creates objects in the scene; we need to extract the animation
    # Find the imported armature
    imported_armature = None
    for obj in bpy.context.selected_objects:
        if obj.type == 'ARMATURE':
            imported_armature = obj
            break

    if not imported_armature:
        print(f"    ⚠ Warning: No armature found in {animation_fbx}")
        return

    # Get the animation action from imported armature
    if not imported_armature.animation_data or not imported_armature.animation_data.action:
        print(f"    ⚠ Warning: No animation action in {animation_fbx}")
        bpy.data.objects.remove(imported_armature, do_unlink=True)
        return

    action = imported_armature.animation_data.action
    action.name = anim_name  # Rename action

    # Add to target armature's NLA track
    if not armature.animation_data:
        armature.animation_data_create()

    # Create NLA track
    nla_track = armature.animation_data.nla_tracks.new(name=anim_name)
    nla_track.strips.new(anim_name, int(action.frame_range[0]), action)

    print(f"    ✓ Added to NLA track: {anim_name}")

    # Clean up imported armature
    bpy.data.objects.remove(imported_armature, do_unlink=True)


def main():
    parser = argparse.ArgumentParser(
        description="Set up Blender scene with character and animations.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  blender --background --python scripts/import_and_animate.py -- \\
    --character assets/rigged/pip_rigged.fbx \\
    --output assets/pip_template.blend

  blender --background --python scripts/import_and_animate.py -- \\
    --character assets/rigged/pip_rigged.fbx \\
    --animations assets/rigged/pip_walk.fbx assets/rigged/pip_idle.fbx \\
    --output assets/pip_template.blend \\
    --no-transparent
        """
    )

    parser.add_argument(
        "--character",
        required=True,
        help="Path to rigged character FBX"
    )
    parser.add_argument(
        "--animations",
        nargs="+",
        default=[],
        help="Paths to animation FBX files (optional)"
    )
    parser.add_argument(
        "--output", "-o",
        default="assets/pip_template.blend",
        help="Output Blender template file (default: assets/pip_template.blend)"
    )
    parser.add_argument(
        "--no-transparent",
        action="store_true",
        help="Use solid background instead of transparent"
    )

    # Parse args (handle -- separator)
    args_list = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(args_list)

    try:
        print("\n" + "=" * 60)
        print("🎬 Stage 3: Blender Scene Setup")
        print("=" * 60 + "\n")

        # Paths
        character_path = str(Path(args.character).resolve())
        output_path = str(Path(args.output).resolve())

        if not Path(character_path).exists():
            raise FileNotFoundError(f"Character FBX not found: {character_path}")

        # Clear scene
        print("Step 1: Clearing scene...")
        clear_default_scene()

        # Import character
        print("\nStep 2: Importing character...")
        armature = import_fbx(character_path)
        print(f"  ✓ Imported: {armature.name}")

        # Set armature as active
        bpy.context.view_layer.objects.active = armature
        armature.select_set(True)

        # Import animations
        if args.animations:
            print("\nStep 3: Loading animations...")
            for anim_fbx in args.animations:
                anim_path = str(Path(anim_fbx).resolve())
                if not Path(anim_path).exists():
                    print(f"  ⚠ Animation file not found: {anim_path}")
                    continue
                load_animation_to_nla(armature, anim_path)
        else:
            print("\nStep 3: No animations specified (skipped)")

        # Setup scene
        print("\nStep 4: Setting up lighting and camera...")
        setup_lighting()
        setup_camera()

        # Setup environment
        transparent = not args.no_transparent
        setup_environment(transparent=transparent)
        print(f"  ✓ Background: {'Transparent' if transparent else 'Solid'}")

        # Save template
        print(f"\nStep 5: Saving template...")
        print(f"  Saving to: {output_path}")
        bpy.ops.wm.save_as_mainfile(filepath=output_path)
        print(f"  ✓ Template saved")

        print("\n" + "=" * 60)
        print("✅ Stage 3 complete!")
        print("=" * 60)
        print(f"\nTemplate saved: {output_path}")
        print("\nNext steps:")
        print("  1. (Optional) Open the template in Blender to verify lighting/camera")
        print("  2. Stage 4: Configure render shots and batch render")
        print("\n")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
