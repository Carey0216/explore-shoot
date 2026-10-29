// Generated from design/jingyu-components.json.
module.exports = {
  "schema": 1,
  "name": "景遇双端组件规范",
  "units": "CSS logical px; native uses px rather than viewport-dependent rpx",
  "size": {
    "control": 40,
    "touch": 44,
    "icon": 20,
    "dockIcon": 22,
    "dockLabel": 11,
    "dockHeight": 64,
    "dockItem": 56,
    "dockCreateWidth": 48,
    "dockCreateHeight": 50,
    "input": 44,
    "chatInput": 36,
    "chatHeader": 40,
    "chatMax": 368,
    "bubbleMax": 0.86
  },
  "space": {
    "1": 4,
    "2": 8,
    "3": 12,
    "4": 16,
    "6": 24
  },
  "radius": {
    "control": 16,
    "panel": 24,
    "bubble": 18
  },
  "type": {
    "body": 14,
    "small": 12,
    "heading": 20,
    "line": 1.55
  },
  "motion": {
    "press": 100,
    "open": 250,
    "close": 150,
    "feedback": 400,
    "stagger": 40,
    "ease": "cubic-bezier(0.22, 1, 0.36, 1)"
  },
  "light": {
    "ground": "#f5f8fa",
    "surface": "#ffffff",
    "ink": "#243846",
    "muted": "#657985",
    "accent": "#366c96",
    "border": "#d8e3ea",
    "selected": "#dfeaf4",
    "danger": "#b94c65"
  },
  "dark": {
    "ground": "#101b24",
    "surface": "#1e2a35",
    "ink": "#e7eef4",
    "muted": "#a6b7c4",
    "accent": "#b8d8f4",
    "border": "#405260",
    "selected": "#2a4051",
    "danger": "#f4a6b6"
  },
  "layers": {
    "content": 0,
    "dock": 8000,
    "modal": 9000,
    "live": 10005
  },
  "contracts": [
    "circle controls keep a 1:1 ratio and at least 44px touch area",
    "icons use one optical box with round caps and joins",
    "split Dock silhouette and white create plus remain",
    "dialogs scroll internally; no hidden actionable controls",
    "text fields retain input while keyboard reduces viewport",
    "short messages hug content with opposite-side breathing room"
  ],
  "variables": {
    "--jy-control-size": "40px",
    "--jy-control-touch": "44px",
    "--jy-icon-size": "20px",
    "--jy-control": "40px",
    "--jy-touch": "44px",
    "--jy-icon": "20px",
    "--jy-dock-icon": "22px",
    "--jy-dock-label": "11px",
    "--jy-dock-height": "64px",
    "--jy-dock-item": "56px",
    "--jy-dock-create-width": "48px",
    "--jy-dock-create-height": "50px",
    "--jy-input": "44px",
    "--jy-chat-input": "36px",
    "--jy-chat-header": "40px",
    "--jy-chat-max": "368px",
    "--jy-bubble-max": "86%",
    "--jy-space-1": "4px",
    "--jy-space-2": "8px",
    "--jy-space-3": "12px",
    "--jy-space-4": "16px",
    "--jy-space-6": "24px",
    "--jy-radius-control": "16px",
    "--jy-radius-panel": "24px",
    "--jy-radius-bubble": "18px",
    "--jy-type-body": "14px",
    "--jy-type-small": "12px",
    "--jy-type-heading": "20px",
    "--jy-type-line": "1.55",
    "--jy-motion-press": "100ms",
    "--jy-motion-open": "250ms",
    "--jy-motion-close": "150ms",
    "--jy-motion-feedback": "400ms",
    "--jy-motion-stagger": "40ms",
    "--jy-motion-ease": "cubic-bezier(0.22, 1, 0.36, 1)",
    "--jy-layer-content": "0",
    "--jy-layer-dock": "8000",
    "--jy-layer-modal": "9000",
    "--jy-layer-live": "10005"
  }
};
