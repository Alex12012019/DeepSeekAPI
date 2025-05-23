import { ChatManager } from './ChatManager.js';

class ChatApp {
    constructor() {
        try {
            // 1. Проверка обязательных элементов DOM
            this.checkRequiredElements();
            
            // 2. Инициализация состояния приложения
            this.ActiveChatId = null;
            this.autoSaveInterval = null;
            this.currentUploadAbortController = null;
            this.elements = this.initElements();
            
            // 3. Настройка обработчиков событий
            this.bindEvents();
            
            // 4. Инициализация компонентов
            this.initLoader();  // Теперь этот метод определен
            this.initFileUpload();
            
            // 5. Загрузка данных
            this.manager = null;
            this.loadConversations();
            
            console.log("ChatApp успешно инициализирован");
        } catch (error) {
            console.error("Ошибка инициализации ChatApp:", error);
            throw error;
        }
    }

    // ==================== ОСНОВНЫЕ МЕТОДЫ ====================
    initLoader() {
        this.elements.loader = document.getElementById('loader');
        this.elements.fileProgress = document.getElementById('file-progress');
        this.elements.fileName = document.getElementById('file-name');
        this.elements.fileInfo = document.getElementById('file-info');
        
        if (!this.elements.loader) {
            console.warn("Элемент #loader не найден");
        }
    }

    initFileUpload() {
        this.elements.fileUpload = document.getElementById('file-upload');
        if (!this.elements.fileUpload) {
            console.warn("Элемент #file-upload не найден");
        }
    }

    checkRequiredElements() {
        const requiredElements = [
            'chat-container', 'conversation-list',
            'user-input', 'send-button'
        ];
        
        const missingElements = requiredElements.filter(id => !document.getElementById(id));
        
        if (missingElements.length > 0) {
            throw new Error(`Отсутствуют обязательные элементы: ${missingElements.join(', ')}`);
        }
    }

    initElements() {
        return {
            chatContainer: document.getElementById('chat-container'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            conversationList: document.getElementById('conversation-list'),
            newChatBtn: document.getElementById('new-chat'),
            saveButton: document.getElementById('save-chat'),
            fileUpload: document.getElementById('file-upload'),
            loader: document.getElementById('loader'),
            fileProgress: document.getElementById('file-progress'),
            fileName: document.getElementById('file-name'),
            fileInfo: document.getElementById('file-info')
        };
    }

    bindEvents() {
        // Обработка отправки сообщений
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        this.elements.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.elements.sendButton.disabled) {
                    this.sendMessage();
                }
            }
        });

        // Управление чатами
        this.elements.newChatBtn.addEventListener('click', () => this.newChat());
        this.elements.saveButton.addEventListener('click', () => this.saveChat());

        // Загрузка файлов
        this.elements.fileUpload.addEventListener('change', (e) => {
            if (e.target.files[0]) this.handleFileUpload(e.target.files[0]);
        });

        // Автосохранение
        //this.startAutoSave();

        this.elements.conversationList.addEventListener('click', (event) => this.DoAction(event));
    }

    // ==================== РАБОТА С ЧАТАМИ ====================
    async loadConversations() {
        try {
            const response = await fetch('/api/get_conversations');

            console.log("response:", response);

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            
            console.log("Raw API response:", data); // Логируем сырой ответ

            // Улучшенная проверка формата данных
            if (!data || typeof data !== 'object') {
                throw new Error("Пустой ответ от сервера");
            }

            // Проверяем разные возможные форматы ответа
            const conversations = data || [];

            if (!Array.isArray(conversations)) {
                throw new Error("Данные диалогов должны быть массивом");
            }
            
            this.manager = new ChatManager();
            this.ActiveChatId = null;
            this.manager.loadChats(conversations);
            this.renderConversationList();
            
        } catch (error) {
            console.error("Ошибка загрузки диалогов:", error);
            this.showError("Не удалось загрузить список чатов");
            // Показываем пустой список при ошибке
            this.renderConversationList();
        }
    }

    renderConversationList() {

        const container = this.elements.conversationList;
        if (!container) return;

        // Очищаем контейнер
        container.innerHTML = '';
        
        const conversations = this.manager.getChatList();

        // Если диалогов нет
        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<div class="no-conversations">Нет сохранённых диалогов</div>';
            return;
        }

        // Обрабатываем каждый диалог
        conversations.forEach(chat => {
            const chatId = chat.id;
            const chatName = chat.name || 'Без названия';
            const chatUpdated = chat.updated || new Date().toISOString();

            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.dataset.id = chatId;
            item.dataset.fileName = chat.filename;
            
            item.innerHTML = `
                <div class="conversation" data-chat-id="${chatId}">
                    <div class="conv-content">
                        <div class="conv-name">${chatName}</div>
                        <div class="conv-date">${new Date(chatUpdated).toLocaleString()}</div>
                    </div>
                    <div class="conv-actions">
                        <button class="rename-btn">✏️</button>
                        <button class="delete-btn">🗑️</button>
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }

    async deleteChat(fileName) {
        if (this.isOne) return;
        this.isOne = true;

        if (!confirm('Удалить этот диалог?')) {
            this.isOne = false;
            return;
        }
        
        try {
            const response = await fetch(`/api/delete_chat/${fileName}`, { 
                method: 'POST' 
            });
            
            if (!response.ok) throw new Error('Delete failed');
            
            this.currentChat = null;
            this.elements.chatContainer.innerHTML = '';

            this.loadConversations();
        } catch (error) {
            console.error('Delete chat error:', error);
            alert('Ошибка при удалении');
        }
        this.isOne = false;
    }

    async DoAction(event) {

        const item = event.target.closest('.conversation-item');
        if (!item) return;

        // Получаем chatId
        const convBlock = item.querySelector('.conversation');
        const chatId = convBlock?.dataset?.chatId;
        
        // Получаем имя файла
        const fileName = item.dataset?.fileName; // Обрати внимание: не "data--file-name", а "fileName"

        console.log('chatId:', chatId);
        console.log('fileName:', fileName);

        if (event.target.closest('.rename-btn') || event.target.closest('.delete-btn')) {
            if (event.target.closest('.rename-btn')) {
                    const chatId = convBlock?.dataset?.chatId;
                    const currentName = this.manager.loadChatById(chatId)?.name || '';
                    this.renameChat(chatId, currentName);
                return;
            }
            if (event.target.closest('.delete-btn')) {
                await this.deleteChat(fileName);
                return;
            }
        }

        this.ActiveChatId = chatId;
        this.loadChat();
    }


    loadChat() {
        try {

            // Очищаем и перерисовываем сообщения
            this.elements.chatContainer.innerHTML = '';
            this.elements.userInput.value = "";
            
            const activeChat = this.manager.loadChatById(this.ActiveChatId);
            console.error("Текущий чат Id:", this.ActiveChatId);
            console.error("Текущий чат:", activeChat.messages);

            const titleElement = document.getElementById('chat-title');
            titleElement.textContent = activeChat.name;
            
            activeChat.messages.forEach((msg, index) =>{
                this.addMessage(msg.role, msg.content);
            });

            // Добавляем анализ файлов если есть
            //if (data.fileAnalysis?.length) {
            //    data.fileAnalysis.forEach(file => {
            //        this.addMessage('assistant', `[Файл] ${file.name}:\n${file.content}`);
            //    });
            //}

        } catch (error) {
            console.error("Ошибка загрузки чата:", error);
            this.showError(`Не удалось загрузить чат: ${error.message}`);
        }
    }

    async saveChat(showAlert = true) {
        try {
            const activeChat = this.manager.loadChatById(this.ActiveChatId);
            
            if (!activeChat) {
                if (showAlert) alert("Чат не найден");
                return;
            }

            // Проверка на пустые чаты
            if (!activeChat.isEdit && activeChat.messages.length > 0) {
                if (showAlert) alert("Чат не менялся");
                return;
            }

            if (activeChat.messages.length === 0) {
                if (showAlert) alert("Нет сообщений для сохранения");
                return;
            }

            // Для новых чатов запрашиваем подтверждение имени
            if (activeChat.isNew) {
                const newName = prompt("Введите название чата:", activeChat.name);
                if (!newName) return;
                activeChat.name = newName.trim();
            }

            // Отправка на сервер
            const response = await fetch('/api/save_conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activeChat.toJSON())
            });

            if (!response.ok) {
                throw new Error(`Ошибка сохранения: ${response.status}`);
            }

            const result = await response.json();
            
            // Обновляем список чатов
            await this.loadConversations();
            
            if (showAlert) alert("Чат успешно сохранён");

            this.ActiveChatId = result.id;
            this.loadChat();

        } catch (error) {
            console.error("Ошибка сохранения чата:", error);
            this.showError(`Ошибка сохранения: ${error.message}`);
        }
    }

    async newChat() {
        // Проверяем необходимость сохранения
        try {
            const currentChat = this.manager.loadChatById(this.ActiveChatId);
            if (currentChat?.isEdit) {
                if (!confirm("Начать новый чат? Несохранённые изменения будут потеряны.")) {
                    return;
                }
            }
        } catch (error) {
            console.error("Ошибка при проверке текущего чата:", error);
            alert("Ошибка при проверке текущего чата:");
        }

        // Отменяем текущую загрузку файла если есть
        if (this.currentUploadAbortController) {
            this.currentUploadAbortController.abort();
        }

        // Создаём новый чат
        const chat = this.manager.createChat("Новый чат");
        this.ActiveChatId = chat.id;
        this.renderConversationList();
        this.loadChat();
    }

    async renameChat(chatId, currentName) {
        try {
            const newName = prompt("Введите новое название чата:", currentName);
            
            if (!newName || newName.trim() === currentName) {
                return; // Пользователь отменил или оставил прежнее название
            }
            
            // Обновляем название в менеджере чатов
            const chat = this.manager.loadChatById(chatId);
            if (chat) {
                chat.name = newName.trim();
                chat.isEdit = true; // Помечаем как измененный
                
                // Если чат уже сохранен (не новый), обновляем на сервере
                if (!chat.isNew) {
                    await this.saveChat(false); // Сохраняем без уведомления
                }
                
                // Обновляем UI
                this.renderConversationList();
                
                // Если это активный чат, обновляем заголовок
                if (this.ActiveChatId === chatId) {
                    const titleElement = document.getElementById('chat-title');
                    if (titleElement) {
                        titleElement.textContent = newName.trim();
                    }
                }
            }
        } catch (error) {
            console.error("Ошибка переименования чата:", error);
            this.showError("Не удалось переименовать чат");
        }
    }

    // ==================== РАБОТА С СООБЩЕНИЯМИ ====================

    async sendMessage() {
        const messageText = this.elements.userInput.value.trim();
        
        if (!messageText) return;
        
       
        try {

            // Устанавливаем состояние загрузки
            this.setLoadingState(true);

            if (!this.manager.addMessageToChat(this.ActiveChatId, "user", messageText)) {
                alert("Сообщение не добавлено!!!")
                this.setLoadingState(false); // Возвращаем кнопку в исходное состояние
                return;
            }

            // Очищаем поле ввода
            this.elements.userInput.value = "";

            // Отправляем на сервер
            const response = await fetch('/api/send_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: this.manager.loadChatById(this.ActiveChatId).messages,
                    chatId: this.ActiveChatId
                })
            });

            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }

            const data = await response.json();
            
            // Добавляем ответ ассистента
            this.manager.addMessageToChat(this.ActiveChatId, "assistant", data.assistant_reply)

        } catch (error) {
            console.error("Ошибка отправки сообщения:", error);
            this.manager.addMessageToChat(this.ActiveChatId, "assistant", `Ошибка: ${error.message}`)
            
        } finally {
            this.setLoadingState(false);
            this.loadChat();
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
        
        // Добавляем кнопку копирования для ответов ассистента
        if (role === 'assistant') {
            this.addCopyButton(messageDiv, content);
        }
        
        // Прокручиваем к новому сообщению
        this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
    }

    addCopyButton(container, text) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.innerHTML = '📋';
        btn.title = 'Копировать текст';
        
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(text)
                .then(() => {
                    btn.innerHTML = '✓';
                    setTimeout(() => btn.innerHTML = '📋', 2000);
                })
                .catch(err => console.error("Ошибка копирования:", err));
        });
        
        container.appendChild(btn);
    }

    // ==================== РАБОТА С ФАЙЛАМИ ====================

    async handleFileUpload(file) {
        if (!this.validateFile(file)) return;

        try {
            // Настройка загрузки
            this.currentUploadAbortController = new AbortController();
            this.showLoader(true);
            this.updateFileInfo(`Загрузка ${file.name}...`, 20);

            // Чтение файла
            const fileContent = await this.readFileContent(file);
            this.updateFileInfo(`Обработка...`, 50);

            // Отправка на анализ
            const analysisResult = await this.analyzeFile(file, fileContent);
            this.updateFileInfo(`Готово!`, 100);

            // Добавляем результат в чат
            this.addFileAnalysisResult(file, analysisResult);

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Ошибка обработки файла:", error);
                this.addMessage('system', `Ошибка обработки файла: ${error.message}`);
            }
        } finally {
            this.finalizeFileUpload();
        }
    }

    validateFile(file) {
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        const allowedTypes = [
            'text/plain', 
            'application/pdf', 
            'application/json'
        ];

        if (file.size > MAX_SIZE) {
            this.showError(`Файл слишком большой (максимум ${MAX_SIZE/1024/1024}MB)`);
            return false;
        }

        if (!allowedTypes.includes(file.type)) {
            this.showError("Неподдерживаемый тип файла");
            return false;
        }

        return true;
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Ошибка чтения файла"));
            
            if (file.type === 'application/pdf') {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        });
    }

    async analyzeFile(file, content) {
        const response = await fetch('/api/analyze_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: file.name,
                content: content,
                chatId: this.currentChat.id
            }),
            signal: this.currentUploadAbortController.signal
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || "Ошибка анализа файла");
        }

        return await response.json();
    }

    addFileAnalysisResult(file, result) {
        const fileMessage = {
            role: 'assistant',
            content: `Анализ файла "${file.name}":\n${result.analysis}`,
            isFileAnalysis: true,
            fileMeta: {
                name: file.name,
                size: file.size,
                type: file.type,
                analysisDate: new Date().toISOString()
            }
        };

        // Добавляем в историю сообщений
        this.currentChat.messages.push(fileMessage);
        
        // Добавляем в отдельный список файлов
        this.currentChat.fileAnalysis.push({
            name: file.name,
            content: result.analysis
        });

        // Отображаем в чате
        this.addMessage(fileMessage.role, fileMessage.content);
    }

    finalizeFileUpload() {
        if (this.currentUploadAbortController) {
            this.currentUploadAbortController.abort();
            this.currentUploadAbortController = null;
        }

        setTimeout(() => {
            this.updateFileInfo('', 0);
            this.showLoader(false);
            this.elements.fileUpload.value = '';
        }, 1000);
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================

    startAutoSave() {
        this.autoSaveInterval = setInterval(() => {
            if (this.currentChat.messages.length > 0) {
                this.saveChat(false); // Автосохранение без уведомления
            }
        }, 300000); // Каждые 300 секунд

        window.addEventListener('beforeunload', () => {
            if (this.currentChat.messages.length > 0) {
                this.saveChat(false);
            }
        });
    }

    setLoadingState(isLoading) {
        const btn = this.elements.sendButton;
        btn.disabled = isLoading;
        
        if (isLoading) {
            btn.classList.add('loading');
            btn.innerHTML = '<span class="spinner"></span> Отправка...';
        } else {
            btn.classList.remove('loading');
            btn.innerHTML = 'Отправить';
        }
    }

    showLoader(show) {
        this.elements.loader.style.display = show ? 'block' : 'none';
    }

    updateFileInfo(text = '', percent = 0) {
        this.elements.fileName.textContent = text;
        this.elements.fileProgress.value = percent;
        this.elements.fileInfo.style.display = text ? 'block' : 'none';
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}


// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.app = new ChatApp();
    } catch (error) {
        console.error("Фатальная ошибка:", error);
        
        // Создаем информативное сообщение об ошибке
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            max-width: 80%;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <h3 style="margin-top:0">Ошибка загрузки чата</h3>
            <p>${error.message || "Неизвестная ошибка"}</p>
            <button onclick="window.location.reload()" 
                    style="background:#c62828; color:white; border:none; padding:5px 10px; border-radius:3px; margin-top:10px;">
                Обновить страницу
            </button>
        `;
        
        document.body.appendChild(errorDiv);
    }
})