/**
 * Dependency invariants that a passing `lint + build + test` run would
 * otherwise miss.
 *
 * `react` and `react-dom` must resolve to the SAME version: React 19
 * refuses to render a mismatched pair (error #527) at runtime only, so a
 * drifted lockfile type-checks, builds and passes every unit test while
 * shipping a blank page. That is exactly what happened when `react` moved
 * to 19.2.8 while the `react-dom` range still resolved 19.2.3.
 */
import { describe, expect, it } from 'vitest';
import { version as reactVersion } from 'react';
import { version as reactDomVersion } from 'react-dom';

describe('installed dependencies', () => {
  it('resolves react and react-dom to the same version', () => {
    expect(reactDomVersion).toBe(reactVersion);
  });
});
