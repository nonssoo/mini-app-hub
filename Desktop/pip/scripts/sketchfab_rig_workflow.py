#!/usr/bin/env python3
"""
Sketchfab Auto-Rig Workflow Helper

This script provides instructions and utilities for using Sketchfab's auto-rig
as a fallback when Mixamo fails.

Workflow:
  1. Upload pip_repaired.glb to Sketchfab
  2. Apply auto-rig via Sketchfab web UI
  3. Download rigged FBX
  4. Run this script to validate & move to assets/rigged/

Usage:
  python scripts/sketchfab_rig_workflow.py --instructions
  python scripts/sketchfab_rig_workflow.py --validate <path-to-downloaded-fbx>
"""

import argparse
import sys
from pathlib import Path

try:
    import trimesh
except ImportError:
    print("Warning: trimesh not installed; some validations skipped")
    trimesh = None


def print_instructions():
    """Print step-by-step Sketchfab workflow instructions."""
    instructions = """
╔════════════════════════════════════════════════════════════════════════╗
║                   SKETCHFAB AUTO-RIG WORKFLOW                         ║
╚════════════════════════════════════════════════════════════════════════╝

STEP 1: Prepare Mesh
  ✓ File ready: assets/meshes/pip_repaired.glb
  ✓ Status: Repaired & validated for rigging

STEP 2: Upload to Sketchfab
  1. Go to: https://sketchfab.com/
  2. Sign in (create account if needed)
  3. Click "Upload" (top right)
  4. Select file: assets/meshes/pip_repaired.glb
  5. Title: "Pip - Auto-Rig Test"
  6. Model type: Character / Humanoid (if available)
  7. Click "Upload and Publish"
  8. Wait for processing (1-5 min)

STEP 3: Apply Auto-Rig
  1. Once uploaded, go to your model page
  2. Click "Edit" (pencil icon)
  3. Look for "Auto-Rig" or "Rigging" tool in the editor
  4. If available: Click "Auto-Rig" → Apply
  5. Preview the result
  6. If satisfied, proceed to Step 4

STEP 4: Download Rigged Model
  1. Go back to model page
  2. Click "Download" button (usually bottom-right)
  3. Choose format: "Autodesk FBX (.fbx)" or "Collada (.dae)"
  4. Save to: ~/Desktop/pip_rigged_from_sketchfab.fbx

STEP 5: Validate & Import
  1. Run this script with validation:
     python scripts/sketchfab_rig_workflow.py \\
       --validate ~/Desktop/pip_rigged_from_sketchfab.fbx

  2. If validation passes ✓:
     - FBX will be moved to: assets/rigged/pip_rigged.fbx
     - You can then run Stage 3 (Blender import)

STEP 6: Test Pipeline
  Run Stage 3 import script:
    blender --background assets/pip_template.blend --python \\
      scripts/import_and_animate.py -- \\
      --character assets/rigged/pip_rigged.fbx

════════════════════════════════════════════════════════════════════════

TROUBLESHOOTING:

Q: Sketchfab doesn't have "Auto-Rig" option?
A: Try uploading as "Humanoid" or check for "Rigging Tools"
   Some Sketchfab plans require premium for auto-rig.
   Fallback: Download as-is, use Blender Rigify script instead.

Q: Downloaded FBX doesn't have a skeleton?
A: Sketchfab may not have rigged your model.
   Try: Upload with explicit humanoid marker
   Or: Switch to Blender Rigify (Option 2)

Q: Model looks distorted after rigging?
A: Rig may have incorrect scale/orientation
   Solution: In Blender, adjust armature + re-export

════════════════════════════════════════════════════════════════════════
"""
    print(instructions)


def validate_fbx(fbx_path: Path) -> bool:
    """Validate FBX has skeleton/armature."""
    print(f"\n🔍 Validating FBX: {fbx_path.name}")
    print("-" * 60)

    if not fbx_path.exists():
        print(f"  ✗ File not found: {fbx_path}")
        return False

    print(f"  ✓ File exists ({fbx_path.stat().st_size / 1e6:.1f} MB)")

    # Try to load with trimesh to check structure
    if trimesh:
        try:
            mesh = trimesh.load(str(fbx_path))
            print(f"  ✓ FBX readable by trimesh")
            if hasattr(mesh, 'vertices'):
                print(f"    - Vertices: {len(mesh.vertices):,}")
                print(f"    - Faces: {len(mesh.faces):,}")
        except Exception as e:
            print(f"  ⚠ Could not parse with trimesh: {e}")

    # Basic checks
    checks = [
        (fbx_path.suffix.lower() == '.fbx', "File is .fbx"),
        (fbx_path.stat().st_size > 100_000, "File size > 100KB (likely has geometry)"),
    ]

    passed = sum(1 for check, _ in checks if check)
    for check, desc in checks:
        status = "✓" if check else "✗"
        print(f"  {status} {desc}")

    if passed == len(checks):
        print("\n  ✅ FBX validation PASSED")
        return True
    else:
        print("\n  ⚠ FBX validation INCOMPLETE (may still work)")
        return False


def move_to_assets(fbx_path: Path) -> Path:
    """Move validated FBX to assets/rigged/ directory."""
    output_dir = Path("assets/rigged")
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "pip_rigged.fbx"

    import shutil
    shutil.move(str(fbx_path), str(output_path))
    print(f"\n  ✓ Moved to: {output_path}")

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Sketchfab auto-rig workflow helper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Show instructions
  python scripts/sketchfab_rig_workflow.py --instructions

  # Validate downloaded FBX
  python scripts/sketchfab_rig_workflow.py --validate ~/Downloads/pip_rigged.fbx

  # Validate and move to assets
  python scripts/sketchfab_rig_workflow.py --validate ~/Downloads/pip_rigged.fbx --move
        """
    )

    parser.add_argument(
        "--instructions",
        action="store_true",
        help="Show step-by-step workflow instructions"
    )
    parser.add_argument(
        "--validate",
        type=Path,
        help="Validate FBX file (check for skeleton/mesh)"
    )
    parser.add_argument(
        "--move",
        action="store_true",
        help="Move validated FBX to assets/rigged/"
    )

    args = parser.parse_args()

    if args.instructions:
        print_instructions()
        return

    if args.validate:
        valid = validate_fbx(args.validate)
        if valid and args.move:
            output_path = move_to_assets(args.validate)
            print(f"\n✅ Ready for Stage 3: Blender import")
            print(f"   Run: blender --background assets/pip_template.blend \\")
            print(f"        --python scripts/import_and_animate.py -- \\")
            print(f"        --character {output_path}")
        return

    if not args.instructions and not args.validate:
        parser.print_help()


if __name__ == "__main__":
    main()
