export class Message {
    constructor(role, content, timestamp = new Date().toISOString()) {
        this.role = role;          // 'user' или 'assistant'
        this.content = content;    // текст сообщения
        this.timestamp = timestamp;
    }
}
