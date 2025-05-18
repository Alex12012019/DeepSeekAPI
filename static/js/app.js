class ChatApp {
    constructor() {
        this.currentChat = null;
        this.initElements();
        this.bindEvents();
        this.loadConversations();
    }

    initElements() {
        this.elements = {
            chatContainer: document.getElementById('chat-container'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            conversationList: document.getElementById('conversation-list'),
            newChatBtn: document.getElementById('new-chat-btn')
        };
    }

    bindEvents() {
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        this.elements.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.elements.newChatBtn.addEventListener('click', () => this.newChat());
    }

    async sendMessage() {
        const text = this.elements.userInput.value.trim();
        if (!text) return;

        // Блокируем кнопку и показываем индикатор
        this.elements.sendButton.disabled = true;
        this.elements.sendButton.innerHTML = '<div class="spinner"></div>';

        this.addMessage('user', text);
        this.elements.userInput.value = '';

        try {
            const response = await fetch('/api/send_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    messages: this.currentChat?.messages || []
                })
            });

            const data = await response.json();
            this.addMessage('assistant', data.assistant_reply);
            
            if (this.currentChat) {
                this.currentChat.messages = data.messages;
            }
        } catch (error) {
            this.addMessage('assistant', `Ошибка: ${error.message}`, false);
        } finally {
            // Восстанавливаем кнопку
            this.elements.sendButton.disabled = false;
            this.elements.sendButton.textContent = 'Отправить';
        }
    }


    addMessage(role, content, isMarkdown = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = isMarkdown ? marked.parse(content) : content;
        
        messageDiv.appendChild(contentDiv);
        this.elements.chatContainer.appendChild(messageDiv);
        this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
        
        // Добавляем кнопку копирования для ответов ассистента
        if (role === 'assistant') {
            this.addCopyButton(messageDiv, content);
        }
    }

    addCopyButton(container, text) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.innerHTML = '📋';
        btn.title = 'Копировать';
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(text);
            btn.innerHTML = '✓';
            setTimeout(() => btn.innerHTML = '📋', 2000);
        });
        container.appendChild(btn);
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/get_conversations');
            const conversations = await response.json();
            this.renderConversationList(conversations);
        } catch (error) {
            console.error('Ошибка загрузки диалогов:', error);
        }
    }

    renderConversationList(conversations) {
            this.elements.conversationList.innerHTML = conversations.map(conv => `
                <div class="conversation-item" data-id="${conv.filename}">
                    <div class="conv-name">${conv.name}</div>
                    <div class="conv-date">${new Date(conv.date).toLocaleString()}</div>
                    <div class="conv-actions">
                        <button class="rename-btn" title="Переименовать">✏️</button>
                        <button class="delete-btn" title="Удалить">🗑️</button>
                    </div>
                </div>
            `).join('');

        document.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => this.loadChat(item.dataset.id));
        });
    }

    async loadChat(chatId) {
        try {
            const response = await fetch(`/api/load_conversation/${chatId}`);
            const chatData = await response.json();
            
            this.currentChat = {
                id: chatId,
                messages: chatData.messages
            };

            this.elements.chatContainer.innerHTML = '';
            chatData.messages.forEach(msg => {
                this.addMessage(msg.role, msg.content);
            });
        } catch (error) {
            this.addMessage('assistant', `Ошибка загрузки чата: ${error.message}`, false);
        }
    }

    newChat() {
        if (confirm('Начать новый диалог?')) {
            this.currentChat = null;
            this.elements.chatContainer.innerHTML = '';
        }
    }

    bindEvents() {
        // ... существующие обработчики ...
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) {
                this.deleteChat(e.target.closest('.conversation-item').dataset.id);
            }
            if (e.target.classList.contains('rename-btn')) {
                this.showRenameDialog(e.target.closest('.conversation-item').dataset.id);
            }
        });
    }

        async deleteChat(chatId) {
        if (!confirm('Удалить этот диалог?')) return;
        
        try {
            await fetch(`/api/delete_chat/${chatId}`, { method: 'POST' });
            if (this.currentChat?.id === chatId) {
                this.currentChat = null;
                this.elements.chatContainer.innerHTML = '';
            }
            this.loadConversations();
        } catch (error) {
            alert('Ошибка удаления: ' + error.message);
        }
    }

    async showRenameDialog(chatId) {
        const newName = prompt('Введите новое название:');
        if (!newName) return;

        try {
            await fetch(`/api/rename_chat/${chatId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: newName })
            });
            this.loadConversations();
        } catch (error) {
            alert('Ошибка переименования: ' + error.message);
        }
    }

}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChatApp();
});