import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './MobileAssistant.css';

const MobileAssistant = ({ modelUrn }) => {
    const [messages, setMessages] = useState([
        { role: 'ai', content: '¡Hola Ingeniero! Soy su asistente de obra. ¿En qué puedo ayudarle hoy con los documentos?' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [showCorrection, setShowCorrection] = useState(null); // stores index of message to correct
    const [correctionText, setCorrectionText] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const response = await fetch('/api/ai/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: input,
                    model_urn: modelUrn
                })
            });
            const data = await response.json();
            
            if (data.answer) {
                setMessages(prev => [...prev, { 
                    role: 'ai', 
                    content: data.answer,
                    id: data.interaction_id, // Assuming backend will return this for HITL
                    agentSteps: data.agent_steps // Add this
                }]);
            } else {
                setMessages(prev => [...prev, { role: 'ai', content: 'Lo siento, hubo un error al consultar los documentos.' }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'ai', content: 'Error de conexión con el servidor.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const submitCorrection = async () => {
        if (!correctionText.trim()) return;

        try {
            await fetch('/api/ai/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    interaction_id: showCorrection.id,
                    human_correction: correctionText,
                    reward_value: -1.0
                })
            });
            
            setMessages(prev => [...prev, { role: 'ai', content: '¡Entendido, Ingeniero! He guardado su corrección. Aprenderé de esto.' }]);
            setShowCorrection(null);
            setCorrectionText('');
        } catch (error) {
            alert('Error al guardar la corrección.');
        }
    };

    return (
        <div className="mobile-assistant-container">
            <header className="mobile-header">
                <h1>Asistente de Obra</h1>
            </header>

            <div className="chat-area">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message-bubble ${msg.role}`}>
                        {msg.role === 'ai' && msg.agentSteps && msg.agentSteps.length > 0 && (
                            <details className="agent-thinking">
                                <summary>Analizando expediente ({msg.agentSteps.length} pasos)...</summary>
                                <ul className="reasoning-list">
                                    {msg.agentSteps.map((s, si) => <li key={si}>{s}</li>)}
                                </ul>
                            </details>
                        )}
                        <div className="message-content">
                            {msg.role === 'ai' ? (
                                (() => {
                                    // Ultra-robust split for INTERNAL_ANALYSIS (caps, spaces, asterisks, hashtags)
                                    const analysisRegex = /[\s\n]*[#*]*\s*\[?INTERNAL_ANALYSIS\]?\s*[#*]*[\s\n]*/i;
                                    const parts = msg.content.split(analysisRegex);
                                    return (
                                        <>
                                            <ReactMarkdown>{parts[0]}</ReactMarkdown>
                                            {parts.length > 1 && (
                                                <details className="internal-analysis">
                                                    <summary>Ver Análisis del Auditor (HITL)</summary>
                                                    <div className="analysis-inner">
                                                        <ReactMarkdown>{parts[1]}</ReactMarkdown>
                                                    </div>
                                                </details>
                                            )}
                                        </>
                                    );
                                })()
                            ) : (
                                msg.content
                            )}
                        </div>
                        {msg.role === 'ai' && msg.id && (
                            <button 
                                className="correct-btn"
                                onClick={() => setShowCorrection(msg)}
                            >
                                ⚠️ No es así
                            </button>
                        )}
                    </div>
                ))}
                {isTyping && <div className="typing">Escribiendo...</div>}
                <div ref={messagesEndRef} />
            </div>

            {showCorrection && (
                <div className="correction-overlay">
                    <div className="correction-modal">
                        <h3>¿Cómo sería lo correcto?</h3>
                        <textarea 
                            value={correctionText}
                            onChange={(e) => setCorrectionText(e.target.value)}
                            placeholder="Escriba aquí su conocimiento experto..."
                        />
                        <div className="modal-actions">
                            <button className="confirm-btn" onClick={submitCorrection}>Guardar Conocimiento</button>
                            <button className="cancel-btn" onClick={() => setShowCorrection(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="input-area">
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Escriba su pregunta aquí..."
                />
                <button className="send-btn" onClick={handleSend}>Enviar</button>
            </div>
        </div>
    );
};

export default MobileAssistant;
