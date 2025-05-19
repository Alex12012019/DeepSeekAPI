import os
import json
import logging
from flask import Flask, request, jsonify, render_template
from pathlib import Path
import datetime
import re
from openai import OpenAI

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log')
    ]
)
logger = logging.getLogger(__name__)

# Загрузка конфигурации
def load_config():
    try:
        with open('config.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Ошибка загрузки config.json: {str(e)}")
        raise RuntimeError(f"Ошибка загрузки config.json: {str(e)}")

config = load_config()

# Инициализация Flask
app = Flask(__name__)
app.secret_key = config['app']['secret_key']
UPLOAD_FOLDER = config['app']['upload_folder']
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Инициализация клиента OpenAI
client = OpenAI(
    api_key=config['openai']['api_key'],
    base_url=config['openai']['base_url']
)

# Вспомогательные функции
def sanitize_filename(name):
    """Очищает имя файла от спецсимволов"""
    return re.sub(r'[\\/*?:"<>|]', "", name)[:50]

def generate_chat_name(messages):
    """Генерирует имя чата на основе первого сообщения"""
    first_user_msg = next((msg for msg in messages if msg["role"] == "user"), None)
    return sanitize_filename(first_user_msg["content"][:30] + "...") if first_user_msg else "Новый чат"

# API Endpoints
@app.route('/')
def home():
    logger.debug("Запрос главной страницы")
    return render_template('index.html')

@app.route('/api/get_conversations')
def get_conversations():
    try:
        conversations = []
        for filename in os.listdir(UPLOAD_FOLDER):
            if filename.endswith('.json'):
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    conversations.append({
                        'filename': filename,
                        'name': data.get('meta', {}).get('name', generate_chat_name(data.get('messages', []))),
                        'date': os.path.getmtime(filepath) * 1000  # JavaScript timestamp
                    })
                except Exception as e:
                    logger.error(f"Ошибка загрузки {filename}: {str(e)}")
        
        conversations.sort(key=lambda x: x['date'], reverse=True)
        logger.debug(f"Возвращено {len(conversations)} диалогов")
        return jsonify(conversations)
    except Exception as e:
        logger.error(f"Ошибка в get_conversations: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/load_conversation/<filename>')
def load_conversation(filename):
    try:
        if not filename.endswith('.json') or '/' in filename:
            logger.warning(f"Некорректное имя файла: {filename}")
            return jsonify({'error': 'Invalid filename'}), 400
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            logger.warning(f"Файл не найден: {filename}")
            return jsonify({'error': 'File not found'}), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        logger.debug(f"Загружен диалог {filename} с {len(data.get('messages', []))} сообщениями")
        return jsonify({
            'messages': data.get('messages', []),
            'name': data.get('meta', {}).get('name', 'Без названия')
        })
    except Exception as e:
        logger.error(f"Ошибка загрузки диалога {filename}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/send_message', methods=['POST'])
def send_message():
    try:
        data = request.json
        user_message = data.get('message', '')
        conversation = data.get('messages', [])
        
        if not user_message:
            logger.warning("Пустое сообщение")
            return jsonify({'error': 'Empty message'}), 400
        
        messages = [{"role": msg["role"], "content": msg["content"]} for msg in conversation]
        messages.append({"role": "user", "content": user_message})
        
        logger.debug(f"Отправка сообщения (история: {len(messages)} сообщений)")
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.7,
            max_tokens=2000
        )
        
        assistant_reply = response.choices[0].message.content
        new_messages = conversation + [
            {"role": "user", "content": user_message, "timestamp": datetime.datetime.now().isoformat()},
            {"role": "assistant", "content": assistant_reply, "timestamp": datetime.datetime.now().isoformat()}
        ]
        
        logger.debug("Успешный ответ от API")
        return jsonify({
            'status': 'success',
            'assistant_reply': assistant_reply,
            'messages': new_messages
        })
    except Exception as e:
        logger.error(f"Ошибка отправки сообщения: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'messages': conversation
        }), 500

@app.route('/api/save_conversation', methods=['POST'])
def save_conversation():
    try:
        data = request.json
        messages = data.get('messages', [])
        custom_name = data.get('name', '').strip()
        
        if not messages:
            logger.warning("Попытка сохранения пустого диалога")
            return jsonify({'error': 'Empty conversation'}), 400
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        name = sanitize_filename(custom_name) if custom_name else generate_chat_name(messages)
        filename = f"conv_{timestamp}_{name}.json"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                'meta': {
                    'name': name,
                    'created': datetime.datetime.now().isoformat()
                },
                'messages': messages
            }, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Сохранен новый диалог: {filename}")
        return jsonify({
            'status': 'success',
            'filename': filename,
            'name': name
        })
    except Exception as e:
        logger.error(f"Ошибка сохранения диалога: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete_chat/<filename>', methods=['POST'])
def delete_chat(filename):
    try:
        if not filename.endswith('.json') or '/' in filename:
            logger.warning(f"Некорректное имя файла для удаления: {filename}")
            return jsonify({'error': 'Invalid filename'}), 400
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            logger.warning(f"Файл для удаления не найден: {filename}")
            return jsonify({'error': 'File not found'}), 404
        
        os.remove(filepath)
        logger.info(f"Удален диалог: {filename}")
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Ошибка удаления {filename}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/rename_chat/<filename>', methods=['POST'])
def rename_chat(filename):
    try:
        if not filename.endswith('.json') or '/' in filename:
            logger.warning(f"Некорректное имя файла для переименования: {filename}")
            return jsonify({'error': 'Invalid filename'}), 400
        
        new_name = request.json.get('new_name', '').strip()
        if not new_name:
            logger.warning("Пустое новое имя для переименования")
            return jsonify({'error': 'New name required'}), 400
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            logger.warning(f"Файл для переименования не найден: {filename}")
            return jsonify({'error': 'File not found'}), 404
        
        with open(filepath, 'r+', encoding='utf-8') as f:
            data = json.load(f)
            data['meta']['name'] = new_name
            f.seek(0)
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.truncate()
        
        logger.info(f"Переименован диалог {filename} -> {new_name}")
        return jsonify({
            'status': 'success',
            'new_name': new_name
        })
    except Exception as e:
        logger.error(f"Ошибка переименования {filename}: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Запуск приложения")
    app.run(debug=True, port=5000)