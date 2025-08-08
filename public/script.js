const API_BASE_URL = window.location.origin;
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const sendBtn = document.getElementById('sendBtn');

let conversationHistory = [];

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    autoResizeTextarea();
});

function setupEventListeners() {
    chatForm.addEventListener('submit', handleSubmit);
    messageInput.addEventListener('input', autoResizeTextarea);
    messageInput.addEventListener('focus', autoResizeTextarea);
    messageInput.addEventListener('keydown', handleKeyDown);
    messageInput.focus();
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    const computedStyles = window.getComputedStyle(messageInput);
    const lineHeight = parseFloat(computedStyles.lineHeight) || 18;
    const minHeight = Math.ceil(lineHeight);
    const nextHeight = Math.max(minHeight, Math.min(messageInput.scrollHeight, 120));
    messageInput.style.height = nextHeight + 'px';
}

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSubmit(event);
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    addMessage(message, 'user');
    messageInput.value = '';
    autoResizeTextarea();
    
    showTypingIndicator();
    
    try {
        const historyForAPI = conversationHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            content: msg.content
        }));
        
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                history: historyForAPI
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        hideTypingIndicator();
        
        addMessage(data.response, 'bot');
        
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        hideTypingIndicator();
        addErrorMessage('Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.');
    }
}

function addMessage(content, role) {
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    if (welcomeMessage && conversationHistory.length === 0) {
        welcomeMessage.remove();
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${role}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    if (role === 'user') {
        messageContent.textContent = content;
    } else {
        messageContent.innerHTML = formatMessage(content);
    }
    
    messageElement.appendChild(messageContent);
    
    chatMessages.appendChild(messageElement);
    
    conversationHistory.push({
        role: role,
        content: content,
        timestamp: new Date().toISOString()
    });
    
    scrollToBottom();
}

function addErrorMessage(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'message bot';
    errorElement.innerHTML = `
        <div class="message-content" style="background: #fee; color: #c33; border-color: #fcc;">
            ${message}
        </div>
    `;
    
    chatMessages.appendChild(errorElement);
    scrollToBottom();
}

function formatMessage(text) {
    return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="message-link">$1</a>');
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    sendBtn.disabled = true;
    messageInput.disabled = true;
    
    const typingElement = document.createElement('div');
    typingElement.className = 'message bot';
    typingElement.id = 'typingIndicator';
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    
    typingElement.appendChild(typingIndicator);
    
    chatMessages.appendChild(typingElement);
    scrollToBottom();
}

function hideTypingIndicator() {
    sendBtn.disabled = false;
    messageInput.disabled = false;
    
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

async function checkAPIHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (!response.ok) {
            console.warn('API não está respondendo corretamente');
        }
    } catch (error) {
        console.warn('Não foi possível conectar com a API:', error);
    }
}

checkAPIHealth();

window.clearChat = clearChat;
