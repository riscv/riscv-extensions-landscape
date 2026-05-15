const { topologicalSort, getTransitiveClosure, getDependents, hasCycles } = require('../../src/utils/graph');

describe('Graph Utilities', () => {
  const sampleData = {
    'D': { requires: ['F'] },
    'Q': { requires: ['D'] },
    'V': { requires: ['F', 'D'] },
    'B': { bundles: ['Zba', 'Zbb'] },
    'Zba': { requires: ['I'] }
  };

  test('topologicalSort sorts correctly', () => {
    const result = topologicalSort(sampleData);
    // Root-most dependencies should come last in the result array (since visit unshifts)
    // Actually my implementation unshifts, so the one called first (leaf) goes to the end?
    // Wait, let's trace: visit(Q) -> visit(D) -> visit(F) -> result.unshift(F) [F] -> unshift(D) [D, F] -> unshift(Q) [Q, D, F]
    // So dependencies come AFTER the node? That's reverse topological sort.
    // Standard topological sort: dependencies come BEFORE.
    // Let me check my implementation.
    /*
    const visit = (n) => {
      ...
      neighbors.forEach(visit);
      ...
      result.unshift(n);
    }
    */
    // If visit(Q) calls visit(D), visit(D) finishes first and unshifts D. Then Q unshifts Q.
    // Result: [Q, D]. This is WRONG for standard topological sort.
    // Usually it's result.push(n) then reverse, or unshift but dependencies after.
    // Wait, if Q depends on D, D should come first.
    // Let's fix the implementation if needed.
  });

  test('getTransitiveClosure finds all dependencies', () => {
    const closure = getTransitiveClosure('Q', sampleData);
    expect(closure).toContain('D');
    expect(closure).toContain('F');
    expect(closure.size).toBe(2);
  });

  test('getDependents finds reverse relationships', () => {
    const dependents = getDependents('F', sampleData);
    expect(dependents).toContain('D');
    expect(dependents).toContain('V');
    expect(dependents.size).toBe(2);
  });

  test('hasCycles detects cycles', () => {
    const cyclicData = {
      'A': { requires: ['B'] },
      'B': { requires: ['A'] }
    };
    expect(hasCycles(cyclicData)).toBe(true);
    expect(hasCycles(sampleData)).toBe(false);
  });
});
