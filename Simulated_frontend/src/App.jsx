import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8001';

function App() {
  const [input, setInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ connected: false, tools: [] });
  const [activeArtifact, setActiveArtifact] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const chatEndRef = useRef(null);

  useEffect(() => {
    axios.get(`${API_BASE}/status`).then((res) => setStatus(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  // Speak text aloud like Alexa (strips out raw Windows file paths so voice sounds natural)
  const speakText = (text) => {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleanSpeech = text
      .replace(/[A-Za-z]:\\[^\s"']+/g, 'the saved PDF report in your workspace')
      .replace(/\/[^\s"']+\.pdf/g, 'the saved PDF report');
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  };

  // Browser Speech-to-Text (Microphone)
  const toggleMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition requires Chrome or Edge.');
      return;
    }
    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      sendMessage(null, transcript);
    };
    recognition.start();
  };

  const sendMessage = async (e, overrideText = null) => {
    if (e) e.preventDefault();
    const textToSend = (overrideText ?? input).trim();
    if (!textToSend || loading) return;

    setInput('');
    setChatHistory((prev) => [...prev, { sender: 'user', text: textToSend }]);
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/chat`, { message: textToSend });
      const { response, steps, artifacts } = res.data;

      setChatHistory((prev) => [
        ...prev,
        { sender: 'alexa', text: response, steps: steps || [], artifacts: artifacts || [] },
      ]);

      if (artifacts && artifacts.length > 0) {
        setActiveArtifact(artifacts[artifacts.length - 1]);
      }
      speakText(response);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { sender: 'alexa', text: 'Error communicating with the Simulated Backend.', steps: [] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const openPdf = (pdfPath) => {
    window.open(`${API_BASE}/pdf?path=${encodeURIComponent(pdfPath)}`, '_blank');
  };

  return (
    <div style={styles.page}>
      {/* Top Echo Show Status Bar */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.alexaOrb} />
          <div>
            <h1 style={styles.title}>Alexa+ Laptop Co-Pilot</h1>
            <div style={styles.subtitle}>
              MCP Streamable HTTP • {status.connected ? `Connected (${status.tools.length} tools)` : 'Disconnected'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {status.tools.map((t) => (
            <span key={t} style={styles.toolBadge}>{t}</span>
          ))}
          <button
            onClick={() => {
              window.speechSynthesis?.cancel();
              setTtsEnabled(!ttsEnabled);
            }}
            style={{ ...styles.topBtn, backgroundColor: ttsEnabled ? '#00A8E1' : '#334155' }}
          >
            {ttsEnabled ? '🔊 Voice ON' : '🔇 Voice Muted'}
          </button>
        </div>
      </header>

      {/* Main Split-Screen Multimodal Body */}
      <main style={styles.mainGrid}>
        {/* Left Panel: Conversation & Live MCP Tool Trace */}
        <section style={styles.chatPanel}>
          <div style={styles.chatScroll}>
            {chatHistory.length === 0 && (
              <div style={styles.emptyState}>
                <p style={{ fontSize: '16px', color: '#94a3b8' }}>
                  Try a voice or text command to trigger your MCP tools:
                </p>
                <div style={styles.quickGrid}>
                  {[
                    'What is on my screen right now?',
                    'Analyze sales.csv in my workspace',
                    'Research current Indian EV market leaders and compare numbers',
                    'Organize the files in my workspace into folders by type',
                  ].map((q) => (
                    <button key={q} onClick={() => sendMessage(null, q)} style={styles.quickBtn}>
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatHistory.map((msg, idx) => (
              <div key={idx} style={{ marginBottom: '18px' }}>
                {/* Live MCP Tool Call Trace */}
                {msg.steps && msg.steps.length > 0 && (
                  <div style={styles.traceBox}>
                    <div style={styles.traceHeader}>⚡ MCP Protocol Trace</div>
                    {msg.steps.map((s, i) => (
                      <div key={i} style={styles.traceRow}>
                        <span style={{ color: s.type === 'call' ? '#38bdf8' : '#4ade80', fontWeight: 600 }}>
                          {s.type === 'call' ? `→ ${s.tool}()` : `← ${s.tool}`}
                        </span>
                        <span style={styles.traceSummary}>{s.summary}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
                  <div
                    style={{
                      ...styles.bubble,
                      backgroundColor: msg.sender === 'user' ? '#0284c7' : '#1e293b',
                      border: msg.sender === 'user' ? 'none' : '1px solid #334155',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={styles.thinkingBar}>
                <span style={styles.pulseDot} /> Alexa+ is reasoning & executing MCP tools...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Bar with Voice Mic */}
          <form onSubmit={sendMessage} style={styles.inputBar}>
            <button
              type="button"
              onClick={toggleMic}
              style={{
                ...styles.micBtn,
                backgroundColor: isListening ? '#ef4444' : '#1e293b',
              }}
              title="Speak to Alexa+"
            >
              {isListening ? '🎙️ Listening...' : '🎤'}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Alexa+ about your screen, data, web research, or file chores..."
              style={styles.textInput}
            />
            <button type="submit" disabled={loading} style={styles.sendBtn}>
              Send
            </button>
          </form>
        </section>

        {/* Right Panel: Echo Show Visual Display Canvas */}
        <section style={styles.canvasPanel}>
          <div style={styles.canvasHeader}>🖥️ Echo Show Multimodal Canvas</div>
          {!activeArtifact ? (
            <div style={styles.canvasEmpty}>
              Visual artifacts (PDF reports, data insights, and sandboxed script approvals) will appear here automatically when tools run.
            </div>
          ) : (
            <div style={styles.artifactCard}>
              <div style={styles.artifactBadge}>Tool: {activeArtifact.tool}</div>

              {/* 1. Research / Analyze Data Artifact */}
              {(activeArtifact.tool === 'analyze_data' || activeArtifact.tool === 'research_topic') && (
                <div>
                  <h2 style={{ margin: '8px 0', color: '#f8fafc' }}>
                    {activeArtifact.data.headline || 'Analysis Complete'}
                  </h2>
                  {activeArtifact.data.confidence && (
                    <span style={styles.confidencePill}>
                      Confidence: {activeArtifact.data.confidence.toUpperCase()}
                    </span>
                  )}

                  {/* PDF Action Buttons */}
                  <div style={{ display: 'flex', gap: '10px', margin: '16px 0', flexWrap: 'wrap' }}>
                    {activeArtifact.data.report_pdf_path && (
                      <button
                        onClick={() => openPdf(activeArtifact.data.report_pdf_path)}
                        style={styles.pdfBtn}
                      >
                        📄 Open Analysis Report PDF
                      </button>
                    )}
                    {activeArtifact.data.dossier_pdf_path && (
                      <button
                        onClick={() => openPdf(activeArtifact.data.dossier_pdf_path)}
                        style={styles.pdfBtnSecondary}
                      >
                        🗂️ Open Raw Research Dossier PDF
                      </button>
                    )}
                  </div>

                  {/* Searches Run Pills (if research_topic) */}
                  {activeArtifact.data.searches_run && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                        Multi-Angle Searches Executed ({activeArtifact.data.numbers_extracted || 0} metrics extracted):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {activeArtifact.data.searches_run.map((s, i) => (
                          <span key={i} style={styles.searchPill}>
                            🔍 {s.query} ({s.results})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Markdown Preview */}
                  {activeArtifact.data.report_markdown && (
                    <pre style={styles.markdownPre}>{activeArtifact.data.report_markdown}</pre>
                  )}
                </div>
              )}

              {/* 2. Script Approval Artifact (write_script) */}
              {activeArtifact.tool === 'write_script' && (
                <div>
                  <h3 style={{ color: '#38bdf8', margin: '8px 0' }}>
                    🛡️ Human-in-the-Loop Script Approval
                  </h3>
                  <p style={{ color: '#e2e8f0', fontSize: '15px' }}>
                    {activeArtifact.data.summary_for_user}
                  </p>
                  <div style={styles.safetyTag}>
                    ✓ {activeArtifact.data.safety_check} | ID: {activeArtifact.data.script_id}
                  </div>
                  <pre style={styles.codeBlock}>{activeArtifact.data.code}</pre>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
                    <button
                      onClick={() => sendMessage(null, `Yes, run ${activeArtifact.data.script_id}`)}
                      style={styles.approveBtn}
                    >
                      ✅ Approve & Run in Sandbox
                    </button>
                    <button
                      onClick={() => sendMessage(null, 'No, do not run the script.')}
                      style={styles.cancelBtn}
                    >
                      ✖ Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Script Execution Output (run_script) */}
              {activeArtifact.tool === 'run_script' && (
                <div>
                  <h3 style={{ color: activeArtifact.data.succeeded ? '#4ade80' : '#f87171' }}>
                    {activeArtifact.data.succeeded ? '✅ Sandbox Execution Succeeded' : '❌ Execution Failed'}
                  </h3>
                  {activeArtifact.data.output && (
                    <pre style={styles.codeBlock}>{activeArtifact.data.output}</pre>
                  )}
                  <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '10px' }}>
                    <div><strong>Created:</strong> {(activeArtifact.data.files_created || []).join(', ') || 'None'}</div>
                    <div><strong>Changed:</strong> {(activeArtifact.data.files_changed || []).join(', ') || 'None'}</div>
                    <div><strong>Moved/Removed:</strong> {(activeArtifact.data.files_removed_or_moved_away || []).join(', ') || 'None'}</div>
                  </div>
                </div>
              )}

              {/* 4. Screen Vision Output (ask_about_screen) */}
              {activeArtifact.tool === 'ask_about_screen' && (
                <div>
                  <h3 style={{ color: '#38bdf8' }}>👁️ Screen Vision Capture</h3>
                  <pre style={styles.markdownPre}>{activeArtifact.data.text}</pre>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: { backgroundColor: '#0b0f19', color: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '1px solid #1e293b', background: '#0f172a' },
  alexaOrb: { width: '18px', height: '18px', borderRadius: '50%', background: 'linear-gradient(135deg, #00A8E1, #38bdf8)', boxShadow: '0 0 12px #00A8E1' },
  title: { margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' },
  subtitle: { fontSize: '12px', color: '#94a3b8' },
  toolBadge: { fontSize: '11px', padding: '4px 8px', borderRadius: '999px', backgroundColor: '#1e293b', color: '#38bdf8', border: '1px solid #334155' },
  topBtn: { padding: '6px 12px', borderRadius: '6px', border: 'none', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  mainGrid: { display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '16px', padding: '16px 24px', flex: 1, maxHeight: 'calc(100vh - 70px)' },
  chatPanel: { display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', overflow: 'hidden' },
  chatScroll: { flex: 1, padding: '18px', overflowY: 'auto' },
  emptyState: { textAlign: 'center', marginTop: '40px' },
  quickGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' },
  quickBtn: { padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontSize: '13px' },
  traceBox: { backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', fontSize: '12px', fontFamily: 'monospace' },
  traceHeader: { color: '#64748b', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' },
  traceRow: { display: 'flex', gap: '8px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  traceSummary: { color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis' },
  bubble: { display: 'inline-block', maxWidth: '85%', padding: '12px 16px', borderRadius: '14px', lineHeight: 1.5, fontSize: '14.5px', textAlign: 'left' },
  thinkingBar: { color: '#38bdf8', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' },
  pulseDot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8' },
  inputBar: { display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid #1e293b', backgroundColor: '#090d16' },
  micBtn: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #334155', color: 'white', cursor: 'pointer', fontSize: '14px' },
  textInput: { flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', fontSize: '14px' },
  sendBtn: { padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#00A8E1', color: 'white', fontWeight: 600, cursor: 'pointer' },
  canvasPanel: { display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', overflow: 'hidden' },
  canvasHeader: { padding: '12px 16px', borderBottom: '1px solid #1e293b', fontSize: '13px', fontWeight: 600, color: '#94a3b8', backgroundColor: '#090d16' },
  canvasEmpty: { padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' },
  artifactCard: { padding: '18px', overflowY: 'auto', flex: 1 },
  artifactBadge: { display: 'inline-block', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#38bdf8', marginBottom: '6px' },
  confidencePill: { display: 'inline-block', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#064e3b', color: '#6ee7b7', fontWeight: 600 },
  pdfBtn: { padding: '9px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#0284c7', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  pdfBtnSecondary: { padding: '9px 14px', borderRadius: '6px', border: '1px solid #38bdf8', backgroundColor: 'transparent', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  searchPill: { fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#cbd5e1' },
  markdownPre: { whiteSpace: 'pre-wrap', backgroundColor: '#090d16', padding: '12px', borderRadius: '8px', border: '1px solid #1e293b', fontSize: '12.5px', color: '#cbd5e1', maxHeight: '340px', overflowY: 'auto', lineHeight: 1.5 },
  safetyTag: { fontSize: '12px', color: '#4ade80', backgroundColor: '#052e16', padding: '6px 10px', borderRadius: '6px', marginBottom: '10px' },
  codeBlock: { whiteSpace: 'pre-wrap', backgroundColor: '#090d16', padding: '12px', borderRadius: '8px', border: '1px solid #334155', fontSize: '12px', color: '#38bdf8', fontFamily: 'monospace', maxHeight: '260px', overflowY: 'auto' },
  approveBtn: { padding: '10px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: 'white', fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '10px 16px', borderRadius: '6px', border: '1px solid #64748b', backgroundColor: 'transparent', color: '#cbd5e1', cursor: 'pointer' },
};

export default App;