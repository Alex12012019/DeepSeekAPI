class ChatApp {
    constructor() {
        try {
            // 1. Проверка обязательных элементов DOM
            this.checkRequiredElements();
            
            // 2. Инициализация состояния приложения
            this.currentChat = this.createNewChat();
            this.autoSaveInterval = null;
            this.currentUploadAbortController = null;
            this.elements = this.initElements();
            
            // 3. Настройка обработчиков событий
            this.bindEvents();
            
            // 4. Инициализация компонентов
            this.initElements();
            this.initLoader();  // Теперь этот метод определен
            this.initFileUpload();
            this.bindEvents();
            
            // 5. Загрузка данных
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
                this.sendMessage();
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
        this.startAutoSave();

        this.elements.conversationList.addEventListener('click', (event) => this.loadChat(event));
        this.isOne = false;
    }

    // ==================== РАБОТА С ЧАТАМИ ====================

    createNewChat() {
        return {
            id: 'tmp-' + Date.now(),
            name: "Новый чат",
            filename: "",
            created: "",
            updated: "",
            messages: [],
            fileAnalysis: [],
            isNew: true
        };
    }

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
            
            this.renderConversationList(conversations);
            
        } catch (error) {
            console.error("Ошибка загрузки диалогов:", error);
            this.showError("Не удалось загрузить список чатов");
            // Показываем пустой список при ошибке
            this.renderConversationList([]);
        }
    }

    renderConversationList(conversations) {
        const container = this.elements.conversationList;
        
        if (!container) return;

        // Очищаем контейнер
        container.innerHTML = '';

        // Если диалогов нет
        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<div class="no-conversations">Нет сохранённых диалогов</div>';
            return;
        }

        // Обрабатываем каждый диалог
        conversations.forEach(chat => {
            // Поддерживаем разные форматы объектов чата

            const chatId = chat.id;
            const chatName = chat.name || 'Без названия';
            const chatFileName = chat.filename || 'Файл без названия';
            const chatCreated = chat.created || new Date().toISOString();
            const chatUpdated = chat.updated || new Date().toISOString();

            if (!chatId) {
                console.warn("Некорректный формат чата:", chat);
                return;
            }

            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.dataset.id = chatId;
            item.dataset.fileName = chatFileName;
            
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

    async loadChat(event) {

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
                alert("rename")
                return;
            }
            if (event.target.closest('.delete-btn')) {
                await this.deleteChat(fileName);
                return;
            }
        }

        try {
            const response = await fetch(`/api/load_conversation/${fileName}`);
            
            if (!response.ok) {
                throw new Error(`Ошибка загрузки чата: ${response.status}`);
            }

            const data = await response.json();
            
            // Обновляем текущий чат
            this.currentChat = {
                id: chatId,
                name: data.name || "Без названия",
                filename: data.filename,
                created: data.created,
                updated: data.updated,
                messages: data.messages || [],
                fileAnalysis: data.fileAnalysis || [],
                isNew: false
            };

            // Очищаем и перерисовываем сообщения
            this.elements.chatContainer.innerHTML = '';
            this.currentChat.messages.forEach(msg => {
                this.addMessage(msg.role, msg.content);
            });

            // Добавляем анализ файлов если есть
            if (data.fileAnalysis?.length) {
                data.fileAnalysis.forEach(file => {
                    this.addMessage('assistant', `[Файл] ${file.name}:\n${file.content}`);
                });
            }

        } catch (error) {
            console.error("Ошибка загрузки чата:", error);
            this.showError(`Не удалось загрузить чат: ${error.message}`);
        }
    }

    async saveChat(showAlert = true) {
        try {
            // Проверка на пустые чаты
            if (this.currentChat.messages.length === 0) {
                if (showAlert) alert("Нет сообщений для сохранения");
                return;
            }

            if (this.isOne) return;
            this.isOne = true;

            // Запрос имени для нового чата
            if (this.currentChat.isNew) {
                const newName = prompt("Введите название чата:", this.currentChat.name);
                if (!newName) return;
                this.currentChat.name = newName;
                this.currentChat.id = "id_" + newName;
            }

            // Подготовка данных для сохранения
            const saveData = {
                id: this.currentChat.id,
                name: this.currentChat.name,
                filename: this.currentChat.filename,
                created: this.currentChat.created,
                updated: this.currentChat.updated,
                messages: this.currentChat.messages,
                fileAnalysis: this.currentChat.fileAnalysis,
                isNew: this.currentChat.isNew
            };

            // Отправка на сервер
            const response = await fetch('/api/save_conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData)
            });

            if (!response.ok) {
                throw new Error(`Ошибка сохранения: ${response.status}`);
            }

            const result = await response.json();
            
            // Обновляем состояние чата
            this.currentChat.id = result.id;
            this.currentChat.isNew = false;
            
            // Обновляем список чатов
            await this.loadConversations();
            
            if (showAlert) alert("Чат успешно сохранён");

            this.isOne = false;

        } catch (error) {
            console.error("Ошибка сохранения чата:", error);
            this.showError(`Ошибка сохранения: ${error.message}`);
        }
    }

    async newChat() {
        // Проверяем необходимость сохранения
        if (this.currentChat.messages.length > 0 && 
            !confirm("Начать новый чат? Несохранённые изменения будут потеряны.")) {
            return;
        }

        // Отменяем текущую загрузку файла если есть
        if (this.currentUploadAbortController) {
            this.currentUploadAbortController.abort();
        }

        // Создаём новый чат
        this.currentChat = this.createNewChat();
        this.elements.chatContainer.innerHTML = '';
    }

    // ==================== РАБОТА С СООБЩЕНИЯМИ ====================

    async sendMessage() {
        const messageText = this.elements.userInput.value.trim();
        if (!messageText) return;

        try {
            // Добавляем сообщение пользователя
            this.addMessage('user', messageText);
            this.elements.userInput.value = '';
            this.setLoadingState(true);

            // Отправляем на сервер
            const response = await fetch('/api/send_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    messages: this.currentChat.messages,
                    chatId: this.currentChat.id
                })
            });

            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }

            const data = await response.json();
            
            // Добавляем ответ ассистента
            this.addMessage('assistant', data.response);
            
            // Обновляем историю сообщений
            this.currentChat.messages = data.updatedMessages || [];

        } catch (error) {
            console.error("Ошибка отправки сообщения:", error);
            this.addMessage('assistant', `Ошибка: ${error.message}`);
        } finally {
            this.setLoadingState(false);
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
        
        // Добавляем в историю (кроме системных сообщений)
        if (role !== 'system') {
            this.currentChat.messages.push({ role, content });
        }
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
        }, 30000); // Каждые 30 секунд

        window.addEventListener('beforeunload', () => {
            if (this.currentChat.messages.length > 0) {
                this.saveChat(false);
            }
        });
    }

    setLoadingState(isLoading) {
        this.elements.sendButton.disabled = isLoading;
        this.elements.sendButton.innerHTML = isLoading 
            ? '<div class="spinner"></div>' 
            : 'Отправить';
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