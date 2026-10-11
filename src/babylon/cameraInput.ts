import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** Ground-plane grab-pan for a left-handed ArcRotateCamera.
 * Moving the pointer right/down moves the visible map right/down, therefore
 * the camera target must move in the opposite projected direction.
 */
export function groundPanDelta(
  dx: number, dy: number, alpha: number, beta: number, worldUnitsPerPixel: number,
): Vector3 {
  // Limit amplification near the horizon, matching the view's existing input.
  const vertical = dy / Math.max(0.25, Math.cos(beta));
  return new Vector3(
    Math.sin(alpha) * dx - Math.cos(alpha) * vertical,
    0,
    -Math.cos(alpha) * dx - Math.sin(alpha) * vertical,
  ).scale(worldUnitsPerPixel);
}
