
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

    // Logic to chunk text: strictly 4-5 sentences per section for progressive disclosure
    const textWithoutSolution = caseText.replace(/Final Diagnosis[:\s]+[^\n]+/gi, '').trim();
    
    // Split into sentences using a regex that handles common medical abbreviations better
    // This looks for periods followed by a space and a capital letter, or end of line
    const sentences = textWithoutSolution.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [textWithoutSolution];
    
    const resultChunks: string[] = [];
    const sentencesPerChunk = 5;

    for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
      const chunk = sentences.slice(i, i + sentencesPerChunk).join('').trim();
      if (chunk) resultChunks.push(chunk);
    }

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
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
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
    // Search from bottom up for the final diagnosis marker
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
    const diagnosis = extracted || "Diagnosis not specified in text";
    setFinalDiagnosis(diagnosis);
    setReviewMode(true);
  };

  const fetchTeachingData = useCallback(async () => {
    if (!finalDiagnosis || finalDiagnosis.includes("not specified")) return;
    
    setLoadingPoints(true);
    try {
      const points = await getTeachingPoints(finalDiagnosis, studentLevel);
      setTeachingPoints(points);
      
      if (differentials.length > 0) {
        const scores = await assessDifferentials(finalDiagnosis, differentials.map(d => d.text));
        setDifferentials(prev => prev.map((d, i) => ({ ...d, relevanceScore: scores[i] || 0 })));
      }
    } catch (err) {
      console.error("Critical error in AI analysis:", err);
    } finally {
      setLoadingPoints(false);
    }
  }, [finalDiagnosis, studentLevel, differentials.length]);

  useEffect(() => {
    if (reviewMode && finalDiagnosis) {
      fetchTeachingData();
    }
  }, [studentLevel, reviewMode, finalDiagnosis, fetchTeachingData]);

  const reset = () => {
    setIsCaseLoaded(false);
    setReviewMode(false);
    setCaseText('');
    setFinalDiagnosis('');
    setTeachingPoints([]);
    setChunks([]);
    setVisibleIndex(0);
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
            className="w-full px-3 py-2 text-sm bg-slate-900 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-slate-500 font-medium"
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
                            <span className="text-sm text-slate-700 font-bold truncate">{item.text}</span>
                          </div>
                          {showScore && item.relevanceScore !== undefined && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.relevanceScore > 70 ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-orange-100 text-orange-700 border border-orange-200'}`}>
                              {item.relevanceScore}% match
                            </span>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="max-w-3xl w-full bg-white rounded-3xl shadow-2xl border border-slate-200 p-10">
          <div className="flex items-center gap-6 mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <i className="fas fa-microscope text-white text-3xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">MedTeach Rounding</h1>
              <p className="text-slate-500 font-medium">Internal Medicine Teaching Platform</p>
            </div>
          </div>
          
          <div className="space-y-8">
            <div className="relative group">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Case Report (Supports Rich Pasting)</label>
              <textarea
                className="w-full h-96 p-8 border-2 border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all resize-none text-lg leading-relaxed text-slate-700 shadow-inner bg-slate-50 hover:bg-white"
                placeholder="Paste the clinical case here. 

Ensure it concludes with:
'Final Diagnosis: [The Correct Disease]'

The system will chunk the text into 5-sentence disclosure blocks for your students."
                value={caseText}
                onChange={handleCaseUpload}
              />
            </div>
            
            <button
              onClick={startCase}
              className="w-full bg-slate-900 hover:bg-black text-white font-black py-6 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
              disabled={!caseText.trim()}
            >
              <i className="fas fa-bolt text-yellow-400"></i> BEGIN CLINICAL ROUNDS
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans selection:bg-blue-100">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-inner">
            <i className="fas fa-user-md text-white text-xl"></i>
          </div>
          <div>
            <span className="font-black text-slate-900 tracking-tighter block leading-none text-lg">MedTeach</span>
            <span className="text-[10px] text-blue-500 font-black uppercase tracking-[0.2em]">Active Rounds</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={reset}
            className="px-5 py-2 text-xs font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest"
          >
            New Case
          </button>
          {!reviewMode && (
            <button
              onClick={handleReview}
              className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-lg transition-all flex items-center gap-2 hover:-translate-y-0.5"
            >
              <i className="fas fa-flag-checkered"></i> REVIEW CASE
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden p-8 gap-8">
        {/* Left Column: Progressive Disclosure */}
        <div className="w-1/2 flex flex-col bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden relative">
          <div className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 px-8 py-5 flex justify-between items-center shrink-0">
            <h2 className="font-black text-slate-800 uppercase text-[10px] tracking-[0.2em] flex items-center gap-2">
              <i className="fas fa-clipboard-list text-blue-600"></i> Patient History & Exam
            </h2>
            <div className="text-[10px] font-black text-blue-700 bg-blue-100 px-4 py-1.5 rounded-full border border-blue-200">
              BLOCK {visibleIndex} / {chunks.length}
            </div>
          </div>
          
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-10 bg-white">
            {chunks.slice(0, visibleIndex).map((para, i) => (
              <div 
                key={i} 
                className={`p-8 rounded-3xl text-slate-800 leading-relaxed text-2xl border-2 transition-all duration-700 animate-in fade-in slide-in-from-bottom-8 ${
                  i === visibleIndex - 1 ? 'bg-blue-50/30 border-blue-100 shadow-sm' : 'bg-white border-slate-50 opacity-60 grayscale-[0.5]'
                }`}
              >
                {para}
              </div>
            ))}
            
            {!reviewMode && visibleIndex < chunks.length && (
              <div className="flex justify-center pt-4 pb-20">
                <button 
                  onClick={nextParagraph}
                  className="w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all ring-8 ring-blue-50 group"
                  title="Reveal next 5 sentences"
                >
                  <i className="fas fa-arrow-down text-2xl group-hover:translate-y-1 transition-transform"></i>
                </button>
              </div>
            )}

            {visibleIndex === chunks.length && !reviewMode && (
              <div className="text-center py-20">
                <div className="inline-flex flex-col items-center gap-4 px-10 py-6 bg-green-50 text-green-700 rounded-3xl text-sm font-black border-2 border-green-200 shadow-xl shadow-green-100/50">
                  <i className="fas fa-check-double text-3xl"></i> 
                  <span>PRESENTATION FULLY DISCLOSED</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interaction */}
        <div className="w-1/2 flex flex-col gap-8 overflow-hidden">
          {reviewMode ? (
            <div className="flex-1 overflow-y-auto space-y-8 animate-in fade-in slide-in-from-right-10 duration-700 pr-2 pb-10">
              <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 p-10 relative overflow-hidden">
                <div className="flex justify-between items-start mb-10">
                  <h2 className="text-4xl font-black text-indigo-950 flex items-center gap-4 tracking-tighter">
                    <i className="fas fa-trophy text-amber-500"></i> Post-Case Review
                  </h2>
                  <div className="text-right">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Learner Level</label>
                    <select 
                      className="text-xs font-black bg-indigo-50 text-indigo-700 px-5 py-2.5 rounded-2xl border-2 border-indigo-100 outline-none cursor-pointer hover:border-indigo-300 transition-all shadow-sm"
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
                
                <div className="mb-12 p-10 bg-slate-900 rounded-[2.5rem] border-4 border-indigo-50 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <i className="fas fa-star-of-life text-white/5 text-8xl rotate-12"></i>
                  </div>
                  <label className="block text-[10px] font-black text-indigo-300 uppercase mb-4 tracking-[0.3em]">Final Confirmed Diagnosis</label>
                  <div className="text-4xl font-black text-white tracking-tight drop-shadow-sm">
                    {finalDiagnosis}
                  </div>
                </div>

                <div className="space-y-12 mb-12">
                  <section>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 border-b-2 border-slate-50 pb-3 flex items-center gap-2">
                      <i className="fas fa-sort-amount-down text-indigo-500"></i> Differential Accuracy
                    </h3>
                    <div className="space-y-4">
                      {differentials.length > 0 ? differentials.map((d, i) => (
                        <div key={d.id} className="flex items-center justify-between p-5 bg-white border-2 border-slate-50 rounded-3xl shadow-sm hover:shadow-md transition-shadow group">
                          <div className="flex items-center gap-5">
                            <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">{i + 1}</span>
                            <span className="text-lg font-black text-slate-800 tracking-tight">{d.text}</span>
                          </div>
                          {d.relevanceScore !== undefined && (
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${d.relevanceScore > 75 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${d.relevanceScore}%` }}></div>
                              </div>
                              <span className={`text-xs font-black px-4 py-1.5 rounded-2xl shadow-sm border ${d.relevanceScore > 75 ? 'bg-green-500 text-white border-green-400' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                                {d.relevanceScore}%
                              </span>
                            </div>
                          )}
                        </div>
                      )) : <div className="text-sm text-slate-400 font-bold bg-slate-50 p-10 rounded-3xl border-2 border-dashed border-slate-200 text-center">No differentials recorded</div>}
                    </div>
                  </section>

                  <div className="grid grid-cols-2 gap-10">
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div> Diagnostic Workup
                      </h3>
                      <div className="flex flex-wrap gap-2.5">
                        {[...labs, ...diagnostics].length > 0 ? [...labs, ...diagnostics].map(t => (
                          <span key={t.id} className="px-4 py-2 bg-white text-slate-800 rounded-2xl text-[11px] font-black border-2 border-slate-100 shadow-sm">{t.text}</span>
                        )) : <span className="text-xs text-slate-400 italic">No tests ordered</span>}
                      </div>
                    </section>
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div> Management
                      </h3>
                      <div className="flex flex-wrap gap-2.5">
                        {treatments.length > 0 ? treatments.map(t => (
                          <span key={t.id} className="px-4 py-2 bg-indigo-50 text-indigo-800 rounded-2xl text-[11px] font-black border-2 border-indigo-100 shadow-sm">{t.text}</span>
                        )) : <span className="text-xs text-slate-400 italic">No treatment started</span>}
                      </div>
                    </section>
                  </div>
                </div>

                <div className="mb-12">
                  <h3 className="font-black text-2xl text-slate-900 flex items-center gap-4 mb-8">
                    <i className="fas fa-lightbulb text-amber-400 text-3xl"></i> AI Teaching Pearls
                  </h3>
                  
                  {loadingPoints ? (
                    <div className="space-y-8">
                      {[1,2,3].map(i => (
                        <div key={i} className="flex gap-6 items-start">
                          <div className="w-32 h-32 bg-slate-100 rounded-3xl animate-pulse"></div>
                          <div className="flex-1 space-y-4">
                            <div className="h-6 bg-slate-100 rounded-xl w-1/2 animate-pulse"></div>
                            <div className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : teachingPoints.length > 0 ? (
                    <div className="space-y-8">
                      {teachingPoints.map((point, idx) => (
                        <div key={idx} className="group p-8 bg-white border-2 border-slate-50 rounded-[2.5rem] hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all flex gap-8 relative overflow-hidden">
                          <div className="flex-1 relative z-10">
                            <h4 className="font-black text-slate-900 text-xl leading-tight mb-3 group-hover:text-indigo-600 transition-colors">{point.title}</h4>
                            <p className="text-sm text-slate-600 leading-relaxed font-medium mb-4">{point.description}</p>
                            <span className="inline-block text-[10px] bg-slate-900 text-white px-4 py-1.5 rounded-full font-black uppercase tracking-widest">{point.level}</span>
                          </div>
                          {point.imageUrl && (
                            <div className="w-36 h-36 shrink-0 overflow-hidden rounded-3xl bg-slate-100 shadow-inner ring-4 ring-slate-50/50 relative z-10 group-hover:ring-indigo-50 transition-all">
                              <img 
                                src={`https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=200&q=80&sig=${idx}`} 
                                alt="medical focus" 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-90 group-hover:opacity-100"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-16 text-center bg-slate-50 rounded-[2.5rem] border-4 border-dashed border-slate-200">
                      <i className="fas fa-brain text-slate-200 text-7xl mb-6"></i>
                      <p className="text-slate-400 font-black text-xl tracking-tight">AI analysis will appear here after review</p>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={reset} 
                  className="w-full py-7 bg-slate-950 text-white rounded-[2rem] font-black text-lg hover:bg-black transition-all shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex items-center justify-center gap-4 hover:-translate-y-1"
                >
                  <i className="fas fa-plus-circle text-2xl"></i> START NEW CLINICAL CASE
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Thinking Area: Differentials */}
              <div className="h-1/2 flex flex-col min-h-0">
                <ListManager
                  title="Differential Diagnosis Ranking"
                  items={differentials}
                  setItems={setDifferentials}
                  placeholder="Rank highest probability first..."
                  showScore={false}
                />
              </div>

              {/* Interaction Area: Tabs */}
              <div className="h-1/2 flex flex-col bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden min-h-0">
                <div className="flex bg-slate-50 border-b border-slate-200 shrink-0">
                  {Object.values(TabType).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-4 ${
                        activeTab === tab 
                          ? 'border-blue-600 text-blue-600 bg-white' 
                          : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                
                <div className="flex-1 overflow-hidden p-6 bg-white">
                  {activeTab === TabType.LABS && (
                    <ListManager
                      title="Labs to Order"
                      items={labs}
                      setItems={setLabs}
                      shortcuts={SHORTCUTS[TabType.LABS]}
                      placeholder="Add lab (e.g. BMP) and Enter..."
                    />
                  )}
                  {activeTab === TabType.DIAGNOSTICS && (
                    <ListManager
                      title="Diagnostics & Imaging"
                      items={diagnostics}
                      setItems={setDiagnostics}
                      shortcuts={SHORTCUTS[TabType.DIAGNOSTICS]}
                      placeholder="Add study (e.g. CXR) and Enter..."
                    />
                  )}
                  {activeTab === TabType.TREATMENT && (
                    <ListManager
                      title="Treatment Plan"
                      items={treatments}
                      setItems={setTreatments}
                      shortcuts={SHORTCUTS[TabType.TREATMENT]}
                      placeholder="Add therapy and Enter..."
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
