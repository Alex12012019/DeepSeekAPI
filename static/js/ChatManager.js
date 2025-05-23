import { Chat } from './Chat.js';
import { Message } from './Message.js';

export class ChatManager {
    constructor() {
        this.chats = [];
        this.currentChat = null;
    }

    createChat(name) {
        const chat = new Chat({ name, isNew: true });
        this.chats.push(chat);
        this.currentChat = chat;
        return chat;
    }

    loadChatById(id) {
        this.currentChat = this.chats.find(chat => chat.id === id) || null;
        return this.currentChat;
    }

    deleteChatById(id) {
        this.chats = this.chats.filter(chat => chat.id !== id);
        if (this.currentChat?.id === id) this.currentChat = null;
    }

    getChatList() {
        return this.chats.map(chat => ({
            id: chat.id,
            name: chat.name,
            updated: chat.updated,
            filename: chat.filename
        }));
    }

    serializeChats() {
        return JSON.stringify(this.chats.map(chat => chat.toJSON()), null, 2);
    }

    loadFromJSON(jsonData) {
        const rawChats = JSON.parse(jsonData);
        this.chats = rawChats.map(chatData => new Chat(chatData));
    }

    loadChats(conversations) {
        this.chats = conversations.map(chat => new Chat(chat));
        //this.chats = conversations.map(chat => ({
        //                        id: chat.id, 
        //                        name: chat.name || 'Без названия',
        //                        filename: chat.filename || 'Файл без названия',
        //                        created: chat.created || new Date().toISOString(),
        //                        updated: chat.updated || new Date().toISOString(),
        //                        messages: chat.messages || []
        //}));
    }

    addMessageToChat(chatId, role, content) {
        const chat = this.loadChatById(chatId);

        if (!chat) return false;

        if (chat.messages.length > 0) {
            const lastMessage = chat.messages[chat.messages.length - 1];
            if ((lastMessage.role == role) && (lastMessage.content == content)) return false;
        }

        const message = new Message(role, content);
        chat.addMessage(message);

        return true;
    }

}
