class ChatApp {
    constructor() {
        this.currentChat = this.createNewChat();
        this.autoSaveInterval = null;
        this.initElements();
        this.bindEvents();
        this.loadConversations();
        this.startAutoSave();
    }

    createNewChat() {
        return {
            id: 'tmp-' + Date.now(), // Временный ID для новых чатов
            name: "Новый чат",
            messages: [],
            isNew: true
        };
    }
    
    initElements() {
        this.elements = {
            chatContainer: document.getElementById('chat-container'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            conversationList: document.getElementById('conversation-list'),
            newChatBtn: document.getElementById('new-chat'),
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

        this.elements.saveButton = document.getElementById('save-chat');
        this.elements.saveButton.addEventListener('click', () => this.saveChat());

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

        // Сохранение чата
        //if (e.target.closest('#save-chat') || e.target.id === 'save-chat') {
        //    this.saveChat();
        //    return;
        //}

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
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            console.log("Loaded conversations:", data); // Для отладки
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.renderConversationList(data);
        } catch (error) {
            console.error("Load conversations error:", error);
            this.showError("Ошибка загрузки диалогов");
        }
    }

    renderConversationList(conversations) {
    // Очищаем список перед обновлением
    this.elements.conversationList.innerHTML = '';

    if (conversations.length === 0) {
        this.elements.conversationList.innerHTML = `
            <div class="no-conversations">
                Нет сохраненных диалогов
            </div>
        `;
        return;
    }

    conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.dataset.id = conv.filename;
            
            item.innerHTML = `
                <div class="conv-content">
                    <div class="conv-name">${conv.name}</div>
                    <div class="conv-date">${new Date(conv.date).toLocaleString()}</div>
                </div>
                <div class="conv-actions">
                    <button class="rename-btn" title="Переименовать">✏️</button>
                    <button class="delete-btn" title="Удалить">🗑️</button>
                </div>
            `;
            
            this.elements.conversationList.appendChild(item);
        });
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

    startAutoSave() {
        // Автосохранение каждые 30 секунд
        this.autoSaveInterval = setInterval(() => {
            if (this.currentChat?.messages?.length > 0) {
                this.saveChat(false); // silent mode
            }
        }, 30000);
        
        // Сохранение при закрытии вкладки
        window.addEventListener('beforeunload', (e) => {
            if (this.currentChat?.messages?.length > 0) {
                this.saveChat(false);
            }
        });
    }

    showStatusMessage(text, duration) {
        const status = document.createElement('div');
        status.className = 'status-message';
        status.textContent = text;
        document.body.appendChild(status);
        setTimeout(() => status.remove(), duration);
    }

    async saveChat(showAlert = true) {
        try {
            // Проверка на пустые сообщения
            if (!this.currentChat.messages?.length) {
                if (showAlert) alert('Нет сообщений для сохранения');
                return;
            }

            // Запрос имени для нового чата
            if (this.currentChat.isNew) {
                const newName = prompt("Введите название чата:", this.currentChat.name);
                if (!newName) return; // Отмена сохранения
                this.currentChat.name = newName;
            }

            // Отправка на сервер
            const response = await fetch('/api/save_conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: this.currentChat.messages,
                    filename: this.currentChat.isNew ? null : this.currentChat.id,
                    name: this.currentChat.name
                })
            });

            const data = await response.json();
            
            // Обновляем состояние чата (важно ДО показа alert)
            this.currentChat = {
                id: data.filename,
                name: data.name,
                messages: this.currentChat.messages,
                isNew: false
            };

            // Показываем уведомление ТОЛЬКО если явно запрошено
            if (showAlert) {
                alert(this.currentChat.isNew ? "Чат сохранён" : "Чат обновлён");
            }

            this.loadConversations();

        } catch (error) {
            console.error('Ошибка сохранения:', error);
            if (showAlert) alert('Ошибка сохранения: ' + error.message);
        }
    }

    newChat() {
        if (!this.currentChat.messages.length || confirm('Начать новый чат? Несохранённые изменения будут потеряны.')) {
            this.currentChat = this.createNewChat();
            this.elements.chatContainer.innerHTML = '';
        }
    }

    async loadChat(chatId) {
        try {
            const response = await fetch(`/api/load_conversation/${chatId}`);
            const data = await response.json();
            
            this.currentChat = {
                id: chatId,
                name: data.name || "Без названия",
                messages: data.messages || [],
                isNew: false
            };
            
            this.renderMessages();
            
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            alert('Не удалось загрузить чат');
        }
    }

    renderMessages() {
        this.elements.chatContainer.innerHTML = '';
        this.currentChat.messages.forEach(msg => {
            this.addMessage(msg.role, msg.content);
        });
    }

}


// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.app = new ChatApp();
    } catch (e) {
        alert("Ошибка при создании ChatApp: " + e.message);
    }
});