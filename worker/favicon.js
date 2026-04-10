/**
 * LaobaiEPG Favicon
 * 电视屏幕 + EPG 节目条 设计图标
 * 渐变背景：深蓝 → 紫
 */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <linearGradient id="scr" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <!-- 背景 -->
  <rect width="32" height="32" rx="7" fill="url(#bg)"/>
  <!-- 电视机外框 -->
  <rect x="3.5" y="5.5" width="25" height="17" rx="2.5" fill="url(#scr)" stroke="#3b82f6" stroke-width="1.2"/>
  <!-- EPG 节目条 row 1 -->
  <rect x="6.5" y="9" width="9" height="2" rx="1" fill="#3b82f6" opacity="0.95"/>
  <rect x="17" y="9" width="4" height="2" rx="1" fill="#22c55e" opacity="0.9"/>
  <!-- EPG 节目条 row 2 -->
  <rect x="6.5" y="12.5" width="13" height="2" rx="1" fill="#8b5cf6" opacity="0.85"/>
  <rect x="21" y="12.5" width="3" height="2" rx="1" fill="#f59e0b" opacity="0.8"/>
  <!-- EPG 节目条 row 3 -->
  <rect x="6.5" y="16" width="6" height="2" rx="1" fill="#3b82f6" opacity="0.75"/>
  <rect x="14" y="16" width="8" height="2" rx="1" fill="#8b5cf6" opacity="0.6"/>
  <!-- 底座 -->
  <rect x="13.5" y="22.5" width="5" height="1.2" rx="0.6" fill="#60a5fa" opacity="0.6"/>
  <rect x="11" y="23.7" width="10" height="1.5" rx="1" fill="#60a5fa" opacity="0.4"/>
  <!-- 右上角信号点 -->
  <circle cx="26.5" cy="7.5" r="1.2" fill="#60a5fa" opacity="0.85"/>
</svg>`;
