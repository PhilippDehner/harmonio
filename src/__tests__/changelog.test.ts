import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { CHANGELOG, changesSince, compareVersions, MAX_SHOWN_RELEASES } from '../changelog';

describe('Changelog', () => {
  it('has no entry newer than the current version', () => {
    expect(compareVersions(CHANGELOG[0].version, pkg.version)).toBeLessThanOrEqual(0);
  });
  it('is sorted newest first', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
  });
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1', '1.1.0')).toBe(0);
  });
  it('returns the entries since a version', () => {
    expect(changesSince('1.2.0').map((e) => e.version)).toEqual(['1.5.1', '1.5.0', '1.4.0']);
    expect(changesSince('1.3.0').map((e) => e.version)).toEqual(['1.5.1', '1.5.0', '1.4.0']);
    expect(changesSince(pkg.version)).toEqual([]);
  });
  it('shows at most the last 3 releases', () => {
    expect(changesSince(null).map((e) => e.version)).toEqual(['1.5.1', '1.5.0', '1.4.0']);
    expect(changesSince('1.0.0')).toHaveLength(MAX_SHOWN_RELEASES);
  });
});
