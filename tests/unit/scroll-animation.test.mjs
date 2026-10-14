import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateScrollProgress,
  mapProgressToTransform,
  attachFooterScrollDriver,
} from '../../packages/core/src/scrollAnimation.js';

test('mapProgressToTransform produces exact required bounds and interpolations', () => {
  // At progress = 0: translateY(35%) scale(0.7) opacity: 0.2
  const atZero = mapProgressToTransform(0);
  assert.equal(atZero.progress, 0);
  assert.equal(atZero.translateYPercent, 35);
  assert.equal(atZero.scale, 0.7);
  assert.equal(atZero.opacity, 0.2);
  assert.match(atZero.transform, /translateY\(35\.000%\) scale\(0\.7000\)/);
  assert.equal(atZero.opacityStr, '0.2000');

  // At progress = 1: translateY(0%) scale(1.0) opacity: 1.0
  const atOne = mapProgressToTransform(1);
  assert.equal(atOne.progress, 1);
  assert.equal(atOne.translateYPercent, 0);
  assert.equal(atOne.scale, 1);
  assert.equal(atOne.opacity, 1);
  assert.match(atOne.transform, /translateY\(0\.000%\) scale\(1\.0000\)/);
  assert.equal(atOne.opacityStr, '1.0000');

  // At progress = 0.5: translateY(17.5%) scale(0.85) opacity: 0.6
  const atHalf = mapProgressToTransform(0.5);
  assert.equal(atHalf.progress, 0.5);
  assert.equal(atHalf.translateYPercent, 17.5);
  assert.equal(atHalf.scale, 0.85);
  assert.ok(Math.abs(atHalf.opacity - 0.6) < 1e-9);
  assert.match(atHalf.transform, /translateY\(17\.500%\) scale\(0\.8500\)/);
  assert.equal(atHalf.opacityStr, '0.6000');

  // Clamps negative progress to 0
  const under = mapProgressToTransform(-0.25);
  assert.equal(under.progress, 0);
  assert.equal(under.scale, 0.7);
  assert.equal(under.opacity, 0.2);

  // Clamps overshoot progress to 1
  const over = mapProgressToTransform(1.5);
  assert.equal(over.progress, 1);
  assert.equal(over.scale, 1);
  assert.equal(over.opacity, 1);
});

test('calculateScrollProgress normalizes scroll between viewport entry and bottom', () => {
  // Scenario: viewport height = 1000, document height = 3000, maxScroll = 2000
  // Footer is at bottom: top = 2700, height = 300
  // Footer enters viewport when scroll reaches: 2700 - 1000 = 1700
  const baseMetrics = {
    viewportHeight: 1000,
    docHeight: 3000,
  };

  // Case 1: Above entry (scrollY = 1200) -> progress = 0
  assert.equal(
    calculateScrollProgress(null, {
      ...baseMetrics,
      scrollY: 1200,
      rectTop: 1500, // 1500 + 1200 = 2700
    }),
    0
  );

  // Case 2: Exact entry (scrollY = 1700) -> progress = 0
  assert.equal(
    calculateScrollProgress(null, {
      ...baseMetrics,
      scrollY: 1700,
      rectTop: 1000, // 1000 + 1700 = 2700
    }),
    0
  );

  // Case 3: Halfway between entry (1700) and bottom (2000) -> scrollY = 1850 -> progress = 0.5
  assert.equal(
    calculateScrollProgress(null, {
      ...baseMetrics,
      scrollY: 1850,
      rectTop: 850, // 850 + 1850 = 2700
    }),
    0.5
  );

  // Case 4: Reached page bottom (scrollY = 2000) -> progress = 1
  assert.equal(
    calculateScrollProgress(null, {
      ...baseMetrics,
      scrollY: 2000,
      rectTop: 700, // 700 + 2000 = 2700
    }),
    1
  );

  // Case 5: Overscroll (scrollY = 2100) -> clamped to 1
  assert.equal(
    calculateScrollProgress(null, {
      ...baseMetrics,
      scrollY: 2100,
      rectTop: 600,
    }),
    1
  );
});

test('calculateScrollProgress handles edge cases: non-scrollable and short pages', () => {
  // Non-scrollable page (docHeight = 700, viewport = 800) -> already at bottom
  assert.equal(
    calculateScrollProgress(null, {
      viewportHeight: 800,
      docHeight: 700,
      scrollY: 0,
      rectTop: 500,
    }),
    1
  );

  // Subpixel rounding at bottom (maxScroll = 1500, scrollY = 1499.5) -> treated as 1
  assert.equal(
    calculateScrollProgress(null, {
      viewportHeight: 800,
      docHeight: 2300,
      scrollY: 1499.5,
      rectTop: 600,
    }),
    1
  );

  // Short scrollable page where footer is already partially in viewport at scrollY = 0
  assert.equal(
    calculateScrollProgress(null, {
      viewportHeight: 1000,
      docHeight: 1200,
      scrollY: 0,
      rectTop: 900,
    }),
    0
  );
  assert.equal(
    calculateScrollProgress(null, {
      viewportHeight: 1000,
      docHeight: 1200,
      scrollY: 100,
      rectTop: 800,
    }),
    0.5
  );
  assert.equal(
    calculateScrollProgress(null, {
      viewportHeight: 1000,
      docHeight: 1200,
      scrollY: 200,
      rectTop: 700,
    }),
    1
  );
});

test('attachFooterScrollDriver lifecycle and teardown safety', () => {
  // Null container returns safe no-op methods
  const noop = attachFooterScrollDriver(null, null);
  assert.equal(typeof noop.destroy, 'function');
  assert.equal(typeof noop.update, 'function');
  noop.destroy();

  // Mock DOM elements
  const container = {
    getBoundingClientRect: () => ({ top: 1000 }),
    firstElementChild: null,
  };
  const target = {
    style: {},
  };

  let progressReceived = null;
  const driver = attachFooterScrollDriver(container, target, {
    respectReducedMotion: false,
    onProgress: (p) => { progressReceived = p; },
  });

  assert.equal(typeof driver.destroy, 'function');
  assert.equal(typeof driver.update, 'function');

  // Clean teardown without errors
  driver.destroy();
  driver.destroy();
});
