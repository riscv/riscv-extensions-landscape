import React, { useMemo } from 'react';
import { topologicalSort, getTransitiveClosure } from '../utils/graph';

const DependencyGraph = ({ data, onSelectExtension }) => {
  const sortedIds = useMemo(() => {
    try {
      return topologicalSort(data.dependencies);
    } catch (e) {
      return Object.keys(data.dependencies);
    }
  }, [data]);

  // Calculate levels (distance from roots)
  const levels = useMemo(() => {
    const lvlMap = {};
    const adj = new Map();
    const reverseAdj = new Map();
    
    Object.keys(data.dependencies).forEach(id => {
      const deps = [...(data.dependencies[id].requires || []), ...(data.dependencies[id].bundles || [])];
      adj.set(id, deps);
      deps.forEach(dep => {
        if (!reverseAdj.has(dep)) reverseAdj.set(dep, []);
        reverseAdj.get(dep).push(id);
      });
    });

    const computeLevel = (id) => {
      if (lvlMap[id] !== undefined) return lvlMap[id];
      const dependents = reverseAdj.get(id) || [];
      if (dependents.length === 0) {
        lvlMap[id] = 0;
        return 0;
      }
      const maxDepLevel = Math.max(...dependents.map(computeLevel));
      lvlMap[id] = maxDepLevel + 1;
      return lvlMap[id];
    };

    sortedIds.forEach(computeLevel);
    return lvlMap;
  }, [data, sortedIds]);

  const nodesByLevel = useMemo(() => {
    const result = {};
    Object.entries(levels).forEach(([id, lvl]) => {
      if (!result[lvl]) result[lvl] = [];
      result[lvl].push(id);
    });
    return result;
  }, [levels]);

  const nodePositions = useMemo(() => {
    const pos = {};
    const LEVEL_HEIGHT = 120;
    const NODE_WIDTH = 120;
    const GAP_X = 40;

    Object.entries(nodesByLevel).forEach(([lvl, ids]) => {
      const y = parseInt(lvl) * LEVEL_HEIGHT + 60;
      const totalWidth = ids.length * (NODE_WIDTH + GAP_X) - GAP_X;
      const startX = (800 - totalWidth) / 2;

      ids.forEach((id, i) => {
        pos[id] = {
          x: startX + i * (NODE_WIDTH + GAP_X) + NODE_WIDTH / 2,
          y: y
        };
      });
    });
    return pos;
  }, [nodesByLevel]);

  const edges = useMemo(() => {
    const result = [];
    Object.keys(data.dependencies).forEach(id => {
      const deps = data.dependencies[id].requires || [];
      const bundles = data.dependencies[id].bundles || [];
      
      deps.forEach(dep => {
        if (nodePositions[id] && nodePositions[dep]) {
          result.push({ from: id, to: dep, type: 'requires' });
        }
      });
      
      bundles.forEach(dep => {
        if (nodePositions[id] && nodePositions[dep]) {
          result.push({ from: id, to: dep, type: 'bundles' });
        }
      });
    });
    return result;
  }, [data, nodePositions]);

  return (
    <div className="w-full h-[600px] bg-slate-900 overflow-auto border border-slate-700 rounded-lg p-4">
      <svg width="800" height={Object.keys(nodesByLevel).length * 120 + 100} viewBox="0 0 800 1000">
        <defs>
          <marker id="arrowhead-req" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#fbbf24" />
          </marker>
          <marker id="arrowhead-bun" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const fromPos = nodePositions[edge.from];
          const toPos = nodePositions[edge.to];
          const color = edge.type === 'requires' ? '#fbbf24' : '#60a5fa';
          return (
            <line
              key={i}
              x1={fromPos.x}
              y1={fromPos.y}
              x2={toPos.x}
              y2={toPos.y}
              stroke={color}
              strokeWidth="2"
              strokeDasharray={edge.type === 'requires' ? '5,5' : '0'}
              markerEnd={`url(#arrowhead-${edge.type.substring(0, 3)})`}
              opacity="0.6"
            />
          );
        })}

        {/* Nodes */}
        {Object.entries(nodePositions).map(([id, pos]) => (
          <g 
            key={id} 
            transform={`translate(${pos.x - 45}, ${pos.y - 20})`}
            className="cursor-pointer group"
            onClick={() => onSelectExtension(id)}
          >
            <rect
              width="90"
              height="40"
              rx="6"
              fill="#1e293b"
              stroke="#475569"
              strokeWidth="2"
              className="group-hover:stroke-purple-500 transition-colors"
            />
            <text
              x="45"
              y="25"
              textAnchor="middle"
              fill="#f1f5f9"
              fontSize="14"
              fontWeight="bold"
              className="pointer-events-none"
            >
              {id}
            </text>
          </g>
        ))}
      </svg>
      
      {/* Legend */}
      <div className="absolute bottom-6 right-10 bg-slate-800/90 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-blue-400"></div>
            <span className="text-xs text-slate-300">Bundles</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-yellow-400 border-t border-dashed"></div>
            <span className="text-xs text-slate-300">Requires</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DependencyGraph;
