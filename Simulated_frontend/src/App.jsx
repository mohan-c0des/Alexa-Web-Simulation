import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [input, setInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    // Add user message to UI immediately
    setChatHistory((prev) => [...prev, { sender: 'user', text: userMessage }]);
    setLoading(true);

    try {
      // Send the text to your FastAPI LangGraph backend running on port 8001
      const res = await axios.post('http://127.0.0.1:8001/chat', { message: userMessage });
      
      // Add Alexa's response to the UI
      setChatHistory((prev) => [...prev, { sender: 'alexa', text: res.data.response }]);
    } catch (error) {
      console.error(error);
      setChatHistory((prev) => [...prev, { sender: 'alexa', text: "Error: Could not reach the AI backend." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center', color: '#00A8E1' }}>Alexa+ Productivity Prototype</h1>
      
      <div style={{ height: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '20px', borderRadius: '8px', marginBottom: '20px', backgroundColor: '#f9f9f9' }}>
        {chatHistory.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>Ask Alexa to check your laptop status or summarize commits...</p>}
        
        {chatHistory.map((msg, index) => (
          <div key={index} style={{ marginBottom: '15px', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
            <div style={{
              display: 'inline-block',
              padding: '10px 15px',
              borderRadius: '20px',
              backgroundColor: msg.sender === 'user' ? '#00A8E1' : '#e0e0e0',
              color: msg.sender === 'user' ? 'white' : 'black'
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && <div style={{ color: '#888' }}><em>Alexa is thinking...</em></div>}
      </div>
      
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: '10px' }}>
        <input 
          type="text" 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          placeholder="Type your command..."
          style={{ flexGrow: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#00A8E1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Send
        </button>
      </form>
    </div>
  );
}

export default App;