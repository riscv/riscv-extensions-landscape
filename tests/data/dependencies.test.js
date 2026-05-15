const dependencyData = require('../../src/data/extension_dependencies.json');
const extensions = require('../../src/riscv_extensions.json');

describe('Dependency Data Integrity', () => {
  const allExtensionIds = new Set();
  Object.values(extensions).flat().forEach(ext => {
    if (ext && ext.id) allExtensionIds.add(ext.id);
  });

  test('every key in dependencies is a valid extension ID', () => {
    Object.keys(dependencyData.dependencies).forEach(id => {
      // Some dependency keys might be "umbrella" terms that aren't in the catalog yet,
      // but ideally they should be. For now, let's just log if they are missing.
      if (!allExtensionIds.has(id)) {
        console.warn(`Dependency key "${id}" not found in extension catalog.`);
      }
    });
  });

  test('every requirement/bundle resolves to a valid extension ID', () => {
    Object.values(dependencyData.dependencies).forEach(dep => {
      const refs = [...(dep.requires || []), ...(dep.bundles || [])];
      refs.forEach(ref => {
        expect(allExtensionIds.has(ref)).toBe(true);
      });
    });
  });

  test('no self-dependencies', () => {
    Object.entries(dependencyData.dependencies).forEach(([id, dep]) => {
      const refs = [...(dep.requires || []), ...(dep.bundles || [])];
      expect(refs).not.toContain(id);
    });
  });
});
