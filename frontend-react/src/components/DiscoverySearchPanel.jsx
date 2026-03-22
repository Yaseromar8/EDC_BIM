import React from 'react';
import './DiscoverySearchPanel.css';

const DiscoverySearchPanel = ({ results, answer, loading, query, messages, onOpenDocument, onClose, onUniversalSearch }) => {
    const [inputValue, setInputValue] = React.useState('');
    const scrollRef = React.useRef(null);

    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = () => {
        if (!inputValue.trim() || loading) return;
        onUniversalSearch(inputValue);
        setInputValue('');
    };

    const chatMessages = messages || (answer ? [{ role: 'assistant', content: answer, results }] : []);

    return (
        <div className="discovery-search-panel">
            <header className="discovery-header">
                <div className="discovery-header-left">
                    <span className="sparkle">✨</span>
                    ASISTENTE IA
                </div>
                <button className="discovery-close-btn" onClick={onClose} title="Cerrar Panel">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </header>

            <div className="discovery-body" ref={scrollRef}>
                <div className="discovery-chat-container">
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`chat-message ${msg.role}`}>
                            <div className="message-bubble">
                                {msg.agentSteps && msg.agentSteps.length > 0 && (
                                    <details className="agent-reasoning">
                                        <summary>Pensamiento del Agente ({msg.agentSteps.length} pasos)</summary>
                                        <ul className="reasoning-steps">
                                            {msg.agentSteps.map((step, sIdx) => (
                                                <li key={sIdx}>{step}</li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                                <div className="answer-text">{msg.content}</div>
                            </div>
                            {msg.results && msg.results.length > 0 && (
                                <div className="message-citations">
                                    {msg.results.map((res, i) => (
                                        <div key={i} className="citation-chip">
                                            <span className="citation-index">{i + 1}</span>
                                            <span className="citation-text" title={res.title}>{res.title}</span>
                                            {res.nodeId && (
                                                <button
                                                    className="citation-open-btn"
                                                    onClick={() => onOpenDocument && onOpenDocument(res)}
                                                    title="Abrir Documento"
                                                >
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {loading && (
                        <div className="discovery-loading-chat">
                            <div className="search-spinner-small"></div>
                            <span>Analizando...</span>
                        </div>
                    )}
                </div>
            </div>

            <footer className="discovery-chat-footer">
                <div className="chat-input-wrapper">
                    <input
                        type="text"
                        placeholder="Escribir repregunta..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                    <button onClick={handleSend} disabled={!inputValue.trim() || loading}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
                <small className="ai-branding">GOOGLE VERTEX AI SEARCH</small>
            </footer>
        </div>
    );
};

export default DiscoverySearchPanel;
