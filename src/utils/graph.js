/**
 * Graph utilities for RISC-V extension dependency analysis.
 */

/**
 * Performs a topological sort on the extension dependency graph.
 * @param {Object} data - The dependency data (key: extId, value: {requires, bundles}).
 * @returns {string[]} Ordered list of extension IDs.
 */
const topologicalSort = (data) => {
  const result = [];
  const visited = new Set();
  const temporary = new Set();

  const visit = (id) => {
    if (temporary.has(id)) {
      throw new Error(`Circular dependency detected involving ${id}`);
    }
    if (!visited.has(id)) {
      temporary.add(id);
      const depInfo = data[id];
      if (depInfo) {
        const neighbors = [...(depInfo.requires || []), ...(depInfo.bundles || [])];
        neighbors.forEach(visit);
      }
      temporary.delete(id);
      visited.add(id);
      result.unshift(id);
    }
  };

  Object.keys(data).forEach(visit);
  return result;
};

/**
 * Returns the set of all transitive dependencies for a given extension.
 * @param {string} startId - The extension ID to start from.
 * @param {Object} data - The dependency data.
 * @returns {Set<string>} Set of all required/bundled extensions.
 */
const getTransitiveClosure = (startId, data) => {
  const result = new Set();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift();
    const depInfo = data[id];
    if (depInfo) {
      const neighbors = [...(depInfo.requires || []), ...(depInfo.bundles || [])];
      neighbors.forEach(dep => {
        if (!result.has(dep)) {
          result.add(dep);
          queue.push(dep);
        }
      });
    }
  }

  return result;
};

/**
 * Finds all extensions that bundle or require the given extension.
 * @param {string} id - The extension ID.
 * @param {Object} data - The dependency data.
 * @returns {Set<string>} Set of extensions that depend on this one.
 */
const getDependents = (id, data) => {
  const result = new Set();
  Object.keys(data).forEach(parent => {
    const deps = [...(data[parent].requires || []), ...(data[parent].bundles || [])];
    if (deps.includes(id)) {
      result.add(parent);
    }
  });
  return result;
};

/**
 * Detects if there are any cycles in the dependency graph.
 * @param {Object} data - The dependency data.
 * @returns {boolean} True if a cycle exists.
 */
const hasCycles = (data) => {
  try {
    topologicalSort(data);
    return false;
  } catch (e) {
    return true;
  }
};

module.exports = {
  topologicalSort,
  getTransitiveClosure,
  getDependents,
  hasCycles,
};
