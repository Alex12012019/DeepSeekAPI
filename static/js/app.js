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
        // Делегирование событий для динамических элементов
        document.addEventListener('click', (e) => this.handleDocumentClick(e));
        
        // Обработка отправки сообщения
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        this.elements.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Новый чат
        this.elements.newChatBtn.addEventListener('click', () => this.newChat());
    }

    handleDocumentClick(e) {
        // Удаление чата
        if (e.target.closest('.delete-btn')) {
            const item = e.target.closest('.conversation-item');
            if (item) {
                this.deleteChat(item.dataset.id);
            }
            return;
        }

        // Переименование чата
        if (e.target.closest('.rename-btn')) {
            const item = e.target.closest('.conversation-item');
            if (item) {
                this.showRenameDialog(item.dataset.id);
            }
            return;
        }

        // Загрузка чата
        if (e.target.closest('.conversation-item') && !e.target.closest('.conv-actions')) {
            const item = e.target.closest('.conversation-item');
            if (item) {
                this.loadChat(item.dataset.id);
            }
        }
    }

    async sendMessage() {
        const text = this.elements.userInput.value.trim();
        if (!text) return;

        // Показываем индикатор загрузки
        this.setLoadingState(true);
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

            if (!response.ok) throw new Error('Network error');
            
            const data = await response.json();
            this.addMessage('assistant', data.assistant_reply);
            
            if (this.currentChat) {
                this.currentChat.messages = data.messages;
            }
        } catch (error) {
            this.addMessage('assistant', `Ошибка: ${error.message}`, false);
            console.error('Send message error:', error);
        } finally {
            this.setLoadingState(false);
        }
    }

    setLoadingState(isLoading) {
        if (isLoading) {
            this.elements.sendButton.disabled = true;
            this.elements.sendButton.innerHTML = '<div class="spinner"></div>';
        } else {
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
        
        if (role === 'assistant') {
            this.addCopyButton(messageDiv, content);
        }
        
        this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
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
            if (!response.ok) throw new Error('Failed to load conversations');
            
            const conversations = await response.json();
            this.renderConversationList(conversations);
        } catch (error) {
            console.error('Load conversations error:', error);
            alert('Не удалось загрузить диалоги');
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
    }

    async loadChat(chatId) {
        try {
            const response = await fetch(`/api/load_conversation/${chatId}`);
            if (!response.ok) throw new Error('Failed to load chat');
            
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
            console.error('Load chat error:', error);
            alert('Не удалось загрузить чат');
        }
    }

    async deleteChat(chatId) {
        if (!confirm('Удалить этот диалог?')) return;
        
        try {
            const response = await fetch(`/api/delete_chat/${chatId}`, { 
                method: 'POST' 
            });
            
            if (!response.ok) throw new Error('Delete failed');
            
            if (this.currentChat?.id === chatId) {
                this.currentChat = null;
                this.elements.chatContainer.innerHTML = '';
            }
            this.loadConversations();
        } catch (error) {
            console.error('Delete chat error:', error);
            alert('Ошибка при удалении');
        }
    }

    async showRenameDialog(chatId) {
        const newName = prompt('Введите новое название:');
        if (!newName?.trim()) return;

        try {
            const response = await fetch(`/api/rename_chat/${chatId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: newName.trim() })
            });
            
            if (!response.ok) throw new Error('Rename failed');
            
            this.loadConversations();
        } catch (error) {
            console.error('Rename chat error:', error);
            alert('Ошибка при переименовании');
        }
    }

    newChat() {
        if (!this.currentChat || confirm('Начать новый диалог? Текущий чат будет закрыт.')) {
            this.currentChat = null;
            this.elements.chatContainer.innerHTML = '';
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChatApp();
});