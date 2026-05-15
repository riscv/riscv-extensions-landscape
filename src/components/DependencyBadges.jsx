import React from 'react';

const DependencyBadges = ({ extId, dependencies, onNavigate }) => {
  const depInfo = dependencies[extId];
  if (!depInfo && !Object.values(dependencies).some(d => (d.requires?.includes(extId) || d.bundles?.includes(extId)))) {
    return null;
  }

  const bundles = depInfo?.bundles || [];
  const requires = depInfo?.requires || [];
  
  // Find extensions that bundle this one
  const bundledBy = Object.keys(dependencies).filter(key => 
    dependencies[key].bundles?.includes(extId)
  );

  // Find extensions that require this one
  const requiredBy = Object.keys(dependencies).filter(key => 
    dependencies[key].requires?.includes(extId)
  );

  const BadgeList = ({ title, list, iconColor }) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center gap-1.5">
          <div className={`w-1 h-1 rounded-full ${iconColor}`}></div>
          {title}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {list.map(id => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 border border-slate-700 text-purple-300 hover:border-purple-500/50 hover:bg-slate-700 transition-colors"
            >
              {id}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-800/60">
      <BadgeList title="📦 Bundles" list={bundles} iconColor="bg-blue-400" />
      <BadgeList title="⚙️ Requires" list={requires} iconColor="bg-yellow-400" />
      <BadgeList title="⬆️ Bundled By" list={bundledBy} iconColor="bg-green-400" />
      <BadgeList title="🔗 Required By" list={requiredBy} iconColor="bg-orange-400" />
      
      {depInfo?.description && (
        <div className="mt-2 text-[11px] text-slate-400 italic leading-relaxed">
          {depInfo.description}
        </div>
      )}
    </div>
  );
};

export default DependencyBadges;
