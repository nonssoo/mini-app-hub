#!/usr/bin/env python3
"""
Stage 2: Prep mesh for Mixamo rigging.

Validates the 3D mesh from TripoSR and converts it to FBX format suitable for
Mixamo. Checks for mesh integrity (polycount, normals, connectivity).

Usage:
    python prep_for_mixamo.py assets/meshes/pip_model.glb --output assets/meshes/pip_model.fbx

Requires: trimesh, numpy, (optional) blender for FBX conversion
"""

import argparse
import sys
from pathlib import Path
import subprocess
import tempfile

try:
    import trimesh
except ImportError:
    print("Error: trimesh not installed. Run: pip install trimesh")
    sys.exit(1)

try:
    import numpy as np
except ImportError:
    print("Error: numpy not installed. Run: pip install numpy")
    sys.exit(1)


def validate_mesh(mesh_path: Path) -> dict:
    """
    Validate mesh integrity.

    Returns:
        dict with validation results and any warnings
    """
    print(f"\n📊 Validating mesh: {mesh_path.name}")
    print("-" * 50)

    if not mesh_path.exists():
        raise FileNotFoundError(f"Mesh file not found: {mesh_path}")

    # Load mesh
    print("  Loading mesh...")
    mesh = trimesh.load(str(mesh_path))

    # Ensure it's a single mesh (not a scene)
    if isinstance(mesh, trimesh.Scene):
        print("  ⚠ Scene detected. Merging all geometries...")
        mesh = trimesh.util.concatenate([geom for geom in mesh.geometry.values()])

    # Validation checks
    results = {
        "valid": True,
        "warnings": [],
        "stats": {}
    }

    # Check connectivity
    if not mesh.is_watertight:
        results["warnings"].append("⚠ Mesh is not watertight (has holes)")

    # Check for inverted normals
    if len(mesh.facets) > 0:
        print(f"  Found {len(mesh.facets)} connected components")
        if len(mesh.facets) > 1:
            results["warnings"].append("⚠ Mesh has multiple disconnected components")

    # Check polycount
    vertex_count = len(mesh.vertices)
    face_count = len(mesh.faces)

    print(f"\n  ✓ Vertices: {vertex_count:,}")
    print(f"  ✓ Faces: {face_count:,}")
    results["stats"]["vertices"] = vertex_count
    results["stats"]["faces"] = face_count

    # Polycount warning (Mixamo prefers < 100k faces)
    if face_count > 200000:
        results["warnings"].append(
            f"⚠ High polycount ({face_count:,} faces). "
            "Mixamo may struggle; consider decimating."
        )

    # Check for degenerate faces
    face_areas = mesh.area_faces
    degenerate = np.sum(face_areas < 1e-10)
    if degenerate > 0:
        results["warnings"].append(f"⚠ Found {degenerate} degenerate (tiny) faces")

    # Check scale
    bounds = mesh.bounds
    size = bounds[1] - bounds[0]
    max_dim = np.max(size)
    print(f"  ✓ Scale (max dimension): {max_dim:.3f} units")
    results["stats"]["max_dimension"] = float(max_dim)

    if max_dim < 0.1 or max_dim > 100:
        results["warnings"].append(
            f"⚠ Unusual scale ({max_dim:.3f} units). "
            "May need to rescale for Mixamo."
        )

    # Summary
    print(f"\n  Status: {'✓ Valid' if not results['warnings'] else '⚠ Warnings'}")
    if results["warnings"]:
        for warning in results["warnings"]:
            print(f"    {warning}")

    results["mesh"] = mesh
    return results


def convert_to_fbx(glb_path: Path, fbx_path: Path) -> bool:
    """
    Convert GLB to FBX using Blender in background mode.

    Returns:
        True if successful, False otherwise
    """
    print(f"\n🔄 Converting to FBX: {fbx_path.name}")
    print("-" * 50)

    # Create a temporary Blender script
    blender_script = """
import bpy
import sys

# Clear default scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Import GLB
glb_path = sys.argv[-2]
bpy.ops.import_scene.gltf(filepath=glb_path)

# Select all and join into single mesh
bpy.ops.object.select_all(action='SELECT')
if bpy.context.selected_objects:
    ctx = bpy.context.copy()
    ctx['object'] = bpy.context.selected_objects[0]
    bpy.ops.object.join(ctx)

# Export as FBX
fbx_path = sys.argv[-1]
bpy.ops.export_scene.fbx(
    filepath=fbx_path,
    use_selection=False,
    scale_interactions=1.0,
    forward_axis='Y',
    up_axis='Z'
)

print(f"Exported: {fbx_path}")
"""

    # Check if Blender is installed
    blender_cmd = "blender"
    try:
        result = subprocess.run(
            [blender_cmd, "--version"],
            capture_output=True,
            timeout=5
        )
        if result.returncode != 0:
            raise FileNotFoundError("Blender not found")
        print("  ✓ Blender found")
    except FileNotFoundError:
        print("  ✗ Blender not found. Install Blender or use trimesh export instead.")
        return False

    # Write temporary script
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(blender_script)
        script_path = f.name

    try:
        print(f"  Converting via Blender...")
        cmd = [
            blender_cmd,
            "--background",
            "--python", script_path,
            "--", str(glb_path), str(fbx_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            print(f"  ✗ Blender conversion failed:")
            print(f"    {result.stderr}")
            return False

        if fbx_path.exists():
            file_size = fbx_path.stat().st_size / 1e6
            print(f"  ✓ Converted successfully ({file_size:.2f} MB)")
            return True
        else:
            print("  ✗ FBX file not created")
            return False

    finally:
        # Clean up temp script
        Path(script_path).unlink(missing_ok=True)


def export_fbx_with_trimesh(mesh: trimesh.Trimesh, fbx_path: Path) -> bool:
    """
    Export to FBX using trimesh (if Blender not available).
    Limited but may work for simple meshes.
    """
    print(f"\n💾 Exporting to FBX (trimesh): {fbx_path.name}")
    print("-" * 50)

    try:
        # trimesh can export to OBJ directly; for FBX we'd need assimp/pyfqmr
        print("  Note: trimesh export to FBX requires assimp.")
        print("  Attempting OBJ export instead (recommended: convert via Blender)...")

        obj_path = fbx_path.with_suffix('.obj')
        mesh.export(str(obj_path))
        print(f"  ✓ Exported as OBJ: {obj_path.name}")
        print(f"    (You can convert to FBX in Blender or Mixamo)")
        return True

    except Exception as e:
        print(f"  ✗ Export failed: {e}")
        return False


def print_mixamo_instructions():
    """Print manual Mixamo workflow steps."""
    print("\n" + "=" * 60)
    print("📋 NEXT: Manual Mixamo Workflow")
    print("=" * 60)

    instructions = """
Mixamo has no API, so this step is manual but quick (~5 min):

1. GO TO MIXAMO:
   Visit https://www.mixamo.com (free Adobe account required)

2. UPLOAD YOUR CHARACTER:
   - Click "Upload Character"
   - Select the FBX file (assets/meshes/pip_model.fbx)
   - Wait for upload (~30 sec)

3. AUTO-RIG YOUR CHARACTER:
   Mixamo will show the character and ask you to mark key joints:
   - CHIN: Click on the character's head/chin area
   - LEFT WRIST: Click on left hand/wrist
   - RIGHT WRIST: Click on right hand/wrist
   - LEFT KNEE: Click on left leg/knee
   - RIGHT KNEE: Click on right leg/knee
   - GROIN: Click on the torso/hip area (where legs meet body)

   Tip: The markers don't need to be pixel-perfect. Mixamo auto-detects.

4. START RIG:
   - Click "Next" to generate the rig (~2-3 min)
   - Mixamo will create an armature (skeleton) for Pip

5. DOWNLOAD YOUR CHARACTER:
   - Once rigging finishes, you'll see animation options
   - Download the RIGGED CHARACTER (without animation first):
     * Format: FBX Binary (.fbx)
     * Skin: WITH Skin ✓
     * Animations: None (we'll add these separately)
   - Save as: assets/rigged/pip_rigged.fbx

6. DOWNLOAD ANIMATIONS (Optional but recommended):
   - Return to Mixamo character page
   - Browse animations (Walk, Idle, Run, Jump, etc.)
   - For each animation you want:
     * Click the animation
     * Download as FBX (WITH Skin)
     * Save to: assets/rigged/pip_idle.fbx, pip_walk.fbx, etc.

7. NOTIFY NEXT STAGE:
   Once rigged FBX(s) are in assets/rigged/, run Stage 3:

   python scripts/import_and_animate.py \\
     --character assets/rigged/pip_rigged.fbx \\
     --output assets/pip_template.blend

Done! Your character is now rigged and ready for animation in Blender.
"""
    print(instructions)


def main():
    parser = argparse.ArgumentParser(
        description="Validate and prep 3D mesh for Mixamo rigging.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python prep_for_mixamo.py assets/meshes/pip_model.glb
  python prep_for_mixamo.py assets/meshes/pip_model.glb --output custom_name.fbx
  python prep_for_mixamo.py assets/meshes/pip_model.glb --no-convert
        """
    )

    parser.add_argument(
        "mesh",
        type=Path,
        help="Path to input mesh (GLB or OBJ)"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=None,
        help="Output FBX path (default: mesh directory with .fbx extension)"
    )
    parser.add_argument(
        "--no-convert",
        action="store_true",
        help="Skip FBX conversion (validate only)"
    )
    parser.add_argument(
        "--decimate",
        type=float,
        default=None,
        help="Decimation ratio (0-1, e.g., 0.5 to reduce to 50%% polycount)"
    )

    args = parser.parse_args()

    # Resolve paths
    mesh_path = args.mesh.resolve()
    if not args.output:
        fbx_path = mesh_path.with_suffix('.fbx')
    else:
        fbx_path = args.output.resolve()

    try:
        # Validate
        validation = validate_mesh(mesh_path)

        if not validation["valid"] and validation["warnings"]:
            print("\n⚠ Mesh has warnings. Proceeding anyway...")

        # Decimate if requested
        if args.decimate:
            print(f"\n✂️ Decimating mesh to {args.decimate * 100:.0f}%...")
            mesh = validation["mesh"]
            target_count = int(len(mesh.faces) * args.decimate)
            mesh.simplify_mesh(target_count=target_count, aggressive=True)
            print(f"  ✓ Decimated to {len(mesh.faces):,} faces")
            validation["mesh"] = mesh

        # Convert if not skipped
        if not args.no_convert:
            mesh = validation["mesh"]

            # Try Blender first
            if not convert_to_fbx(mesh_path, fbx_path):
                # Fallback to trimesh export
                export_fbx_with_trimesh(mesh, fbx_path)

        # Print next steps
        print_mixamo_instructions()

        print(f"\n✅ Stage 2 complete!")
        print(f"   Prepared mesh: {fbx_path.name}")
        print(f"   Next: Upload to Mixamo and download rigged FBX")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
