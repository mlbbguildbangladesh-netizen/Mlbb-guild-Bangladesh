const fs = require('fs');
const file = 'src/pages/Admin.tsx';
let content = fs.readFileSync(file, 'utf8');

const resetTabCode = `
        {activeTab === 'reset' && (
          <motion.div
            key="reset"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl mx-auto space-y-6"
          >
            <div className="glass-card p-8 border border-neon-red/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-neon-red/10 blur-3xl rounded-full" />
              
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-neon-red/10 rounded-2xl relative">
                  <AlertTriangle className="text-neon-red relative z-10" size={32} />
                  <div className="absolute inset-0 bg-neon-red blur-xl opacity-50 z-0 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-neon-red tracking-tight uppercase">Terminal Reset</h2>
                  <p className="text-gray-400 font-bold text-sm">Select exactly what data to <span className="text-neon-green">KEEP</span>. Everything else will be instantly destroyed.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-4 border border-neon-red/20 bg-neon-red/5 rounded-xl">
                  <p className="text-neon-red text-sm font-bold uppercase flex items-center gap-2">
                    <AlertTriangle size={16} /> 
                    Warning: Read Carefully
                  </p>
                  <p className="text-gray-400 text-xs mt-2">
                    Check the boxes below for the sections you want to <span className="text-white font-black">PRESERVE</span>. We will <span className="text-neon-red font-black">DELETE</span> the data for any un-checked section.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CLEARABLE_SECTIONS.map((section) => {
                    const isKept = sectionsToKeep.includes(section.id);
                    return (
                      <div 
                        key={section.id}
                        onClick={() => {
                          setSectionsToKeep(prev => 
                            isKept ? prev.filter(id => id !== section.id) : [...prev, section.id]
                          );
                        }}
                        className={\`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between \${
                          isKept 
                            ? 'bg-neon-green/10 border-neon-green/50' 
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }\`}
                      >
                        <div>
                          <p className={\`font-black text-sm \${isKept ? 'text-neon-green' : 'text-white'}\`}>{section.name}</p>
                          <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold mt-1 max-w-[200px] truncate">{section.desc}</p>
                        </div>
                        <div className={\`w-6 h-6 rounded flex items-center justify-center \${isKept ? 'bg-neon-green text-black' : 'bg-white/10 text-white/20'}\`}>
                          {isKept && <Check size={16} strokeWidth={4} />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isSiteResetting && siteResetProgress && (
                  <div className="flex flex-col items-center justify-center p-6 bg-black/50 rounded-xl border border-neon-red/30">
                    <Loader2 className="animate-spin text-neon-red mb-2" size={32} />
                    <p className="text-xs uppercase tracking-widest font-bold font-mono text-neon-red">{siteResetProgress}</p>
                  </div>
                )}

                <button
                  onClick={handleSiteReset}
                  disabled={isSiteResetting || CLEARABLE_SECTIONS.length === sectionsToKeep.length}
                  className="w-full mt-6 py-4 bg-neon-red/20 hover:bg-neon-red border border-neon-red text-white hover:text-black hover:shadow-[0_0_30px_rgba(255,0,0,0.5)] transition-all rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <AlertTriangle className="group-hover:animate-ping" size={18} />
                  Initiate Site Reset
                </button>
              </div>
            </div>
          </motion.div>
        )}
`;

const targetIndex = content.indexOf('          </AnimatePresence>\n        </div>\n      </div>\n\n      {/* Reset Confirmation Modal */}');
if (targetIndex !== -1 && !content.includes(`activeTab === 'reset'`)) {
  content = content.slice(0, targetIndex) + resetTabCode + content.slice(targetIndex);
}

fs.writeFileSync(file, content);
console.log("Done");
