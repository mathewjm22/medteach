
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { StudentLevel, CaseEntry, TabType, TeachingPoint } from './types';
import { getTeachingPoints, assessDifferentials } from './geminiService';

const SHORTCUTS = {
  [TabType.LABS]: ['CBC', 'CMP', 'LFTs', 'UA', 'BCx', 'Trop'],
  [TabType.DIAGNOSTICS]: ['CXR', 'CT Chest', 'EKG', 'US', 'CTPA', 'TTE'],
  [TabType.TREATMENT]: ['Abx', 'Pain Meds', 'IV Fluids', 'Steroids', 'Anticoagulation', 'PPI']
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>(TabType.LABS);
  const [caseText, setCaseText] = useState<string>('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [isCaseLoaded, setIsCaseLoaded] = useState(false);
  
  const [differentials, setDifferentials] = useState<CaseEntry[]>([]);
  const [labs, setLabs] = useState<CaseEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<CaseEntry[]>([]);
  const [treatments, setTreatments] = useState<CaseEntry[]>([]);
  
  const [reviewMode, setReviewMode] = useState(false);
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [teachingPoints, setTeachingPoints] = useState<TeachingPoint[]>([]);
  const [studentLevel, setStudentLevel] = useState<StudentLevel>('MS-3');
  const [loadingPoints, setLoadingPoints] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleCaseUpload = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCaseText(e.target.value);
  };

  const startCase = () => {
    if (!caseText.trim()) return;

    // Logic to chunk text: split by paragraphs, then ensure each chunk is roughly 4-5 sentences
    const paragraphs = caseText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const resultChunks: string[] = [];

    paragraphs.forEach(para => {
      // Basic sentence splitting (look for periods, exclamation, or question marks followed by space/newline)
      const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [para];
      
      for (let i = 0; i < sentences.length; i += 5) {
        resultChunks.push(sentences.slice(i, i + 5).join('').trim());
      }
    });

    setChunks(resultChunks);
    setVisibleIndex(1);
    setIsCaseLoaded(true);
    setReviewMode(false);
    setDifferentials([]);
    setLabs([]);
    setDiagnostics([]);
    setTreatments([]);
    setFinalDiagnosis('');
    setTeachingPoints([]);
  };

  const nextParagraph = () => {
    if (visibleIndex < chunks.length) {
      setVisibleIndex(prev => prev + 1);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  };

  const addEntry = (listSetter: React.Dispatch<React.SetStateAction<CaseEntry[]>>, value: string) => {
    if (!value.trim()) return;
    listSetter(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), text: value.trim() }]);
  };

  const onDragEnd = (result: DropResult, list: CaseEntry[], setList: React.Dispatch<React.SetStateAction<CaseEntry[]>>) => {
    if (!result.destination) return;
    const items = Array.from(list);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setList(items);
  };

  const extractFinalDiagnosis = (text: string): string => {
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      const match = line.match(/Final Diagnosis[:\s]+([^\n]+)/i);
      if (match) return match[1].trim();
    }
    return '';
  };

  const handleReview = () => {
    const extracted = extractFinalDiagnosis(caseText);
    setFinalDiagnosis(extracted);
    setReviewMode(true);
  };

  const fetchTeaching = useCallback(async () => {
    if (!finalDiagnosis) return;
    setLoadingPoints(true);
    try {
      const [points, scores] = await Promise.all([
        getTeachingPoints(finalDiagnosis, studentLevel),
        differentials.length > 0 ? assessDifferentials(finalDiagnosis, differentials.map(d => d.text)) : Promise.resolve([])
      ]);
      
      setTeachingPoints(points);
      
      if (differentials.length > 0) {
        setDifferentials(prev => prev.map((d, i) => ({ ...d, relevanceScore: scores[i] || 0 })));
      }
    } catch (err) {
      console.error("Error fetching review data:", err);
    } finally {
      setLoadingPoints(false);
    }
  }, [finalDiagnosis, studentLevel, differentials]);

  useEffect(() => {
    if (reviewMode && finalDiagnosis) {
      fetchTeaching();
    }
  }, [studentLevel, reviewMode, finalDiagnosis]);

  const reset = () => {
    setIsCaseLoaded(false);
    setReviewMode(false);
    setCaseText('');
    setFinalDiagnosis('');
    setTeachingPoints([]);
  };

  const ListManager = ({ 
    title, 
    items, 
    setItems, 
    shortcuts, 
    placeholder,
    showScore = false
  }: { 
    title: string, 
    items: CaseEntry[], 
    setItems: React.Dispatch<React.SetStateAction<CaseEntry[]>>,
    shortcuts?: string[],
    placeholder: string,
    showScore?: boolean
  }) => {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        addEntry(setItems, inputValue);
        setInputValue('');
      }
    };

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 flex flex-col h-full overflow-hidden">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          {title}
        </h3>
        
        <div className="flex flex-col gap-2 mb-3">
          <input
            type="text"
            className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-slate-400"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {shortcuts && (
            <div className="flex flex-wrap gap-1">
              {shortcuts.map(s => (
                <button
                  key={s}
                  onClick={() => addEntry(setItems, s)}
                  className="px-2 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors font-bold uppercase"
                >
                  +{s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <DragDropContext onDragEnd={(res) => onDragEnd(res, items, setItems)}>
            <Droppable droppableId={`list-${title}`}>
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {items.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`group flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-blue-300 transition-all ${snapshot.isDragging ? 'shadow-lg border-blue-500 z-50 scale-105' : ''}`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="text-xs font-mono text-slate-400">{index + 1}</span>
                            <span className="text-sm text-slate-700 font-medium truncate">{item.text}</span>
                          </div>
                          {showScore && item.relevanceScore !== undefined && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.relevanceScore > 70 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {item.relevanceScore}% match
                            </span>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {items.length === 0 && (
                    <div className="text-center py-8 text-slate-300 text-xs italic">
                      No entries yet
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    );
  };

  if (!isCaseLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <i className="fas fa-stethoscope text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">MedTeach Dashboard</h1>
              <p className="text-slate-500">Prepare a new patient case for rounding</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Paste Case Report Text</label>
              <div className="relative group">
                <textarea
                  className="w-full h-80 p-6 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all resize-none text-base leading-relaxed text-slate-700 shadow-inner bg-slate-50/50 hover:bg-white"
                  placeholder="Paste clinical narrative here. Include 'Final Diagnosis: [Disease]' at the very end. The system will auto-chunk long text for better teaching flow."
                  value={caseText}
                  onChange={handleCaseUpload}
                />
              </div>
            </div>
            
            <button
              onClick={startCase}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
              disabled={!caseText.trim()}
            >
              <i className="fas fa-play"></i> Launch Case Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden font-sans">
      <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner">
            <i className="fas fa-user-md text-white text-lg"></i>
          </div>
          <div>
            <span className="font-black text-slate-800 tracking-tight block leading-none">MedTeach</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Clinical Dashboard</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest"
          >
            New Case
          </button>
          {!reviewMode && (
            <button
              onClick={handleReview}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-md transition-all flex items-center gap-2 hover:translate-y-[-1px] active:translate-y-[1px]"
            >
              <i className="fas fa-flag-checkered"></i> Reveal Final Review
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Column: Progressive Case disclosure */}
        <div className="w-1/2 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden ring-1 ring-black/5">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-slate-700 uppercase text-xs tracking-widest flex items-center gap-2">
              <i className="fas fa-file-medical-alt text-blue-500"></i> Clinical Evidence
            </h2>
            <div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              {visibleIndex} / {chunks.length} Parts
            </div>
          </div>
          
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 bg-white selection:bg-blue-100">
            {chunks.slice(0, visibleIndex).map((para, i) => (
              <div 
                key={i} 
                className={`p-6 rounded-2xl text-slate-800 leading-relaxed text-xl border-2 transition-all duration-700 animate-in fade-in slide-in-from-bottom-6 ${
                  i === visibleIndex - 1 ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-slate-50 opacity-80'
                }`}
              >
                {para}
              </div>
            ))}
            
            {!reviewMode && visibleIndex < chunks.length && (
              <div className="flex justify-center pt-8 pb-12">
                <button 
                  onClick={nextParagraph}
                  className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all ring-4 ring-blue-50 group"
                  title="Show next 4-5 sentences"
                >
                  <i className="fas fa-arrow-down text-xl group-hover:translate-y-1 transition-transform"></i>
                </button>
              </div>
            )}

            {visibleIndex === chunks.length && !reviewMode && (
              <div className="text-center py-12">
                <div className="inline-flex items-center gap-3 px-6 py-3 bg-green-50 text-green-700 rounded-2xl text-sm font-black border-2 border-green-200 shadow-sm">
                  <i className="fas fa-check-double"></i> CLINICAL PRESENTATION COMPLETE
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Thought process and orders */}
        <div className="w-1/2 flex flex-col gap-6 overflow-hidden">
          {reviewMode ? (
            <div className="flex-1 overflow-y-auto space-y-6 animate-in fade-in slide-in-from-right-8 duration-700 pr-2 pb-6">
              <div className="bg-white rounded-2xl shadow-xl border border-indigo-200 p-8 ring-1 ring-black/5">
                <div className="flex justify-between items-start mb-8">
                  <h2 className="text-3xl font-black text-indigo-900 flex items-center gap-3">
                    <i className="fas fa-certificate text-yellow-500"></i> Post-Case Analysis
                  </h2>
                  <div className="text-right">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Tailor Teaching For</label>
                    <select 
                      className="text-xs font-black bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl border-2 border-indigo-100 outline-none cursor-pointer hover:border-indigo-300 transition-all shadow-sm"
                      value={studentLevel}
                      onChange={(e) => setStudentLevel(e.target.value as StudentLevel)}
                    >
                      <option>MS-1</option>
                      <option>MS-2</option>
                      <option>MS-3</option>
                      <option>MS-4</option>
                      <option>Intern (PGY-1)</option>
                    </select>
                  </div>
                </div>
                
                <div className="mb-8 p-8 bg-indigo-900 rounded-3xl border-4 border-indigo-100 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                  <label className="block text-xs font-black text-indigo-200 uppercase mb-3 tracking-widest">Final Confirmed Diagnosis</label>
                  <div className="text-3xl font-black text-white drop-shadow-md">
                    {finalDiagnosis || "Consult Attending (Diagnosis Not Found)"}
                  </div>
                </div>

                <div className="space-y-8 mb-10">
                  <section>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4 border-b-2 border-slate-50 pb-2">Student Differential Ranking</h3>
                    <div className="space-y-3">
                      {differentials.length > 0 ? differentials.map((d, i) => (
                        <div key={d.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-4">
                            <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">{i + 1}</span>
                            <span className="text-base font-bold text-slate-700">{d.text}</span>
                          </div>
                          {d.relevanceScore !== undefined && (
                            <div className="flex flex-col items-end">
                              <span className={`text-[11px] font-black px-3 py-1 rounded-xl shadow-sm border ${d.relevanceScore > 75 ? 'bg-green-500 text-white border-green-400' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                {d.relevanceScore}% Match
                              </span>
                            </div>
                          )}
                        </div>
                      )) : <div className="text-sm text-slate-400 italic bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-200 text-center">No differentials were submitted during rounding</div>}
                    </div>
                  </section>

                  <div className="grid grid-cols-2 gap-8">
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div> Workup Ordered
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {[...labs, ...diagnostics].length > 0 ? [...labs, ...diagnostics].map(t => (
                          <span key={t.id} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 shadow-sm">{t.text}</span>
                        )) : <span className="text-xs text-slate-400 italic">None ordered</span>}
                      </div>
                    </section>
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div> Management Plan
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {treatments.length > 0 ? treatments.map(t => (
                          <span key={t.id} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-100 shadow-sm">{t.text}</span>
                        )) : <span className="text-xs text-slate-400 italic">No treatment initiated</span>}
                      </div>
                    </section>
                  </div>
                </div>

                <div className="mb-10">
                  <h3 className="font-black text-xl text-slate-800 flex items-center gap-3 mb-6">
                    <i className="fas fa-lightbulb text-amber-500"></i> AI High-Yield Learning
                  </h3>
                  
                  {loadingPoints ? (
                    <div className="space-y-6">
                      {[1,2,3].map(i => (
                        <div key={i} className="flex gap-4 items-start">
                          <div className="w-24 h-24 bg-slate-100 rounded-2xl animate-pulse"></div>
                          <div className="flex-1 space-y-3">
                            <div className="h-5 bg-slate-100 rounded-lg w-1/3 animate-pulse"></div>
                            <div className="h-16 bg-slate-100 rounded-lg animate-pulse"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : teachingPoints.length > 0 ? (
                    <div className="space-y-6">
                      {teachingPoints.map((point, idx) => (
                        <div key={idx} className="group p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all flex gap-6 relative overflow-hidden">
                          <div className="flex-1 relative z-10">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-black text-slate-800 text-lg leading-tight">{point.title}</h4>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed mb-3">{point.description}</p>
                            <span className="inline-block text-[9px] bg-slate-900 text-white px-3 py-1 rounded-full font-black uppercase tracking-tighter">{point.level}</span>
                          </div>
                          {point.imageUrl && (
                            <div className="w-28 h-28 shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-inner ring-4 ring-slate-50 relative z-10">
                              <img 
                                src={`https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=150&q=80&sig=${idx}`} 
                                alt="medical imagery placeholder" 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90 group-hover:opacity-100"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-10 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                      <i className="fas fa-brain text-slate-200 text-5xl mb-4"></i>
                      <p className="text-slate-400 font-bold">Analysis in progress based on final diagnosis...</p>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={reset}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-3 hover:translate-y-[-2px]"
                >
                  <i className="fas fa-plus-circle"></i> ROUND ON NEW PATIENT
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Rounds: Differentials */}
              <div className="h-1/2 flex flex-col min-h-0">
                <ListManager
                  title="Differential Ranking"
                  items={differentials}
                  setItems={setDifferentials}
                  placeholder="Enter diagnosis (e.g. Sepsis) and press Enter..."
                  showScore={false}
                />
              </div>

              {/* Active Rounds: Orders */}
              <div className="h-1/2 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden min-h-0 ring-1 ring-black/5">
                <div className="flex bg-slate-50 border-b border-slate-200 shrink-0">
                  {Object.values(TabType).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-4 ${
                        activeTab === tab 
                          ? 'border-blue-600 text-blue-600 bg-white' 
                          : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                
                <div className="flex-1 overflow-hidden p-4">
                  {activeTab === TabType.LABS && (
                    <ListManager
                      title="Serum & Urine Labs"
                      items={labs}
                      setItems={setLabs}
                      shortcuts={SHORTCUTS[TabType.LABS]}
                      placeholder="Add lab (e.g. BCx) and Enter..."
                    />
                  )}
                  {activeTab === TabType.DIAGNOSTICS && (
                    <ListManager
                      title="Imaging & Procedures"
                      items={diagnostics}
                      setItems={setDiagnostics}
                      shortcuts={SHORTCUTS[TabType.DIAGNOSTICS]}
                      placeholder="Add imaging/EKG and Enter..."
                    />
                  )}
                  {activeTab === TabType.TREATMENT && (
                    <ListManager
                      title="Therapeutic Management"
                      items={treatments}
                      setItems={setTreatments}
                      shortcuts={SHORTCUTS[TabType.TREATMENT]}
                      placeholder="Add medication/fluid and Enter..."
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
