import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { CHANGELOG, changesSince, compareVersions } from '../changelog';

describe('Changelog', () => {
  it('has an entry for the current version at the top', () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
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
    expect(changesSince('1.0.0').map((e) => e.version)).toEqual(['1.5.0', '1.4.1', '1.4.0', '1.3.1', '1.3.0', '1.2.0', '1.1.0']);
    expect(changesSince(pkg.version)).toEqual([]);
  });
});
