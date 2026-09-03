#!/usr/bin/env python3
"""
Repair mesh by merging disconnected components and fixing topology.

Usage:
    python repair_mesh.py input.glb --output output_repaired.glb
"""

import argparse
import sys
from pathlib import Path

try:
    import trimesh
    import numpy as np
except ImportError:
    print("Error: trimesh, numpy required. Run: pip install trimesh numpy")
    sys.exit(1)


def repair_mesh(input_path: Path, output_path: Path):
    """Repair mesh for Mixamo compatibility."""
    print(f"\n🔧 Repairing mesh: {input_path.name}")
    print("-" * 60)

    # Load
    print("  Loading mesh...")
    mesh = trimesh.load(str(input_path))

    if isinstance(mesh, trimesh.Scene):
        print("  Merging scene geometries...")
        meshes = [g for g in mesh.geometry.values()]
        mesh = trimesh.util.concatenate(meshes)

    print(f"  Original: {len(mesh.vertices):,} verts, {len(mesh.faces):,} faces")

    # Fix normals
    print("  Fixing normals...")
    mesh.fix_normals()

    # Merge vertices (close gaps)
    print("  Merging vertices...")
    mesh.merge_vertices()

    # Remove duplicate/degenerate faces
    print("  Removing degenerate faces...")
    mask = mesh.nondegenerate_faces()
    mesh = mesh.submesh([mask], append=True)

    # Fill small holes
    print("  Filling holes...")
    try:
        # This fills boundary holes
        mesh.fill_holes()
    except Exception as e:
        print(f"    (Hole filling not fully supported: {e})")

    # Check connectivity
    components = mesh.split()
    print(f"  Connected components: {len(components)}")

    if len(components) > 1:
        print(f"  Merging {len(components)} components into single mesh...")
        # Find largest component
        largest = max(components, key=lambda x: len(x.faces))
        mesh = largest
        print(f"  Kept largest: {len(mesh.vertices):,} verts, {len(mesh.faces):,} faces")

    # Final cleanup
    print("  Final cleanup...")
    mesh.merge_vertices()
    mesh.remove_unreferenced_vertices()

    print(f"  ✓ Repaired: {len(mesh.vertices):,} verts, {len(mesh.faces):,} faces")

    # Export
    print(f"\n  Exporting to {output_path.name}...")
    mesh.export(str(output_path))

    size_mb = output_path.stat().st_size / 1e6
    print(f"  ✓ Exported ({size_mb:.1f} MB)")

    print("\n" + "=" * 60)
    print("✅ Mesh repaired!")
    print("=" * 60)
    print(f"\nOutput: {output_path}")
    print("\nNext: Upload to Mixamo")
    print(f"  1. Go to mixamo.com")
    print(f"  2. Upload: {output_path.name}")
    print(f"  3. Mark body parts (chin, wrists, knees, groin)")
    print(f"  4. Generate rig")


def main():
    parser = argparse.ArgumentParser(
        description="Repair mesh for Mixamo by merging disconnected parts.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python repair_mesh.py pip_model_v2.glb --output pip_repaired.glb
        """
    )

    parser.add_argument("input", type=Path, help="Input mesh file")
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=None,
        help="Output path (default: input_repaired.glb)"
    )

    args = parser.parse_args()

    input_path = args.input.resolve()
    if not input_path.exists():
        print(f"Error: {input_path} not found")
        sys.exit(1)

    if args.output:
        output_path = args.output.resolve()
    else:
        output_path = input_path.parent / f"{input_path.stem}_repaired.glb"

    try:
        repair_mesh(input_path, output_path)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
