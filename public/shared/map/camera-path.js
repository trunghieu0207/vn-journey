// Bản đồ: đường bay camera + đường cong thời gian (hàm thuần, không phụ thuộc trạng thái).

// Đường bay "tối ưu" của van Wijk & Nuij (2003, "Smooth and efficient zooming and panning") — cùng cách
// Mapbox flyTo / d3.interpolateZoom: hai nơi xa nhau thì lùi ra, lia ngang, rồi phóng vào; mắt cảm nhận
// mức phóng theo thang logarit nên nội suy thẳng trông giật. Camera = [tâm x, tâm y, bề rộng nhìn thấy].
export const RHO = Math.SQRT2
export function zoomPath([ux0, uy0, w0], [ux1, uy1, w1]) {
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy
  let at, S
  if (d2 < 1e-12) {
    S = Math.log(w1 / w0) / RHO
    at = t => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(RHO * t * S)]
  } else {
    const d1 = Math.sqrt(d2)
    const b0 = (w1 * w1 - w0 * w0 + RHO ** 4 * d2) / (2 * w0 * RHO ** 2 * d1)
    const b1 = (w1 * w1 - w0 * w0 - RHO ** 4 * d2) / (2 * w1 * RHO ** 2 * d1)
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0)
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1)
    S = (r1 - r0) / RHO
    at = t => {
      const s = t * S
      const u = (w0 / (RHO ** 2 * d1)) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0))
      return [ux0 + u * dx, uy0 + u * dy, (w0 * Math.cosh(r0)) / Math.cosh(RHO * s + r0)]
    }
  }
  at.duration = Math.abs(S) * 1000
  return at
}
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

